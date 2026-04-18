import { sha256Hex } from "./utils";

export type EditorSnapshot = {
	filenameHash?: string;
	languageId?: string;
	line?: number;
	errors?: number;
	warnings?: number;
};

export function sanitizeFilename(filename?: string): string | undefined {
	if (!filename) {return undefined;}

	// extract base name (handles both unix and windows path safely)
	const base = filename.split(/[\\/]/).pop();
	return base ? sha256Hex(base) : undefined;
}

export function createSnapshot(data: {
	filename?: string;
	languageId?: string;
	// vscode apis often return `null` instead of `undefined` for missing numbers
	line?: number | null;
	errors?: number | null;
	warnings?: number | null;
}): EditorSnapshot {
	return {
		filenameHash: sanitizeFilename(data.filename),
		languageId: data.languageId,
		line: data.line ?? undefined,
		errors: data.errors ?? undefined,
		warnings: data.warnings ?? undefined,
	};
}