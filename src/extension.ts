import * as vscode from "vscode";
import * as path from "node:path";
import { IpcServer } from "./ipcServer";
import { DiscordClient } from "./discordClient";
import type { IncomingAction, IncomingMessage, OutgoingMessage, SetActivityPayload } from "./protocol";
import { debounce, DISCORD_DETAIL_MAX, DISCORD_IMAGE_KEY_MAX, DISCORD_IMAGE_TEXT_MAX, DISCORD_STATE_MAX, generateToken } from "./utils";

// Crit FIX: switched from Discord®RPC to discordRpc. due to config defines
// the configuration namespace as "discordRpc". They must match exactly.
const CONFIG_SECTION = "discordRpc";

let ipcServer: IpcServer | null = null;
let discordClient: DiscordClient | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;

const sendEditorSnapshot = debounce(updatePresence, 300);

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);

	// initialize or retrieve secure token
	const token = context.globalState.get<string>("token") ?? generateToken();
	await context.globalState.update("token", token);

	// initialize local ipc socket
	const socketDir = path.join(context.globalStorageUri.fsPath, "socket");
	ipcServer = new IpcServer(socketDir, token, handleIncoming);

	// initialize discord rpc client
	const clientId = cfg.get<string>("clientId") || "1428089034458009770";
	discordClient = new DiscordClient(clientId);

	/// CRIT Fix: Original code called `DiscordClient.connect()` (the static class)
	/// instead of `discordClient.connect()` (the instance). This would crash immediately.
	await Promise.allSettled([ipcServer.start(), discordClient.connect()]);

	// Status Bar (using native VS Code codicon for a cleaner look)
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.text = "$(broadcast) Penguin RPC";
	statusBarItem.tooltip = "Local socket for trusted apps. Token stored securely";
	statusBarItem.show();

	// Register commands and event listeners
	context.subscriptions.push(
		statusBarItem,
		vscode.commands.registerCommand("penguinRpc.stop", stop),
		vscode.commands.registerCommand("penguinRpc.start", start),
		vscode.workspace.onDidOpenTextDocument(() => sendEditorSnapshot()),
		vscode.languages.onDidChangeDiagnostics(() => sendEditorSnapshot()),
		vscode.window.onDidChangeActiveTextEditor(() => sendEditorSnapshot()),
		vscode.window.onDidChangeTextEditorSelection(() => sendEditorSnapshot()),
	);

	sendEditorSnapshot();
}

export async function deactivate(): Promise<void> {
	await Promise.allSettled([ipcServer?.stop(), discordClient?.dispose()]);
}

async function start(): Promise<void> {
	await Promise.allSettled([ipcServer?.start(), discordClient?.connect()]);
	vscode.window.showInformationMessage("Penguin RPC started");
	updateStatusBar();
}

async function stop(): Promise<void> {
	await Promise.allSettled([ipcServer?.stop(), discordClient?.dispose()]);
	updateStatusBar();
}

async function handleIncoming(msg: IncomingMessage): Promise<OutgoingMessage> {
	switch (msg.action) {
		case "ping":
			return { Ok: true, data: "pong"};
		case "clearActivity":
			await discordClient?.clearActivity();
			return { Ok: true };
		case "setActivity": {
			const payload = parsePayload(msg.payloadStr);
			await discordClient?.setActivity(sanitizeActivity(payload));
			return { Ok: true };
		}
		default:
			return { Ok: false, error: "unknown action" };
	}
}

function parsePayload(jsonStr?: string): SetActivityPayload {
	if (!jsonStr) {return {};}
	try {
		return JSON.parse(jsonStr);
	} catch {
		return {};
	}
}

function sanitizeActivity(payload: SetActivityPayload): any {
  const activity: any = {};
  
  if (typeof payload.details === "string") {activity.details = payload.details.slice(0, DISCORD_DETAIL_MAX);}
  if (typeof payload.state === "string") {activity.state = payload.state.slice(0, DISCORD_STATE_MAX);}
  if (typeof payload.largeImageKey === "string") {activity.largeImageKey = payload.largeImageKey.slice(0, DISCORD_IMAGE_KEY_MAX);}
  if (typeof payload.largeImageText === "string") {activity.largeImageText = payload.largeImageText.slice(0, DISCORD_IMAGE_TEXT_MAX);}
  if (typeof payload.startTimestamp === "number") {activity.startTimestamp = payload.startTimestamp;}
  if (typeof payload.endTimestamp === "number") {activity.endTimestamp = payload.endTimestamp;}

  return activity;
}

async function updatePresence(): Promise<void> {
	if (!discordClient) {return;}

	const editor = vscode.window.activeTextEditor;
	const languageId = editor?.document.languageId ?? "plaintext";
	const line = editor ? editor.selection.active.line + 1 : undefined;
	const errors = editor ? countErrors(editor.document.uri) : 0;
	
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const showDetails = cfg.get<boolean>("showLineAndErrors", true);

	// Crit Fix: Original called `DiscordClient.setLanguagePresence` (static class)
	await discordClient.setLanguagePresence(
		languageId,
		showDetails ? line : undefined,
		showDetails ? errors : 0
	);
}

function countErrors(uri: vscode.Uri): number {
	// `.filter().length` is vastly more readable than `.reduce()` for humans,
	// and the performance difference is negligible on tiny diagnostic arrays.
	return vscode.languages.getDiagnostics(uri).filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
}

function updateStatusBar(): void {
	if (!statusBarItem) {return;}

	if (!ipcServer) {
		statusBarItem.hide();
		return;
	}

	statusBarItem.text = "$(broadcast) Penguin RPC";
	statusBarItem.show();
}