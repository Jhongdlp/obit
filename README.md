# obit

**Finds the dead code your AI agent left behind — and tells you how it died.**

```bash
npx obit
```

![obit finding dead code and reporting the commit that killed it](https://raw.githubusercontent.com/Jhongdlp/obit/main/docs/demo.gif)

An obituary records a death and its cause. It doesn't bury anyone. Neither does this: `obit` writes an `OBITUARY.md` full of evidence, and you — or your agent — decide what to delete.

## Why another dead-code tool?

There isn't another one. [knip](https://github.com/webpro-nl/knip), [vulture](https://github.com/jendrikseipp/vulture) and your IDE already tell you *what* is unused — and `obit` uses knip underneath rather than reinventing it.

What none of them tell you is **why it's dead**, and that's the part you need before you dare delete anything. `obit` reads your git history and sorts every finding into three tiers:

| | What it means | What to do |
|---|---|---|
| 🟢 **Orphaned** | Its last reference was removed in a specific commit — and something new was declared in that same commit | Safest to delete. The evidence is right there |
| 🟡 **Stillborn** | No file has ever referenced it, in the entire history. Nobody wired it up | Review. Could be an entry point or a public API |
| 🔴 **Probably a false positive** | A framework uses it without any textual reference | Leave it alone |

That third tier is the point. A tool that only lists "unused symbols" loses your trust the first time it suggests deleting `created_at` from a SQLAlchemy model.

## What the report looks like

```markdown
## 🟢 High confidence — orphaned, with an identified replacement

### `src/design/tokens.ts`:328 — `COLOR`
Its last reference was removed in 507d476a.
- Died in `507d476a` (2026-08-31) «feat: release v0.1.0 - native desktop dock»
- Declared in that same commit: `ACCENT_DARK`, `ACCENT_LIGHT`, `AGENT_COLOR`
- Verify: `git show 507d476a -- src/design/tokens.ts`
- Dead for 14 days
- 📄 8 dead symbols live in `src/design/tokens.ts` — check whether the whole file is unused.
```

Evidence, not verdicts. Every finding carries the commit that killed it, the likely replacement, and a `git show` you can run to check for yourself.

## Built for agents to read

`OBITUARY.md` is markdown on purpose. Hand it to your coding agent:

> Read OBITUARY.md. For each entry under "High confidence", run the verification command, confirm nothing references it, and delete it. Leave the rest.

The agent knows things `obit` can't — that `screenshot.mjs` is run by hand, that an export is someone's public API. So `obit` never deletes. It hands over the evidence and stays out of the way.

## Why this exists

AI agents are additive by default. They write a replacement and leave the original behind, or write something and never wire it up at all — and nobody notices, because the code compiles and the tests pass.

Before writing a line of this, the premise was measured against 151 dead symbols across 5 real repositories:

| Finding | |
|---|---|
| Dead code written during an agent session | **98.5%** |
| Never referenced by anything, ever ("stillborn") | **54.3%** of measurable symbols |
| Orphaned by a replacement, with a commit to prove it | rare, but the highest-confidence finding there is |
| Symbols the detector called dead that the framework was using | the single biggest source of noise |

That last row is why `obit` has a red tier instead of a delete button.

## Install

Nothing to install:

```bash
npx obit             # current directory
npx obit ./packages/api
```

Requires Node 20+ and a git repository. Reads your history locally and sends nothing anywhere.

## What it supports today

- **JavaScript / TypeScript**, via knip. Zero config needed.
- Python is not supported yet — [open an issue](https://github.com/Jhongdlp/obit/issues) if you want it.

## Known limits

Honest ones, because a dead-code tool that oversells itself gets somebody's build broken:

- A symbol whose name is too common (`main`, `render`) can't be traced through history without false matches, so `obit` won't guess about it.
- Reflection, dynamic imports and dependency injection are invisible to every tool in this space, `obit` included.
- The framework heuristics cover SQLAlchemy, Pydantic, Alembic, Next.js file conventions, decorators, shebang scripts and `package.json` exports. Your framework may not be in there yet — PRs welcome.

## How it works

```
knip                    → what looks unused
git log -G / git show   → was it ever referenced? which commit removed the last reference?
heuristics              → is a framework using it without referencing it?
OBITUARY.md             → evidence, sorted by confidence
```

No LLM, no embeddings, no index to maintain, no telemetry.

## License

MIT
