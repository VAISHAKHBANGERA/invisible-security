import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export async function scanPackageJson() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace is open.');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const packageJsonPath = path.join(rootPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        vscode.window.showWarningMessage('No package.json found in this workspace.');
        return;
    }

    try {
        const packageData = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageData);
        
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const packageNames = Object.keys(deps);

        if (packageNames.length === 0) {
            vscode.window.showInformationMessage('No dependencies found to scan.');
            return;
        }

        vscode.window.showInformationMessage(`Batching ${packageNames.length} packages to the Security Engine...`);

        // 🔴 UPDATED: Member 2's official endpoint URL
        const backendUrl = 'http://127.0.0.1:8000/check-bulk'; 
        
        const response = await axios.post(backendUrl, { 
            packages: packageNames 
        });

        // 🔍 DEBUG: Print Member 2's exact response to the Debug Console
        console.log("Member 2 sent back:", response.data);

        // 🛡️ Handle the results (Checking if they sent an array directly, or inside a 'threats' key)
        const results = response.data.threats || response.data; 

        // Check if there are any results to show
        if (Array.isArray(results) && results.length > 0) {
            results.forEach((item: any) => {
                // If Member 2 sends back objects with a 'name', print it!
                const pkgName = item.name || item; 
                vscode.window.showErrorMessage(`🚨 THREAT DETECTED: ${pkgName} is a known risk!`);
            });
        } else {
            vscode.window.showInformationMessage('✅ Scan Complete: Workspace is clean! No threats found.');
        }

    } catch (error) {
        console.error(error);
        vscode.window.showErrorMessage('Scanner failed. Is Member 2\'s Python backend running?');
    }
}