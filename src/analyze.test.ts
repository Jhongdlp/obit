// Run: node --experimental-strip-types src/analyze.test.ts
// Guards the ported classifier: these are the exact cases that gave false
// numbers while measuring, before each rule was added.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { isDistinctive, isDeclaration, refPattern, neverReferenced } from "./analyze.ts";

assert.ok(isDistinctive("RETRY_COOLDOWN_MS"));
assert.ok(isDistinctive("normalizeSensor"));
assert.ok(!isDistinctive("balas"), "common words match any sentence");
assert.ok(!isDistinctive("engine"));

assert.ok(isDeclaration("down_revision = '0001'", "down_revision"));
assert.ok(isDeclaration("export const DARK_COLORS = {", "DARK_COLORS"));
assert.ok(isDeclaration("def _domain(request):", "_domain"));
assert.ok(!isDeclaration("    app.add_handler(_domain)", "_domain"));
assert.ok(!isDeclaration("  color: DARK_COLORS.bg,", "DARK_COLORS"));

const file = { file: "web/src/cerebro.ts", symbol: "cerebro", line: 0, kind: "file" as const };
assert.ok(refPattern(file)!.test("import x from './web/src/cerebro.ts'"));
assert.ok(!refPattern(file)!.test("el cerebro de la mosca aprende"), "prose is not a reference");
assert.equal(refPattern({ file: "a.ts", symbol: "main", line: 0, kind: "export" }), null);

// Outside a repo there is no history, so every symbol looks like it was never
// referenced. That answer is worthless, not true — which is why index.ts refuses
// to run without a repo instead of trusting it. Fix the guard, not this line.
const noRepo = { file: "x.ts", symbol: "RETRY_COOLDOWN_MS", line: 0, kind: "export" as const };
assert.equal(neverReferenced(mkdtempSync(`${tmpdir()}/obit-`), noRepo), true);

console.log("self-check ok");
