import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { IncomingMessage, OutgoingMessage } from "./protocol";
import { hmacSha256Hex, safeEqual } from "./utils";

const MAX_CONCURRENT = 4;
const MAX_MESSAGE_BYTES = 64_000;

export class IpcServer {
	private server: net.Server | null = null;
	private socketPath: string;
	private token: string;
	private onMessage: (msg: IncomingMessage) => Promise<OutgoingMessage>;
	private activeSockets = new Set<net.Socket>();

	constructor(
		socketDir: string,
		token: string,
		onMessage: (msg: IncomingMessage) => Promise<OutgoingMessage>
	) {
		this.token = token;
		this.onMessage = onMessage;
		// filename avoids x-platform headaches (especially on win pipes)
		this.socketPath = path.join(socketDir, "vscode-penguin-rpc.sock");
	}

	getSocketPath(): string {
		return this.socketPath;
	}

	async start(): Promise<void> {
		if (this.server) {return;}

		await fs.promises.mkdir(path.dirname(this.socketPath), {
			recursive: true,
			mode: 0o700,
		});

		try {
			await fs.promises.unlink(this.socketPath);
		} catch {}

		this.server = net.createServer({ pauseOnConnect: true }, (socket) => 
			this.handleSocket(socket)
		);

		return new Promise((resolve, reject) => {
			this.server!.once("error", reject);
			this.server!.listen(this.socketPath, () => {
				// unix permissions don't apply to windows named pipes the same way
				if (process.platform !== "win32") {
					fs.chmodSync(this.socketPath, 0o600);
				}
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		if (!this.server) {return;}

		for (const s of this.activeSockets) {s.destroy();}
		this.activeSockets.clear();

		return new Promise((resolve) => {
			this.server!.close(() => {
				this.server = null;
				try {
					fs.unlinkSync(this.socketPath);
				} catch {}
				resolve();
			});
		});
	}

	private handleSocket(socket: net.Socket): void {
		if (this.activeSockets.size >= MAX_CONCURRENT) {
			socket.destroy();
			return;
		}

		this.activeSockets.add(socket);
		socket.setEncoding("utf8");
		let buffer = "";

		socket.on("data", (chunk: string) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
				socket.destroy();
				return;
			}

			let idx: number;
			while ((idx = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, idx).trim();
				buffer = buffer.slice(idx + 1);
				if (!line) {continue;}

				let msg: IncomingMessage;
				try {
					msg = JSON.parse(line) as IncomingMessage;
				} catch {
					socket.write(JSON.stringify({ ok: false, error: "invalid json" }) + "\n");
					continue;
				}
				
				this.authAndHandle(msg, socket).catch(() => socket.destroy());
			}
		});

		socket.once("close", () => this.activeSockets.delete(socket));
		socket.once("error", () => this.activeSockets.delete(socket));
		socket.resume();
	}

	private async authAndHandle(msg: IncomingMessage, socket: net.Socket): Promise<void> {
		const { nonce, hmac, payloadStr } = msg;
		const expectedHmac = hmacSha256Hex(this.token, nonce + (payloadStr ?? ""));

		if (!safeEqual(hmac, expectedHmac)) {
			socket.write(JSON.stringify({ ok: false, error: "unauthorized"}) + "\n");
			return;
		}

		const reply = await this.onMessage(msg);
		socket.write(JSON.stringify(reply) + "\n");
	}
}