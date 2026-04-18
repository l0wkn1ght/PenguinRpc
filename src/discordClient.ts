import RPC from 'discord-rpc';
import * as path from 'node:path';
import { getIconPath } from './icon-loader';

export class DiscordClient {
	private client: RPC.Client | null = null;
	private clientId: string;

	constructor(clientId: string) {
		this.clientId = clientId;
	}

	async connect(): Promise<void> {
		if (this.client) {return;}

		this.client = new RPC.Client({ transport: 'ipc' });

		return new Promise((resolve, reject) => {
			this.client!.once('ready', resolve);
			this.client!.login({ clientId: this.clientId }).catch(reject);
		});
	}

	async setLanguagePresence(languageId: string, line?: number, errors = 0, warnings = 0): Promise<void> {
		if (!this.client) {return;}

		const iconPath = getIconPath(languageId);
		const largeImageKey = path.basename(iconPath, '.png');

		const activity: RPC.Presence = {
			details: `Editing ${languageId}`,
			state: line ? `Line ${line} • Errors ${errors} • Warnings ${warnings}` : undefined,
			largeImageKey,
			largeImageText: 'Visual Studio Code',
			startTimestamp: Date.now(),
		};

		// silently fail if discord isn't running to prevent crashing the editor
		await this.client.setActivity(activity).catch(() => {});
	}

	async setActivity(activity: RPC.Presence): Promise<void> {
		if (!this.client) {return;}
		await this.client.setActivity(activity).catch(() => {});
	}

	async clearActivity(): Promise<void> {
		if (!this.client) {return;}
		// clearActivity exists in the library but is missing from it's type def
		await (this.client as any).clearActivity().catch(() => {});
	}

	dispose(): void {
		if (!this.client) {return;}
		try { this.client.destroy(); } catch {}
		this.client = null;
	} 
}