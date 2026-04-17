import * as vscode from 'vscode';

// --- SLOT 1: MEMBER 1 (API & Listeners) ---
export function activate(context: vscode.ExtensionContext) {
    console.log('Invisible Security Extension is now active!');

    // Member 1 will put the Keystroke Listener logic here
    
    let disposable = vscode.commands.registerCommand('invisible-security.scanWorkspace', () => {
        // This is where Member 3's logic will be called
        vscode.window.showInformationMessage('Scan Workspace command triggered.');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

// --- SLOT 2: MEMBER 4 (Quick Fix & Hover UI) ---
// Member 4 will add their classes and providers down here