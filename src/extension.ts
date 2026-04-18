import * as vscode from 'vscode';
import axios from 'axios';
import { scanPackageJson } from './scanner'; 
import { SecurityQuickFix, ThreatHoverProvider, SecurityCodeLensProvider } from './uiProviders';

let typingTimer: NodeJS.Timeout | undefined = undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Invisible Security: Engine and UI are linked!');

    // 1. MEMBER 4: Initialize Status Bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(shield) Invisible Sec: Safe";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 2. Initialize Red Squiggly Engine
    diagnosticCollection = vscode.languages.createDiagnosticCollection('invisible-security');
    context.subscriptions.push(diagnosticCollection);

    // 3. WIRING MEMBER 4's UI: Registering the imported classes
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider(['javascript', 'typescript'], new SecurityQuickFix()));
    context.subscriptions.push(vscode.languages.registerHoverProvider(['javascript', 'typescript'], new ThreatHoverProvider()));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['javascript', 'typescript'], new SecurityCodeLensProvider()));

    // 4. WIRING MEMBER 4's UI: The Clickable Hover Command
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

    // 5. MEMBER 3: Link the button to scanner.ts
    let workspaceScanCommand = vscode.commands.registerCommand('invisible-security.scanWorkspace', async () => {
        try {
            await scanPackageJson();
        } catch (err) {
            vscode.window.showErrorMessage("Workspace Scan failed. Is the Backend running?");
        }
    });
    context.subscriptions.push(workspaceScanCommand);

    // 6. MEMBER 1: Real-Time Keystroke Listener
    let documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            scanCurrentLine(event.document, event.contentChanges);
        }, 1000);
    });
    context.subscriptions.push(documentChangeListener);
}

// --- MEMBER 1 CORE LOGIC: REAL-TIME SCANNER ---
async function scanCurrentLine(document: vscode.TextDocument, changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    if (changes.length === 0) return;

    const changedLineNumber = changes[0].range.start.line;
    const lineText = document.lineAt(changedLineNumber).text;
    const match = /(?:import.*from|require\()\s*['"]([^'"]+)['"]/.exec(lineText);

    diagnosticCollection.set(document.uri, []);
    
    if (statusBarItem) {
        statusBarItem.text = "$(shield) Invisible Sec: Safe";
        statusBarItem.backgroundColor = undefined; 
    }

    if (match && match[1]) {
        const packageName = match[1]; 
        
        try {
            const response = await axios.post('http://127.0.0.1:8000/analyze', { 
                name: packageName 
            }, { timeout: 5000 });

            const { status, message } = response.data;

            if (status === "danger" || status === "warning") {
                const startIndex = lineText.lastIndexOf(packageName);
                const startPos = new vscode.Position(changedLineNumber, startIndex);
                const endPos = new vscode.Position(changedLineNumber, startIndex + packageName.length);
                const range = new vscode.Range(startPos, endPos);

                const severity = status === "danger" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `🚨 INVISIBLE SECURITY: ${message}`,
                    severity
                );
                
                diagnostic.code = message.toLowerCase().includes('hallucination') ? 'hallucination' : 'typosquat'; 
                diagnosticCollection.set(document.uri, [diagnostic]);

                if (statusBarItem) {
                    statusBarItem.text = "$(alert) Invisible Sec: THREAT DETECTED";
                    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                }
            }
        } catch (error) {
            console.error("[Invisible Security] Connection to Backend failed.");
        }
    }
}

export function deactivate() {
    if (diagnosticCollection) diagnosticCollection.clear();
}