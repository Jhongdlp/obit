import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type Kind = "file" | "export";
export type Confidence = "orphan" | "stillborn" | "framework";

export interface Candidate {
  file: string;
  symbol: string;
  line: number;
  kind: Kind;
}

export interface Finding extends Candidate {
  confidence: Confidence;
  /** Why we think it is dead, in the reader's language. */
  why: string;
  death?: { sha: string; date: string; subject: string; substitutes: string[] };
  bornAt?: { sha: string; date: string };
  /** Reason it might NOT be dead. Shown so the agent can check before deleting. */
  caveat?: string;
}

const git = (cwd: string, args: string[]) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
  } catch {
    return ""; // a repo with no commits, or a pathspec matching nothing
  }
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A name only counts as a match when it is rare enough that a hit is not
 * coincidence: `balas`, `engine` or `main` appear in any sentence or any file,
 * `RETRY_COOLDOWN_MS` does not.
 */
export const isDistinctive = (symbol: string) =>
  /[A-Z_]/.test(symbol) || symbol.length >= 10;

/**
 * What a REFERENCE to this looks like inside code. A file is referenced by its
 * import specifier, never by its bare name — searching for `cerebro` on its own
 * matches the README too.
 */
export function refPattern(c: Candidate): RegExp | null {
  if (c.kind === "file") return new RegExp(`['"][^'"]*\\b${esc(c.symbol)}(\\.\\w+)?['"]`);
  if (isDistinctive(c.symbol)) return new RegExp(`\\b${esc(c.symbol)}\\b`);
  return null; // too common to measure without false positives
}

/**
 * `down_revision = None` in another migration is NOT a reference to this
 * symbol: it is another declaration of the same name. Without this check every
 * piece of framework boilerplate looks alive.
 */
export function isDeclaration(line: string, symbol: string) {
  const re = new RegExp(
    `^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?` +
      `(?:function|class|def|const|let|var|interface|type|enum)?\\s*` +
      `${esc(symbol)}\\b\\s*[:=(]`,
  );
  return re.test(line);
}

const NOT_CODE = /\.(md|txt|json|ya?ml|lock|snap)$/;
const PATHSPEC_NOT_CODE = [
  ":(exclude)*.md", ":(exclude)*.txt", ":(exclude)*.json",
  ":(exclude)*.lock", ":(exclude)*.yml", ":(exclude)*.yaml",
];

type Diff = Map<string, { removed: string[]; added: string[] }>;

export function diffByFile(cwd: string, sha: string): Diff {
  const out = git(cwd, ["show", sha, "--format=", "--unified=0"]);
  const d: Diff = new Map();
  let cur: string | null = null;
  for (const l of out.split("\n")) {
    if (l.startsWith("+++ ")) {
      cur = l.startsWith("+++ b/") ? l.slice(6) : l.slice(4);
      if (!d.has(cur)) d.set(cur, { removed: [], added: [] });
    } else if (!cur || l.startsWith("---")) {
      continue;
    } else if (l.startsWith("-")) {
      d.get(cur)!.removed.push(l.slice(1));
    } else if (l.startsWith("+")) {
      d.get(cur)!.added.push(l.slice(1));
    }
  }
  return d;
}

/** Lines of a diff that REFERENCE the symbol — not ones that declare it. */
function referencesIn(diff: Diff, c: Candidate, side: "removed" | "added") {
  const pat = refPattern(c)!;
  const files: string[] = [];
  for (const [file, sides] of diff) {
    if (file === c.file || NOT_CODE.test(file)) continue;
    if (sides[side].some((l) => pat.test(l) && !isDeclaration(l, c.symbol))) files.push(file);
  }
  return files;
}

const DECL = /(?:function|class|def|interface|type|enum)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*[:=]/g;

function declaredIn(code: string) {
  const names = new Set<string>();
  for (const m of code.matchAll(DECL)) names.add(m[1] ?? m[2]);
  names.delete("");
  return names;
}

/** Commits whose diff touched this reference, newest first. */
function pickaxe(cwd: string, c: Candidate, format: string) {
  const pat = refPattern(c);
  if (!pat) return [];
  const out = git(cwd, [
    "log", "-G", pat.source, `--format=${format}`,
    "--", ".", `:(exclude)${c.file}`, ...PATHSPEC_NOT_CODE,
  ]).trim();
  return out ? out.split("\n") : [];
}

/**
 * Was this symbol EVER referenced by another code file, at any point in the
 * repo's history? If never, it did not become orphaned by a replacement —
 * nobody ever wired it up in the first place.
 */
export function neverReferenced(cwd: string, c: Candidate): boolean | null {
  if (!refPattern(c)) return null; // not measurable
  // 12 commits is plenty: the pickaxe already ordered them by relevance.
  for (const sha of pickaxe(cwd, c, "%H").slice(0, 12)) {
    const d = diffByFile(cwd, sha);
    if (referencesIn(d, c, "removed").length || referencesIn(d, c, "added").length) return false;
  }
  return true;
}

