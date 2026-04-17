import * as vscode from 'vscode';
import axios from 'axios';
// Updated to match his filename: scanner.ts
import { scanPackageJson } from './scanner'; 

let typingTimer: NodeJS.Timeout | undefined = undefined;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    console.log('Invisible Security: Shield is UP!');

    // 1. Initialize Red Squiggly Engine
    diagnosticCollection = vscode.languages.createDiagnosticCollection('invisible-security');
    context.subscriptions.push(diagnosticCollection);

    // 2. YOUR FEATURE: Real-Time Keystroke Listener
    let documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            scanCurrentLine(event.document, event.contentChanges);
        }, 1000);
    });
    context.subscriptions.push(documentChangeListener);

    // 3. MEMBER 3 FEATURE: Link the button to scanner.ts
    let workspaceScanCommand = vscode.commands.registerCommand('invisible-security.scanWorkspace', async () => {
        try {
            await scanPackageJson();
        } catch (err) {
            vscode.window.showErrorMessage("Workspace Scan failed. Is the Backend running?");
        }
    });
    context.subscriptions.push(workspaceScanCommand);

    // 4. MEMBER 4 UI COMMAND: (Used by their Quick Fix code)
    let fixCommand = vscode.commands.registerCommand('invisible-security.hoverFix', (uri: vscode.Uri, range: vscode.Range, safeWord: string) => {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, range, safeWord);
        vscode.workspace.applyEdit(edit);
    });
    context.subscriptions.push(fixCommand);
}

// --- CORE LOGIC: REAL-TIME SCANNER ---
async function scanCurrentLine(document: vscode.TextDocument, changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    if (changes.length === 0) return;

    const changedLineNumber = changes[0].range.start.line;
    const lineText = document.lineAt(changedLineNumber).text;
    const match = /(?:import.*from|require\()\s*['"]([^'"]+)['"]/.exec(lineText);

    diagnosticCollection.set(document.uri, []);

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
                
                diagnostic.code = 'typosquat'; 
                diagnosticCollection.set(document.uri, [diagnostic]);
            }
        } catch (error) {
            console.error("[Invisible Security] Connection to Backend failed.");
        }
    }
}

export function deactivate() {
    if (diagnosticCollection) diagnosticCollection.clear();
}