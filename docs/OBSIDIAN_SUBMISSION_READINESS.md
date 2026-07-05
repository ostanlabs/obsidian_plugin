# Canvas Project Manager — Submission Readiness & Code Audit

_Research report: bugs/issues/inconsistencies + evaluation against the official Obsidian community-plugin requirements._

**Date:** 2026-06-29 · **Audited version:** manifest `1.8.42` / package `1.8.46`

---

## Verdict

Solid, feature-rich plugin with a clean lint/typecheck/test baseline — but **not currently submittable** to the Obsidian community directory. There are ~5 hard, bot-/policy-blocking issues and several critical runtime bugs. None are architecturally fatal; the path to compliance is clear but non-trivial (the biggest items are the embedded HTTP server, the mobile/`isDesktopOnly` mismatch, and the hand-rolled frontmatter/YAML layer).

---

## Part A — Submission readiness vs. official Obsidian requirements

Legend: ✅ pass · ❌ blocker · ⚠️ needs work

### Hard blockers (the validation bot / review will stop these)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| A1 | **`description` must NOT contain "Obsidian"** | ❌ | manifest description is _"Visual project management on **Obsidian** Canvas…"_ — the `validate-manifest` bot errors on this. Rephrase, e.g. _"Visual project management on the Canvas — manage milestones, stories, tasks… with optional Notion sync."_ |
| A2 | **`isDesktopOnly` must be `true` if any Node/Electron API is used** | ❌ | `main.ts:2 import * as http` (HTTP server) **and** `@notionhq/client` → `node-fetch` + Node builtins (left as `external` by esbuild). Manifest says `false`. On mobile the bundle's `require('http')`/`require('https')` fail → plugin won't load. Either set `true`, or gate those features and inject a browser `fetch`. |
| A3 | **GitHub release with `main.js`+`manifest.json`(+`styles.css`) as binary assets, tag == manifest version, no `v` prefix** | ❌ | No such workflow exists. `.github/workflows/publish.yml` **only publishes to npm** (`@ostanlabs/canvas-project-manager`). npm is the wrong distribution channel for Obsidian; you need the standard release-artifacts workflow. |
| A4 | **`versions.json` maps every released version → minAppVersion** | ❌ | Still `{"1.0.0":"1.4.0"}`. Missing `1.8.x`. `version-bump.mjs` only runs on `npm version`, which isn't being used (hence the drift). |
| A5 | **No `innerHTML`/`outerHTML` for user content; use DOM API** | ❌ | `main.ts:1394,1623,1626,1636,1651`. Line 1652 interpolates unescaped note titles (`${match.title}`) → guideline violation **and** XSS. (ESLint's `no-forbidden-elements` does _not_ catch `innerHTML` assignment, so lint passing is not proof of compliance.) |

### Needs work before submission (guideline / policy)

| # | Item | Status | Notes |
|---|---|---|---|
| A6 | **Network use must be disclosed in README** | ⚠️ | Notion sync sends vault data to `api.notion.com`; README never states this. Add an explicit "Network use / privacy" section (and that a Notion account + token are required). |
| A7 | **Embedded localhost HTTP server** | ⚠️/❌ | Even default-off, an unauthenticated `127.0.0.1` listener with `Access-Control-Allow-Origin: *` that mutates the vault is a near-certain review rejection. Strongly recommend removing it (or at minimum: token auth, no wildcard CORS, desktop-only, README disclosure). |
| A8 | **Avoid excessive logging (errors only by default)** | ⚠️ | 350+ `console.log` / 450+ `console.*` sites; plus a logger that writes to disk on `info`/`debug`. Gate behind a debug flag. |
| A9 | **Prefer Vault API over Adapter API; `FileManager.processFrontMatter`** | ⚠️ | 14 direct `vault.adapter` uses; **zero** `processFrontMatter` (hand-rolled YAML — see B6/B7). |
| A10 | **Register DOM events / intervals for cleanup** | ⚠️ | 35 raw `addEventListener` vs 7 `registerDomEvent`; 3 raw `setInterval` vs 1 `registerInterval`. Several leak past unload (B9). |
| A11 | **Command names shouldn't duplicate context** | ⚠️ | All commands are prefixed `"Project canvas: …"`; Obsidian already prepends the plugin name → "Canvas Project Manager: Project canvas: populate from vault". Drop the prefix; also "(v4 algorithm)" leaks implementation detail. |
| A12 | **Inline styles → CSS classes** | ⚠️ | Heavy inline `style=`/`cssText` in `main.ts`; should move to `styles.css` so themes can override. |
| A13 | **`minAppVersion` accuracy** | ⚠️ | Verify `1.4.0` actually covers all APIs used (`setCssProps`, etc.). |
| A14 | **Repo hygiene** | ⚠️ | Committed `log.log`, `obsidian.md-*.log` (gitignored but present on disk), a stray `~/Obsidian/` dir, and **500 test-vault fixture files** (some with non-ASCII `→`/paren filenames) bloating the repo. |

### Already compliant ✅

`id` (`canvas-project-manager` — valid chars, no "obsidian", doesn't end "plugin") · `name` (no "Obsidian"/"Plugin") · description length (174 ≤ 250) & ends with period · `author`/`authorUrl` present · MIT `LICENSE` · README present · no sample/boilerplate code · **no `var`** · lint + typecheck + tests all green · `onunload` present · comprehensive `eslint-plugin-obsidianmd` ruleset configured.

---

## Part B — Bugs, issues & inconsistencies

### Critical

- **B1 — Unauthenticated localhost HTTP server mutates the vault.** `main.ts:10573` — CORS `*`, no auth; any web page can POST to `127.0.0.1:12312` to trigger `populate`/`reposition` (localhost CSRF). Bodies are `console.log`'d. (Default-off, but ships in the bundle.)
- **B2 — Mobile load failure / `isDesktopOnly` mismatch.** Node `http` + `node-fetch` (see A2).
- **B3 — Notion content replacement can destroy a page.** `notionClient.ts:729-757` deletes all blocks, then appends; the append caps at 100 children so >100 blocks throws _after_ the delete = data loss, non-atomic, no rollback, no 429 handling.
- **B4 — Single-node canvas add duplicates nodes.** `canvasView.ts:82` pushes to `nodes`, then `:86 createFileNode()` pushes again → ghost nodes in saved `.canvas`. (Batch variant is correct.)
- **B5 — Relationship reconciler corrupts `parent`.** `relationshipReconciler.ts` writes scalar `parent` as an array (`parent: ["M-001"]`), breaking every parser expecting a scalar.

### High

- **B6 — Three inconsistent hand-rolled frontmatter serializers** (`frontmatter.ts:240,297` vs `:278`) → YAML corruption on titles with `:`/`"`, dropped comment lines, wiped block-style arrays. **Use `app.fileManager.processFrontMatter()`.**
- **B7 — Two divergent frontmatter _parsers_** (`frontmatter.ts` inline-only vs `entityParser.ts` block-style) → reconciler silently misses block-style `depends_on`.
- **B8 — XSS via `innerHTML`** (see A5, `main.ts:1651`).
- **B9 — Leaked timers/listeners past unload.** `mdSyncDebounceTimers`/`edgeSyncDebounceTimers` never cleared in `onunload` (`main.ts:292`); search-popup `document` click listener leaks on Escape/select (`main.ts:1707`).
- **B10 — No Notion rate-limit/backoff** → reliable 429s; custom `obsidianFetch` returns a non-spec `Response` whose `clone()` throws (`notionClient.ts:62-94`).
- **B11 — `template.ts` replacement-pattern injection.** User values passed as `String.replace` replacement → `$&`, `` $` ``, `$1` in titles mangle output. Use a function replacer or escape `$`.
- **B12 — `logger.writeToFile` is O(n²) + racy.** Re-reads/rewrites the whole log file per call, fire-and-forget → lost-write races + unbounded main-thread I/O (`logger.ts:31-61`). Also hardcodes `.obsidian/...` and uses `vault.adapter` directly.

### Medium

- Body-wide `MutationObserver` on every style change (`main.ts:135`).
- `setTimeout`-based `isUpdatingCanvas` race guard (`main.ts:528,591,3250,…`) — overlapping ops reset it early.
- Two separate `vault.on("modify")` handlers (`main.ts:231,241`).
- `extractBodyFromMarkdown` strips content when a `---` rule appears with no frontmatter (`contentSync.ts:310`).
- Full-vault `vault.read` instead of `metadataCache` in Feature views (`FeatureCoverageView.ts:59`, `FeatureDetailsView.ts:60`).
- `vault.modify` instead of `vault.process` for canvas writes (`main.ts:4642,9094,…`).
- Unguarded `JSON.parse` of `.canvas` (`canvas.ts:51`).
- V4 hardcodes root workstream `'engineering'` (`positioningV4.ts:1759`).
- CRLF/BOM-fragile frontmatter regexes (`frontmatter.ts:74,161,204`, `entityParser.ts:124`).
- `entityNavigator` still reads migrated-away `enables` field (`entityNavigator.ts:247`).
- Acceptance-criteria edits lost on re-render (`FeatureModal.ts:131`).
- SDK methods cast to `Function` (`notionClient.ts:283`); Notion `Type` hardcoded to `"Accomplishment"`.
- Reconciler memoization/cycle-detection gaps (`relationshipReconciler.ts:252,532`).

### Low / cleanup

- **Version drift** (manifest 1.8.42 / package 1.8.46 / README 1.8.42; CHANGELOG stops at 1.8.42).
- **Dual ESLint config** — legacy `.eslintrc.json` is dead under flat config; no `@typescript-eslint` rules actually run, and `--ext .ts` is a no-op. Lint only enforces `obsidianmd/*`.
- **Monolith** — `main.ts` is **10,690 lines**; split it.
- **Dead/legacy code** — `positioningV3` (1,901 lines) + V2 path reachable only via the HTTP server; unused fields/imports/methods (`selectionMenuIntervalId`, etc.).
- 38 `@ts-ignore`, ~60 `any`, 19 non-null assertions.
- README markets `npm install canvas-project-manager` as "Recommended" (wrong for end users; the npm name is actually `@ostanlabs/...`).
- Fire-and-forget modal submits swallow errors (`StructuredItemModal.ts:205`, `FeatureModal.ts:172`, `LinkFeatureModal.ts:123`).
- Collision-prone `Date.now()+Math.random()` node/edge IDs (`canvas.ts:146`).
- `isPluginCreatedNote` omits `'feature'` (`fileNaming.ts:65`); feature-ID case mismatches (`FeatureDetailsView.ts:56`).
- Lossy Notion markdown round-trip (`contentSync.ts:211`; ordered lists all render `1.`).

---

## Recommended order of attack

1. **Decide the HTTP server's fate** (remove → eliminates B1, most of B2, A7, and most mobile risk). Highest-leverage change.
2. **Fix manifest for the bot:** remove "Obsidian" from description (A1); set `isDesktopOnly` correctly or gate Notion/`fetch` (A2); regenerate `versions.json` and sync all version numbers (A4).
3. **Add the standard GitHub-release workflow** producing `main.js`/`manifest.json`/`styles.css` assets on a no-`v` tag (A3).
4. **Replace the hand-rolled YAML layer with `processFrontMatter`** — fixes B5, B6, B7 at once.
5. **Fix data-loss + correctness bugs:** B3 (Notion replace), B4 (double-add), B9 (leaks), B10 (rate limits).
6. **Guideline polish:** kill `innerHTML` (A5/B8), move inline styles to CSS, gate logging, rename commands, README network-use disclosure.
7. **Hygiene:** drop committed logs/`~`, trim/relocate the 500 fixtures, remove dead V2/V3, fix the ESLint config.
8. **Submit** via community.obsidian.md once a compliant tagged release exists.

---

## Reference — official requirement sources

- [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Release your plugin with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)
- [Developer policies](https://docs.obsidian.md/Developer+policies)
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest)
- [Mobile development](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development)
- [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)

_Note: a few precise name-rule edge strings in the research came from a community mirror of the validation bot, not first-party docs; the core rules above are first-party._
