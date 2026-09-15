# obit

Finds dead code left behind by AI agents and reports **how it died**, so a human
or an agent can decide what to delete. It never deletes anything itself.

## The one rule

**obit does not delete, and does not tell you to delete.** It reports evidence
sorted by confidence. Every feature proposal that ends in "and then it removes
the code" is out of scope. The reason anyone trusts this tool is that it can't
break their build.

## Layout

```
src/analyze.ts        the classifier — all the git archaeology and heuristics
src/index.ts          knip integration, OBITUARY.md rendering, CLI
src/analyze.test.ts   self-check: node --experimental-strip-types src/analyze.test.ts
```

Two source files on purpose. Split further only when one genuinely outgrows its job.

## The three tiers

| Tier | Test | Meaning |
|---|---|---|
| `orphan` | a commit removed its last reference | replaced and left behind |
| `stillborn` | no commit ever referenced it | written, never wired up |
| `framework` | a heuristic matched, or it was referenced with no identifiable death | something uses it invisibly — probably a false positive |

Order matters: `frameworkCaveat` runs first, then `deathCommit`, then
`neverReferenced`. Anything unexplained falls through to `framework`, never to
a confident tier. **When in doubt, downgrade confidence.**

## Rules that exist because they were measured

These came out of validating the premise against 151 dead symbols in 5 real
repos. Each one fixed a number that was silently wrong. Don't remove them
without new measurements:

- **`isDistinctive`** — names like `balas`, `engine`, `main` match any sentence
  and any file. Without this filter the prose-intent metric read 45% instead of
  its real 4.8%.
- **`isDeclaration`** — `down_revision = None` in another Alembic migration is
  not a reference, it's another declaration of the same name. Without this, all
  framework boilerplate looks alive.
- **A file is referenced by its import specifier, never by its bare name** —
  searching for `cerebro` on its own matches the README.
- **`deathCommit` walks newest to oldest.** Looking only at the most recent
  pickaxe hit misses the death whenever that commit is the one that *added* a
  reference somewhere else.

## knip

knip's only export is `main`, and it requires the resolved options object from
`createOptions`, which is not exported — calling it with partial options throws
`Cannot read properties of undefined`. Verified on v6.35.1.

So obit spawns knip's CLI with `--reporter json`, using `process.execPath` and
the file at `node_modules/knip/dist/cli.js`: no shebang, no PATH lookup, no
download at run time, and knip always runs on the same Node obit does.

## Reference implementation

`~/Documentos/trashdelete/validar.py` is the Python instrument the classifier was
ported from. It is not a dependency and not shipped — it's the regression check.
When you change classification logic, run both against the same repos and
explain any divergence. Last agreement: orphan counts matched exactly on
notchAgent, KALA_web, FlyBrain and GAME_IA.

## Conventions

- Code and all user-facing output in English; this is a public package.
- Node built-ins over dependencies. Today the only runtime dependency is knip,
  and that's the budget.
- Comments explain *why*, especially where a rule looks arbitrary — it usually
  encodes a false positive someone already paid for.
- New framework heuristics go in `frameworkCaveat` with a one-line reason the
  user will read in their report.

## The demo GIF

`docs/demo.gif` is rendered by `scripts/demo-gif.py` (Pillow, no recording
tools needed). The text in that script is copied verbatim from a real run —
if you change the output format, re-render it rather than editing the numbers.

Cascadia Code has no emoji glyphs, so `⚰` is drawn separately from Noto Color
Emoji at its native 109px and scaled down. Any other emoji added to a frame
needs the same treatment or it renders as tofu.

## Checks

```bash
node --experimental-strip-types src/analyze.test.ts   # self-check
npx tsc                                               # build
node dist/index.js ../some-repo                       # end to end
```
