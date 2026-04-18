import * as vscode from 'vscode';

// 🚨 Paste your NEW API key here. Do not push this to GitHub!
const GEMINI_API_KEY = 'AQ.Ab8RN6IFTGhHl8JEIr2E3I1OeQJHV_1DYq3LStBEetpqPUrZrgsss'; 

const aiPromise = import('@google/genai')
    .then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: GEMINI_API_KEY }));

/**
 * FEATURE 1: The Lightbulb Quick Fix 
 */
export class SecurityQuickFix implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            // SCENARIO A: Typosquatting (Needs Replacement)
            if (diagnostic.code === 'typosquat') {
                const match = diagnostic.message.match(/Did you mean '(.*?)'/);
                const safeWord = match ? match[1] : 'safe-package';

                const fix = new vscode.CodeAction(`🛡️ Fix security risk: Change to '${safeWord}'`, vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.replace(document.uri, diagnostic.range, safeWord);
                fix.isPreferred = true;
                actions.push(fix);
            }
            
            // SCENARIO B: AI Hallucination (Needs Deletion)
            if (diagnostic.code === 'hallucination') {
                const fix = new vscode.CodeAction(`🗑️ CRITICAL: Delete this fake hallucinated package`, vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                
                const lineRange = document.lineAt(diagnostic.range.start.line).range;
                fix.edit.delete(document.uri, lineRange);
                fix.isPreferred = true;
                actions.push(fix);
            }
        }
        return actions;
    }
}

/**
 * FEATURE 2: The AI Threat Brain Hover
 */
export class ThreatHoverProvider implements vscode.HoverProvider {
    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | null> {
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const threatDiagnostic = diagnostics.find(d => 
            d.range.contains(position) && (d.code === 'typosquat' || d.code === 'hallucination')
        );

        if (!threatDiagnostic) return null;

        const badPackageName = document.getText(threatDiagnostic.range);
        const isHallucination = threatDiagnostic.code === 'hallucination';
        
        let aiPrompt = "";
        let safeWord = "";

        if (isHallucination) {
            aiPrompt = `Explain in exactly 2 short sentences why an AI-hallucinated npm package named '${badPackageName}' that does not actually exist in the npm registry is a massive security risk if a developer tries to install it.`;
        } else {
            const match = threatDiagnostic.message.match(/Did you mean '(.*?)'/);
            safeWord = match ? match[1] : 'safe-package';
            aiPrompt = `Explain in exactly 2 short sentences why installing the npm package '${badPackageName}' instead of '${safeWord}' might be a typosquatting security risk.`;
        }

        try {
            const ai = await aiPromise;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: aiPrompt
            });

            const hoverUI = new vscode.MarkdownString();
            hoverUI.isTrusted = true; 
            hoverUI.appendMarkdown(`### 🚨 **${isHallucination ? 'AI HALLUCINATION DETECTED' : 'TYPOSQUAT DETECTED'}** 🚨\n\n`);
            hoverUI.appendMarkdown(`> ${response.text}\n\n`);
            hoverUI.appendMarkdown(`---\n\n`);
            
            if (isHallucination) {
                const lineRange = document.lineAt(threatDiagnostic.range.start.line).range;
                const encodedArgs = encodeURIComponent(JSON.stringify([document.uri, lineRange, 'DELETE']));
                hoverUI.appendMarkdown(`[🗑️ **Click here to completely delete this line**](command:invisible-security.hoverFix?${encodedArgs})\n\n`);
            } else {
                const encodedArgs = encodeURIComponent(JSON.stringify([document.uri, threatDiagnostic.range, safeWord]));
                hoverUI.appendMarkdown(`[🛠️ **Click here to auto-fix to '${safeWord}'**](command:invisible-security.hoverFix?${encodedArgs})\n\n`);
            }

            return new vscode.Hover(hoverUI, threatDiagnostic.range);

        } catch (error) {
            return new vscode.Hover(new vscode.MarkdownString("🚨 **Threat Analysis Unavailable**"));
        }
    }
}

/**
 * FEATURE 3: CodeLens Warning
 */
export class SecurityCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        for (const diagnostic of diagnostics) {
            if (diagnostic.code === 'typosquat' || diagnostic.code === 'hallucination') {
                const titleText = diagnostic.code === 'hallucination' 
                    ? `🚨 CRITICAL: Fake Package Hallucination! Hover for AI Analysis.` 
                    : `🚨 HIGH RISK: Typosquatting Detected! Hover for AI Analysis.`;

                const lens = new vscode.CodeLens(diagnostic.range, {
                    title: titleText,
                    command: "" 
                });
                lenses.push(lens);
            }
        }
        return lenses;
    }
}