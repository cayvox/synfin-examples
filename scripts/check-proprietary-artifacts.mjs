#!/usr/bin/env node
//
// scripts/check-proprietary-artifacts.mjs -- fail if Digital Asset's proprietary
// Canton Network Utility DARs (or their distribution bundle) are in the tree.
//
// The Utility DARs (utility-registry-*, utility-credential-*, ...) are what a
// participant vets to hold or receive registry tokens such as USDCx. They ship
// under Digital Asset's proprietary licence terms, which are not compatible with
// this repository's MIT licence. They are NODE-ONLY artifacts: fetched from
// Digital Asset's host at vetting time and uploaded straight to a participant,
// never committed (README.md, "Proprietary artifacts"). Anything that lands in
// git history survives a later visibility change, and removing it then means a
// history rewrite, so this check stops it before it lands.
//
// What it scans: every tracked file plus every untracked file that is not
// gitignored (so it also catches a file BEFORE `git add`). Two rules:
//   1. NAME: a Utility DAR/DALF, the bundle archive, or the bundle's terms file.
//   2. CONTENT: archive and package files (.dar .dalf .zip .jar .tar .tgz .gz) whose
//      bytes carry a Utility package or bundle marker, which catches a renamed DAR
//      or a renamed bundle (zip entry names are stored uncompressed; gzip is
//      inflated before searching). Text files are never content-scanned, so docs
//      and code may NAME the packages freely.
// Known limit: a Utility DAR renamed AND nested inside a compressed zip whose
// entry name was also changed is not detected. The name rule plus .gitignore
// cover the realistic accident (copying the bundle or a DAR into the repo).
//
// HISTORY: a tree scan alone misses a file added in one commit and deleted in a
// later one; the blob still lands in history on merge. `--range <rev-range>` applies
// the same two rules to every file ADDED or MODIFIED by any commit in the range
// (CI runs it over a pull request's commits).
//
// Usage:  node scripts/check-proprietary-artifacts.mjs [repo-root]                  (tree)
//         node scripts/check-proprietary-artifacts.mjs --range <base>..<head> [root] (history)
// Exit 1 on a hit.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const NAME_RULES = [
  {
    re: /^utility-[^/]*\.(dar|dalf)$/i,
    why: 'Digital Asset Utility DAR/DALF (proprietary)',
  },
  {
    re: /^canton-network-utility-dars/i,
    why: 'Digital Asset Utility DAR bundle archive',
  },
  {
    re: /^Terms\.and\.Conditions\.for\.Canton\.Network\.Utility/i,
    why: 'Digital Asset Utility bundle terms file',
  },
];

const CONTENT_EXTENSIONS = new Set([
  '.dar',
  '.dalf',
  '.zip',
  '.jar',
  '.tar',
  '.tgz',
  '.gz',
]);
const GZIP_EXTENSIONS = new Set(['.tgz', '.gz']);

// Package names of the Utility DAR family, plus the bundle's own names.
const CONTENT_MARKER =
  /utility-(registry-app|registry-holding|registry|credential-app|credential|commercials|settlement-app|collateral-app|version)-v\d|canton-network-utility-dars|Terms\.and\.Conditions\.for\.Canton\.Network\.Utility/;

// Inflating is bounded so a hostile or corrupt archive cannot exhaust memory.
const MAX_INFLATED_BYTES = 512 * 1024 * 1024;

export function nameViolation(path) {
  const name = basename(path);
  const rule = NAME_RULES.find((r) => r.re.test(name));
  return rule ? rule.why : null;
}

export function contentViolation(bytes, path) {
  const ext = extname(path).toLowerCase();
  if (!CONTENT_EXTENSIONS.has(ext)) return null;
  let haystack = bytes;
  if (GZIP_EXTENSIONS.has(ext)) {
    try {
      haystack = gunzipSync(bytes, { maxOutputLength: MAX_INFLATED_BYTES });
    } catch {
      haystack = bytes; // not actually gzip: search the raw bytes
    }
  }
  const match = haystack.toString('latin1').match(CONTENT_MARKER);
  return match ? `contains Digital Asset Utility marker "${match[0]}"` : null;
}

export function findProprietaryArtifacts(root, files) {
  const hits = [];
  for (const file of files) {
    const full = join(root, file);
    if (!existsSync(full) || !statSync(full).isFile()) continue; // deleted in the worktree
    const byName = nameViolation(file);
    if (byName) {
      hits.push({ file, reason: byName });
      continue;
    }
    if (!CONTENT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const byContent = contentViolation(readFileSync(full), file);
    if (byContent) hits.push({ file, reason: byContent });
  }
  return hits;
}

export function listCandidateFiles(root) {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(out.toString('utf8').split('\0').filter(Boolean))];
}

// Every (commit, path, blob) added or modified in the range, deletions excluded.
export function listRangeBlobs(root, range) {
  const out = execFileSync(
    'git',
    [
      'log',
      '--no-renames',
      '--diff-filter=AM',
      '--raw',
      '--no-abbrev',
      '--format=commit %H',
      range,
    ],
    { cwd: root, maxBuffer: 256 * 1024 * 1024 },
  ).toString('utf8');
  const blobs = [];
  let commit = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7);
    const raw = line.match(/^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) [AM]\t(.+)$/);
    if (raw) blobs.push({ commit, blob: raw[1], file: raw[2] });
  }
  return blobs;
}

export function findProprietaryArtifactsInRange(root, range) {
  const hits = [];
  const blobs = listRangeBlobs(root, range);
  for (const { commit, blob, file } of blobs) {
    const where = `${file} (commit ${commit.slice(0, 12)})`;
    const byName = nameViolation(file);
    if (byName) {
      hits.push({ file: where, reason: byName });
      continue;
    }
    if (!CONTENT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const bytes = execFileSync('git', ['cat-file', 'blob', blob], {
      cwd: root,
      maxBuffer: MAX_INFLATED_BYTES,
    });
    const byContent = contentViolation(bytes, file);
    if (byContent) hits.push({ file: where, reason: byContent });
  }
  return { hits, scanned: blobs.length };
}

function main() {
  const args = process.argv.slice(2);
  const rangeAt = args.indexOf('--range');
  const range = rangeAt >= 0 ? args.splice(rangeAt, 2)[1] : null;
  if (rangeAt >= 0 && !range) {
    console.error(
      'check-proprietary-artifacts: --range needs a revision range, e.g. origin/main..HEAD',
    );
    process.exit(2);
  }
  const root = resolve(
    args[0] ?? join(fileURLToPath(import.meta.url), '..', '..'),
  );
  let hits;
  let scanned;
  if (range) {
    ({ hits, scanned } = findProprietaryArtifactsInRange(root, range));
  } else {
    const files = listCandidateFiles(root);
    hits = findProprietaryArtifacts(root, files);
    scanned = files.length;
  }
  if (hits.length === 0) {
    console.log(
      `check-proprietary-artifacts: OK (${scanned} ${range ? `blobs in ${range}` : 'files'} scanned)`,
    );
    return;
  }
  console.error(
    'check-proprietary-artifacts: FAIL. Proprietary Digital Asset Utility artifacts found:',
  );
  for (const hit of hits) console.error(`  ${hit.file}: ${hit.reason}`);
  console.error(
    '\nThese are node-only artifacts, never repository content. Remove them (and, if already\n' +
      'committed, from history before any push). See README.md, "Proprietary artifacts".',
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
