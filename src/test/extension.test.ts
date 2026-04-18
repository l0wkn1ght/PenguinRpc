/// <reference types="mocha" />
import * as assert from "node:assert";
import * as vscode from "vscode";

// VS Code resolves IDs exactly as "publisher.name" from package.json
// the previous "Discord®-rpc" was invalid and would return undefined.
const EXTENSION_ID = "BoringPenguin.penguin-rich-presence";

suite("Penguin RPC Extension", () => {
	test("should be present", () => {
		assert.ok(vscode.extensions.getExtension(EXTENSION_ID));
	});

	test("should activate", async () => {
		const ext = vscode.extensions.getExtension(EXTENSION_ID);

		// following the KISS thumb rule.
		// fail with a helpful error message if the id is wrong, instead of a cryptic null crash
		assert.ok(ext, `Extension "${EXTENSION_ID}" not found`);

		await ext.activate();
		assert.ok(ext.isActive);
	});
});