export type IncomingAction = "ping" | "setActivity" | "clearActivity";

export interface IncomingMessage {
	action: IncomingAction;
	nonce: string;
	hmac: string;
	payloadStr?: string;
}

export interface SetActivityPayload {
	details?: string;
	state?: string;
	startTimestamp?: number;
	endTimestamp?: number;
	largeImageKey?: string;
	largeImageText?: string;
}

export interface OutgoingMessage {
	Ok: boolean;
	error?: string;
	data?: unknown;
}