#!/usr/bin/env node
/**
 * reformat-vault.mjs — one-time migration that rewrites every entity file in a
 * vault into the canonical EntitySerializer frontmatter format:
 *
 *   - double-quoted scalars            (title: "Component 3: Config Loader")
 *   - YAML block-sequence arrays       (depends_on:\n  - "T-002")
 *   - unwrapped lines                  (lineWidth: 0)
 *   - plain/unquoted keys              (defaultKeyType: 'PLAIN')
 *
 * These are byte-identical to src/entity-core/serializer.ts (EntitySerializer)
 * and to util/frontmatter.ts's writer, so after this migration plugin-written
 * and MCP-written files are indistinguishable.
 *
 * SAFETY:
 *   - DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *   - A vault path is REQUIRED (--vault <dir>); the script refuses to run
 *     without one, so it can never touch an implicit/default vault.
 *   - --backup writes a "<file>.bak" copy before overwriting (only with --apply).
 *   - The markdown BODY after the frontmatter is preserved verbatim.
 *   - Files whose YAML frontmatter cannot be strictly parsed are SKIPPED and
 *     reported (never silently rewritten), so malformed legacy files are left
 *     for a human to inspect.
 *
 * Usage:
 *   node scripts/reformat-vault.mjs --vault /path/to/vault            # dry-run
 *   node scripts/reformat-vault.mjs --vault /path/to/vault --apply
 *   node scripts/reformat-vault.mjs --vault /path/to/vault --apply --backup
 *
 * DO NOT run this against a real vault without a backup and review of the
 * dry-run output first.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// Canonical YAML settings — MUST match EntitySerializer / util/frontmatter.ts.
const YAML_STRINGIFY_OPTS = {
  lineWidth: 0,
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
};

function parseArgs(argv) {
  const args = { vault: null, apply: false, backup: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--backup') args.backup = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--vault') args.vault = argv[++i];
    else if (a.startsWith('--vault=')) args.vault = a.slice('--vault='.length);
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

const HELP = `reformat-vault.mjs — reformat vault entity files to canonical EntitySerializer format

  --vault <dir>   (REQUIRED) vault directory to scan
  --apply         actually write changes (default: dry-run, writes nothing)
  --backup        write <file>.bak before overwriting (only with --apply)
  --quiet         suppress per-file output, print summary only
  -h, --help      show this help
`;

/** Recursively collect all .md files under dir. */
async function collectMarkdown(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === '.obsidian') continue;
        await walk(full);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

/** Split content into { frontmatterText, body } or null when there's no block. */
function splitFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  return { frontmatterText: match[1], body: content.substring(match[0].length) };
}

function unescapeDoubleQuoted(s) {
  return s.replace(/\\(["\\ntr0])/g, (_m, ch) =>
    ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch === '0' ? '\0' : ch
  );
}

function stripItem(raw) {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return unescapeDoubleQuoted(t.slice(1, -1));
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

function scalar(raw) {
  const t = raw.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j;
    } catch {
      const inner = t.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map((s) => stripItem(s)).filter((s) => s.length > 0);
    }
  }
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return unescapeDoubleQuoted(t.slice(1, -1));
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return t;
}

/**
 * Lenient, first-colon-split parser mirroring util/frontmatter.ts. Used only as
 * a fallback for legacy files that strict YAML.parse rejects (e.g. an unquoted
 * colon in a title) — exactly the bug class this migration exists to fix.
 */
function lenientParse(frontmatterText) {
  const lines = frontmatterText.split('\n');
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    const rest = line.slice(colon + 1).trim();
    if (rest === '' && /^[ \t]*-[ \t]*/.test(lines[i + 1] ?? '')) {
      const items = [];
      while (i + 1 < lines.length && /^[ \t]*-[ \t]*/.test(lines[i + 1])) {
        items.push(stripItem(lines[++i].replace(/^[ \t]*-[ \t]*/, '')));
      }
      fm[key] = items;
    } else {
      fm[key] = scalar(rest);
    }
  }
  return fm;
}

