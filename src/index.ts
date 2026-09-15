#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, type Candidate, type Finding } from "./analyze.ts";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * knip only exports `main`, which needs the resolved options object from
 * `createOptions` (not exported) — calling it with partial options throws. Its
 * JSON reporter is the stable public interface, and since knip is a dependency
 * the binary is always here: no download at run time.
 */
function detect(cwd: string): Candidate[] {
  const cli = [join(here, "..", "node_modules", "knip", "dist", "cli.js"),
               join(cwd, "node_modules", "knip", "dist", "cli.js")].find(existsSync);
  if (!cli) throw new Error("knip not found — reinstall obit");

  // Spawn with this same node rather than the bin shebang: no PATH surprises,
  // and knip always runs on the version obit was tested against.
  const out = execFileSync(process.execPath, [cli, "--reporter", "json", "--no-exit-code"], {
    cwd, encoding: "utf8", maxBuffer: 64 << 20,
  });
  const data = JSON.parse(out.slice(out.indexOf("{")));

  const candidates: Candidate[] = [];
  for (const issue of data.issues ?? []) {
    for (const f of issue.files ?? []) {
      const name = typeof f === "string" ? f : f.name;
      candidates.push({ file: name, symbol: stem(name), line: 0, kind: "file" });
    }
    for (const group of ["exports", "types"] as const)
      for (const e of issue[group] ?? [])
        candidates.push({ file: issue.file, symbol: e.name, line: e.line ?? 0, kind: "export" });
  }
  // Short names are noise in `git log -S` and in every reference search.
  return candidates.filter((c) => c.symbol.length >= 4);
}

const stem = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "");

const SECTIONS = [
  { key: "orphan", title: "🟢 High confidence — orphaned, with an identified replacement" },
  { key: "stillborn", title: "🟡 Review — stillborn (nothing ever imported it)" },
  { key: "framework", title: "🔴 Probably a false positive — something uses it without referencing it" },
] as const;

function report(repo: string, findings: Finding[]) {
  const by = (k: string) => findings.filter((f) => f.confidence === k);
  // When most of a file is dead, that is one finding about the file, not
  // fifteen about its exports. Say it once, on the first symbol of that file.
  const perFile = new Map<string, number>();
  for (const f of findings) perFile.set(f.file, (perFile.get(f.file) ?? 0) + 1);
  const announced = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  const lines = [
    `# Dead code — ${repo} · ${today}`,
    "",
    `${findings.length} candidates · ${by("orphan").length} high confidence · ` +
      `${by("stillborn").length} to review · ${by("framework").length} probably false positives`,
    "",
    "> Evidence, not verdicts. Nothing here has been deleted. Check each one before removing it —",
    "> you know things this tool cannot see, like whether a script is run by hand.",
    "",
  ];

  for (const { key, title } of SECTIONS) {
    const group = by(key);
    if (!group.length) continue;
    lines.push(`## ${title}`, "");
    for (const f of group) {
      lines.push(`### \`${f.file}\`${f.line ? `:${f.line}` : ""} — \`${f.symbol}\``);
      lines.push(f.why);
      if (f.death) {
        lines.push(
          `- Died in \`${f.death.sha}\` (${f.death.date.slice(0, 10)}) «${f.death.subject}»`,
          f.death.substitutes.length
            ? `- Declared in that same commit: ${f.death.substitutes.map((s) => `\`${s}\``).join(", ")}`
            : "- Nothing new was declared in that commit",
          `- Verify: \`git show ${f.death.sha} -- ${f.file}\``,
          `- Dead for ${days(f.death.date)} days`,
        );
      }
      if (f.bornAt) lines.push(`- Written ${f.bornAt.date.slice(0, 10)} in \`${f.bornAt.sha}\``);
      if (f.caveat) lines.push(`- ⚠ ${f.caveat}`);
      const n = perFile.get(f.file)!;
      if (n >= 3 && !announced.has(f.file)) {
        announced.add(f.file);
        lines.push(`- 📄 ${n} dead symbols live in \`${f.file}\` — check whether the whole file is unused.`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

const days = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

function main() {
  // resolve, not join: join("/a", "/b") is "/a/b", which is never what anyone means
  const cwd = resolve(process.cwd(), process.argv[2] ?? ".");
  const repo = cwd.split("/").pop()!;

  process.stderr.write("looking for dead code...\n");
  const candidates = detect(cwd);
  process.stderr.write(`${candidates.length} candidates, working out how each one died...\n`);

  const findings = candidates.map((c) => classify(cwd, c));
  const out = join(cwd, "OBITUARY.md");
  writeFileSync(out, report(repo, findings));

  const n = (k: string) => findings.filter((f) => f.confidence === k).length;
  console.log(`
  ⚰  ${repo}
     ${n("orphan")} orphaned — replaced and left behind
     ${n("stillborn")} stillborn — written, never wired up
     ${n("framework")} probably false positives — the framework uses them

  → ${out}
`);
}

main();
