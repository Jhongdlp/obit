// Run: node --experimental-strip-types src/analyze.test.ts
// Guards the ported classifier: these are the exact cases that gave false
// numbers while measuring, before each rule was added.
import assert from "node:assert/strict";
import { isDistinctive, isDeclaration, refPattern } from "./analyze.ts";

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

console.log("self-check ok");