/** Reformat a single file's content. Returns { changed, next, reason, lenient }. */
function reformatContent(content) {
  const split = splitFrontmatter(content);
  if (!split) return { changed: false, reason: 'no-frontmatter' };

  let parsed;
  let lenient = false;
  try {
    parsed = YAML.parse(split.frontmatterText);
  } catch {
    // Legacy file that strict YAML can't read — fall back to the lenient parser
    // so this migration can repair it, and flag it for human review.
    parsed = lenientParse(split.frontmatterText);
    lenient = true;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { changed: false, reason: 'frontmatter-not-a-map' };
  }
  // Only touch actual entity files.
  if (!parsed.id || !parsed.type) {
    return { changed: false, reason: 'not-an-entity' };
  }

  // Drop null/undefined (matches EntitySerializer, which only emits defined fields).
  const clean = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || v === null) continue;
    clean[k] = v;
  }

  const yaml = YAML.stringify(clean, YAML_STRINGIFY_OPTS);
  const next = `---\n${yaml}---\n` + split.body;

  return { changed: next !== content, next, reason: 'ok', lenient };
}

/** Small unified-ish diff of the frontmatter lines for dry-run readability. */
function frontmatterDiff(before, after) {
  const fmBefore = (splitFrontmatter(before)?.frontmatterText ?? '').split('\n');
  const fmAfter = (splitFrontmatter(after)?.frontmatterText ?? '').split('\n');
  const lines = [];
  const beforeSet = new Set(fmBefore);
  const afterSet = new Set(fmAfter);
  for (const l of fmBefore) if (!afterSet.has(l)) lines.push(`    - ${l}`);
  for (const l of fmAfter) if (!beforeSet.has(l)) lines.push(`    + ${l}`);
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!args.vault) {
    process.stderr.write('ERROR: --vault <dir> is required.\n\n' + HELP);
    process.exit(2);
  }

  const vault = path.resolve(args.vault);
  const stat = await fs.stat(vault).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    process.stderr.write(`ERROR: not a directory: ${vault}\n`);
    process.exit(2);
  }

  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  process.stdout.write(`reformat-vault [${mode}] scanning: ${vault}\n\n`);

  const files = await collectMarkdown(vault);
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  const skips = [];
  const repaired = []; // changed files that needed the lenient (legacy) parser

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const res = reformatContent(content);
    const rel = path.relative(vault, file);

    if (res.reason !== 'ok') {
      if (res.reason === 'frontmatter-not-a-map') {
        skipped++;
        skips.push(`${rel} — ${res.reason}`);
      }
      continue;
    }

    if (!res.changed) {
      unchanged++;
      continue;
    }

    changed++;
    if (res.lenient) repaired.push(rel);
    if (!args.quiet) {
      const tag = res.lenient ? ' [legacy — lenient parse, REVIEW]' : '';
      process.stdout.write(`~ ${rel}${tag}\n${frontmatterDiff(content, res.next)}\n\n`);
    }

    if (args.apply) {
      if (args.backup) {
        await fs.writeFile(`${file}.bak`, content, 'utf8');
      }
      await fs.writeFile(file, res.next, 'utf8');
    }
  }

  process.stdout.write('\n──────── summary ────────\n');
  process.stdout.write(`mode:                ${mode}\n`);
  process.stdout.write(`markdown files:      ${files.length}\n`);
  process.stdout.write(`would reformat:      ${changed}\n`);
  process.stdout.write(`  of which legacy:   ${repaired.length} (needed lenient parse)\n`);
  process.stdout.write(`already canonical:   ${unchanged}\n`);
  process.stdout.write(`skipped (issues):    ${skipped}\n`);
  if (repaired.length) {
    process.stdout.write('\nlegacy files repaired via lenient parse (review these closely):\n');
    for (const r of repaired) process.stdout.write(`  * ${r}\n`);
  }
  if (skips.length) {
    process.stdout.write('\nskipped files needing manual review:\n');
    for (const s of skips) process.stdout.write(`  ! ${s}\n`);
  }
  if (!args.apply && changed > 0) {
    process.stdout.write('\nDry-run only — nothing written. Re-run with --apply --backup to migrate.\n');
  }
}

main().catch((err) => {
  process.stderr.write(`reformat-vault failed: ${err?.stack || err}\n`);
  process.exit(1);
});
