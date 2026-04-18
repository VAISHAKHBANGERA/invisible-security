import * as vscode from 'vscode';
import axios from 'axios';
import { scanPackageJson } from './scanner'; 
import { SecurityQuickFix, ThreatHoverProvider, SecurityCodeLensProvider } from './uiProviders';

let typingTimer: NodeJS.Timeout | undefined = undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Invisible Security: Engine and UI are linked!');

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(shield) Invisible Sec: Safe";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    diagnosticCollection = vscode.languages.createDiagnosticCollection('invisible-security');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(vscode.languages.registerCodeActionsProvider(['javascript', 'typescript'], new SecurityQuickFix()));
    context.subscriptions.push(vscode.languages.registerHoverProvider(['javascript', 'typescript'], new ThreatHoverProvider()));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['javascript', 'typescript'], new SecurityCodeLensProvider()));

    let fixCommand = vscode.commands.registerCommand('invisible-security.hoverFix', (uri: vscode.Uri, range: vscode.Range, actionString: string) => {
        const edit = new vscode.WorkspaceEdit();
        if (actionString === 'DELETE') {
            edit.delete(uri, range); 
        } else {
            edit.replace(uri, range, actionString); 
        }
        vscode.workspace.applyEdit(edit);
    });
    context.subscriptions.push(fixCommand);

    let workspaceScanCommand = vscode.commands.registerCommand('invisible-security.scanWorkspace', async () => {
        try {
            await scanPackageJson();
        } catch (err) {
            vscode.window.showErrorMessage("Workspace Scan failed. Is the Backend running?");
        }
    });
    context.subscriptions.push(workspaceScanCommand);

    let documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            scanCurrentLine(event.document, event.contentChanges);
        }, 1000); 
    });
    context.subscriptions.push(documentChangeListener);
}

async function scanCurrentLine(document: vscode.TextDocument, changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    if (changes.length === 0) return;

    const changedLineNumber = changes[0].range.start.line;
    const lineText = document.lineAt(changedLineNumber).text;
    
    const match = /(?:import\s+.*\s+from|import|require)\s*['"]([^'"]+)['"]/.exec(lineText);

    // Get current diagnostics to modify them selectively
    let currentDiagnostics = [...(diagnosticCollection.get(document.uri) || [])];

    if (match && match[1]) {
        const packageName = match[1]; 
        
        try {
            const response = await axios.post('http://127.0.0.1:8000/analyze', { 
                name: packageName 
            }, { timeout: 10000 });

            const { status, message } = response.data;

            // Remove any existing diagnostic for THIS specific line before updating
            currentDiagnostics = currentDiagnostics.filter(d => d.range.start.line !== changedLineNumber);

            if (status === "danger" || status === "warning") {
                const startIndex = lineText.indexOf(packageName);
                const startPos = new vscode.Position(changedLineNumber, startIndex);
                const endPos = new vscode.Position(changedLineNumber, startIndex + packageName.length);
                const range = new vscode.Range(startPos, endPos);

                const severity = status === "danger" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `🚨 INVISIBLE SECURITY: ${message}`,
                    severity
                );
                
                const msgLower = message.toLowerCase();

                if (msgLower.includes('hallucination') || msgLower.includes('not exist')) {
                    diagnostic.code = 'hallucination';
                } else if (msgLower.includes('typosquat') || msgLower.includes('mean')) {
                    diagnostic.code = 'typosquat';
                } else if (msgLower.includes('vulnerabilit')) {
                    diagnostic.code = 'osv-vulnerability';
                } else if (msgLower.includes('created') || msgLower.includes('days ago') || msgLower.includes('zero-day')) {
                    diagnostic.code = 'zero-day-risk';
                } else {
                    diagnostic.code = 'security-risk'; 
                }

                currentDiagnostics.push(diagnostic);
                diagnosticCollection.set(document.uri, currentDiagnostics);

                if (statusBarItem) {
                    statusBarItem.text = "$(alert) Invisible Sec: THREAT DETECTED";
                    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                }
            } else {
                // If the package is SAFE, clear only this line's diagnostic
                diagnosticCollection.set(document.uri, currentDiagnostics);
                
                // Reset status bar if no other errors exist in the file
                if (currentDiagnostics.length === 0 && statusBarItem) {
                    statusBarItem.text = "$(shield) Invisible Sec: Safe";
                    statusBarItem.backgroundColor = undefined; 
                }
            }
        } catch (error) {
            console.error("[Invisible Security] Backend connection error.");
        }
    } else {
        // If the user deleted the text or it's no longer an import,
        // we clear the diagnostic for THIS line ONLY.
        const filteredDiagnostics = currentDiagnostics.filter(d => d.range.start.line !== changedLineNumber);
        diagnosticCollection.set(document.uri, filteredDiagnostics);

        if (filteredDiagnostics.length === 0 && statusBarItem) {
            statusBarItem.text = "$(shield) Invisible Sec: Safe";
            statusBarItem.backgroundColor = undefined; 
        }
    }
}

export function deactivate() {
    if (diagnosticCollection) diagnosticCollection.clear();
}