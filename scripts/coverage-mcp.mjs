#!/usr/bin/env node
/**
 * Measure REAL line coverage of mcp.ts driven by the stdio integration suite.
 *
 * Why this exists: mcp.ts runs as a spawned subprocess, so jest's in-process
 * (istanbul) coverage never sees it. Instead we:
 *   1. Build a source-mapped ESM bundle of mcp.ts (same --external flags as
 *      build:mcp) so V8 coverage can be remapped back to mcp.ts.
 *   2. Run the integration suite with the child pointed at that bundle and
 *      NODE_V8_COVERAGE set — the child emits raw V8 coverage on exit.
 *   3. Feed the V8 output to c8, which uses the sourcemap to attribute coverage
 *      to mcp.ts, and print the mcp.ts line/branch/function numbers.
 *
 * Run:  node scripts/coverage-mcp.mjs   (from obsidian_plugin/)
 *   or:  npm run coverage:mcp
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COV_DIR = path.join(ROOT, 'coverage-tmp');
const V8_DIR = path.join(COV_DIR, 'v8');
const REPORT_DIR = path.join(COV_DIR, 'report');
const COV_SERVER = path.join(COV_DIR, 'mcp-cov.mjs');

// Keep in sync with package.json build:mcp externals.
const EXTERNALS = [
  '@modelcontextprotocol/sdk', '@ostanlabs/md-retriever', 'onnxruntime-node',
  '@xenova/transformers', 'better-sqlite3', 'faiss-node', 'yaml', 'zod', 'chokidar',
];

function step(msg) { console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`); }

// 1. Clean + build the source-mapped coverage bundle.
step('Building source-mapped coverage bundle (coverage-tmp/mcp-cov.mjs)');
rmSync(V8_DIR, { recursive: true, force: true });
rmSync(REPORT_DIR, { recursive: true, force: true });
mkdirSync(V8_DIR, { recursive: true });
execFileSync('npx', [
  'esbuild', 'mcp.ts', '--bundle', `--outfile=${COV_SERVER}`,
  '--platform=node', '--format=esm', '--sourcemap', '--loader:.html=text',
  ...EXTERNALS.map((e) => `--external:${e}`),
], { cwd: ROOT, stdio: 'inherit' });

// 2. Run the integration suite against the coverage bundle with V8 coverage on.
step('Running MCP integration suite with NODE_V8_COVERAGE');
const jest = spawnSync('npx', [
  'jest', '--config', 'jest.config.integration.js',
  'tests/integration/mcp-stdio.test.ts',
], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, MCP_COV_SERVER: COV_SERVER, NODE_V8_COVERAGE: V8_DIR },
});
if (jest.status !== 0) {
  console.error('\n✖ Integration suite failed — coverage not reported.');
  process.exit(jest.status ?? 1);
}

// 3. c8: remap V8 coverage → mcp.ts. NOTE: c8's --include/--exclude operate on
// the instrumented (bundled) file, so filtering to mcp.ts there yields 0. We run
// an unfiltered report and extract the mcp.ts row from the json-summary.
step('Reporting mcp.ts coverage (c8, source-map remapped)');
execFileSync('npx', [
  'c8', 'report',
  '--temp-directory', V8_DIR,
  '--reporter', 'text',
  '--reporter', 'json-summary',
  '--report-dir', REPORT_DIR,
], { cwd: ROOT, stdio: 'inherit' });

const summaryPath = path.join(REPORT_DIR, 'coverage-summary.json');
if (!existsSync(summaryPath)) {
  console.error('✖ c8 produced no json-summary.');
  process.exit(1);
}
const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
const key = Object.keys(summary).find((k) => k.endsWith(path.sep + 'mcp.ts') || k.endsWith('/mcp.ts'));
if (!key) {
  console.error('✖ mcp.ts not present in coverage summary — sourcemap remap failed.');
  process.exit(1);
}
const m = summary[key];
console.log('\n\x1b[1m════════ mcp.ts coverage (spawned-server, V8→sourcemap→c8) ════════\x1b[0m');
console.log(`  Lines:     ${m.lines.covered}/${m.lines.total}  (${m.lines.pct}%)`);
console.log(`  Branches:  ${m.branches.covered}/${m.branches.total}  (${m.branches.pct}%)`);
console.log(`  Functions: ${m.functions.covered}/${m.functions.total}  (${m.functions.pct}%)`);
console.log('\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m');