/**
 * The commit where the last reference disappeared, plus whatever was declared
 * in that same commit — the likely replacement. Walks newest to oldest: looking
 * only at the most recent commit misses the death when that commit is the one
 * that added the reference somewhere else.
 */
export function deathCommit(cwd: string, c: Candidate) {
  for (const line of pickaxe(cwd, c, "%H%x09%aI%x09%s")) {
    const [sha, date, ...rest] = line.split("\t");
    const d = diffByFile(cwd, sha);
    const lost = new Set(referencesIn(d, c, "removed"));
    const gained = new Set(referencesIn(d, c, "added"));
    if (![...lost].some((f) => !gained.has(f))) continue; // moved or renamed, not died

    const removed = [...d.values()].flatMap((s) => s.removed).join("\n");
    const added = [...d.values()].flatMap((s) => s.added).join("\n");
    const substitutes = [...declaredIn(added)].filter((n) => !declaredIn(removed).has(n));
    return { sha: sha.slice(0, 8), date, subject: rest.join("\t"), substitutes: substitutes.sort().slice(0, 3) };
  }
  return undefined;
}

export function birthCommit(cwd: string, c: Candidate) {
  const out = git(cwd, ["log", "-S", c.symbol, "--format=%H%x09%aI", "--", c.file]).trim();
  if (!out) return undefined;
  const lines = out.split("\n");
  const [sha, date] = lines[lines.length - 1].split("\t"); // oldest
  return { sha: sha.slice(0, 8), date };
}

/**
 * Reasons a detector calls something dead when the framework is using it
 * without any textual reference. Measured against real repos: these were the
 * bulk of the false positives, and deleting one breaks the build.
 */
export function frameworkCaveat(cwd: string, c: Candidate): string | null {
  const path = c.file;
  const src = existsSync(join(cwd, path)) ? readFileSync(join(cwd, path), "utf8") : "";

  if (/alembic|migrations?\//.test(path) && ["down_revision", "branch_labels", "depends_on", "revision"].includes(c.symbol))
    return "Alembic migration attribute — read by the migration runner, never imported.";
  if (c.symbol === "model_config" || (c.symbol === "Config" && /pydantic/.test(src)))
    return "Pydantic configuration attribute — used by the framework, not by a reference.";
  if (/from\s+sqlalchemy|declarative_base|DeclarativeBase/.test(src))
    return "File defines SQLAlchemy models — columns are mapped by the ORM, not referenced in code.";
  if (/\/(page|layout|route|template|error|loading|not-found)\.(t|j)sx?$/.test(path) ||
      ["generateMetadata", "generateStaticParams", "metadata", "viewport"].includes(c.symbol))
    return "Next.js file convention — the framework loads it by path, not by import.";
  if (/^#!/.test(src))
    return "Executable script (has a shebang) — run directly, not imported.";
  if (new RegExp(`__all__[^\\]]*['"]${esc(c.symbol)}['"]`, "s").test(src))
    return "Listed in __all__ — part of the module's public API.";
  if (new RegExp(`@\\w[\\w.]*\\([^)]*\\)?\\s*\\n\\s*(?:async\\s+)?(?:def|function|class)\\s+${esc(c.symbol)}\\b`).test(src))
    return "Decorated — registered with a framework rather than imported.";
  if (isPublicApi(cwd, path))
    return "Reachable through package.json exports — part of this package's public API.";
  return null;
}

function isPublicApi(cwd: string, file: string) {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const fields = JSON.stringify([pkg.exports, pkg.main, pkg.module, pkg.bin, pkg.types]);
    const stem = file.replace(/\.[^.]+$/, "").replace(/^(src|lib)\//, "");
    return fields.includes(file) || fields.includes(stem);
  } catch {
    return false;
  }
}

export function classify(cwd: string, c: Candidate): Finding {
  const caveat = frameworkCaveat(cwd, c);
  if (caveat)
    return { ...c, confidence: "framework", why: "Flagged by the detector, but something uses it without a textual reference.", caveat };

  const death = deathCommit(cwd, c);
  if (death)
    return {
      ...c,
      confidence: "orphan",
      why: `Its last reference was removed in ${death.sha}.`,
      death,
      bornAt: birthCommit(cwd, c),
    };

  const never = neverReferenced(cwd, c);
  if (never)
    return {
      ...c,
      confidence: "stillborn",
      why: "No other code file has ever referenced it, in the whole history.",
      bornAt: birthCommit(cwd, c),
      caveat: c.kind === "file"
        ? "Unused file — could be an entry point, or a script run directly rather than imported."
        : undefined,
    };

  // Referenced at some point, no identifiable death: usually the detector is
  // wrong rather than the code being dead. Say so instead of guessing.
  return {
    ...c,
    confidence: "framework",
    why: "It was referenced at some point, but no commit removed that reference.",
    bornAt: birthCommit(cwd, c),
    caveat: "Likely a detector false positive — check by hand before touching it.",
  };
}
