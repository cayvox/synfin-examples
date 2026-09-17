// Tests for scripts/check-proprietary-artifacts.mjs (node:test, no dependencies).
// Run: node --test scripts/check-proprietary-artifacts.test.mjs
//
// Fixtures are BUILT at test time in a temp dir: a committed fixture carrying a
// Utility marker would itself trip the guard. The archives are real formats (a
// stored zip, a ustar tar, gzip) so the content rule is exercised on the bytes a
// renamed DAR or bundle would actually have.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  contentViolation,
  findProprietaryArtifacts,
  listCandidateFiles,
  nameViolation,
} from './check-proprietary-artifacts.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-proprietary-artifacts.mjs');

// A minimal STORED (uncompressed) zip with one entry, the shape of a DAR's
// central directory: entry names are always plain bytes in the headers.
function storedZip(entryName, content = Buffer.from('dalf-bytes')) {
  const name = Buffer.from(entryName);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const localLen = local.length + name.length + content.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(localLen, 16);
  return Buffer.concat([local, name, content, central, name, end]);
}

// A minimal ustar archive holding one file.
function tarWith(fileName, content) {
  const header = Buffer.alloc(512);
  header.write(fileName, 0);
  header.write('0000644\0', 100);
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('ustar\0', 257);
  const body = Buffer.alloc(Math.ceil(content.length / 512) * 512);
  content.copy(body);
  return Buffer.concat([header, body, Buffer.alloc(1024)]);
}

const UTILITY_ENTRY =
  'utility-registry-app-v0-0.9.2-1eddd268/utility-registry-app-v0-0.9.2-1eddd268.dalf';
const SPLICE_ENTRY = 'splice-amulet-0.1.20-abcd/splice-amulet-0.1.20-abcd.dalf';

describe('nameViolation', () => {
  test('flags Utility DARs and DALFs by name, in any directory', () => {
    assert.ok(nameViolation('utility-registry-app-v0-0.9.2.dar'));
    assert.ok(nameViolation('daml/dars/utility-credential-v0-0.1.2.dar'));
    assert.ok(
      nameViolation('x/utility-registry-holding-v0-0.3.2-415a1ec9.dalf'),
    );
  });

  test('flags the bundle archive and its terms file', () => {
    assert.ok(nameViolation('canton-network-utility-dars-0.14.4.tar.gz'));
    assert.ok(
      nameViolation('ops/canton-network-utility-dars-0.14.4.tar.gz.sha256'),
    );
    assert.ok(
      nameViolation('Terms.and.Conditions.for.Canton.Network.Utility.txt'),
    );
  });

  test('passes the vendored Apache-2.0 Splice DARs and ordinary files', () => {
    assert.equal(nameViolation('daml/dars/splice-amulet.dar'), null);
    assert.equal(
      nameViolation('daml/dars/splice-api-token-holding-v1.dar'),
      null,
    );
    assert.equal(nameViolation('docs/runbooks/utility-dar-vetting.md'), null);
    assert.equal(nameViolation('packages/ledger/src/utility.ts'), null);
  });
});

describe('contentViolation', () => {
  test('catches a RENAMED Utility DAR by its zip entry names', () => {
    assert.ok(contentViolation(storedZip(UTILITY_ENTRY), 'vendor/deps.dar'));
    assert.ok(contentViolation(storedZip(UTILITY_ENTRY), 'vendor/deps.zip'));
  });

  test('catches a RENAMED bundle through gzip + tar', () => {
    const inner = storedZip(UTILITY_ENTRY);
    const tgz = gzipSync(tarWith('./utility-registry-app-v0-0.9.2.dar', inner));
    assert.ok(contentViolation(tgz, 'backup.tgz'));
    assert.ok(contentViolation(tgz, 'backup.tar.gz'));
  });

  test('passes a Splice DAR and never content-scans text files', () => {
    assert.equal(
      contentViolation(storedZip(SPLICE_ENTRY), 'daml/dars/splice-amulet.dar'),
      null,
    );
    const doc = Buffer.from(
      'vet utility-registry-app-v0 0.9.2 on the participant',
    );
    assert.equal(
      contentViolation(doc, 'docs/runbooks/utility-dar-vetting.md'),
      null,
    );
    assert.equal(
      contentViolation(doc, 'apps/web/src/lib/preapproval.ts'),
      null,
    );
  });

  test('searches raw bytes when a .gz file is not actually gzip', () => {
    assert.ok(
      contentViolation(Buffer.from('canton-network-utility-dars'), 'odd.gz'),
    );
  });
});

describe('the repository gate, end to end', () => {
  let repo;

  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'synfin-artifact-guard-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    copyFileSync(join(REPO_ROOT, '.gitignore'), join(repo, '.gitignore'));
    mkdirSync(join(repo, 'daml', 'dars'), { recursive: true });
    writeFileSync(
      join(repo, 'daml', 'dars', 'splice-amulet.dar'),
      storedZip(SPLICE_ENTRY),
    );
    writeFileSync(
      join(repo, 'README.md'),
      'utility-registry-app-v0 is named here, which is fine.\n',
    );
  });

  after(() => rmSync(repo, { recursive: true, force: true }));

  const run = () =>
    spawnSync(process.execPath, [SCRIPT, repo], { encoding: 'utf8' });

  test('a clean tree with vendored Splice DARs passes', () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  });

  test('.gitignore keeps the Utility DARs and the bundle out of `git add`', () => {
    for (const path of [
      'utility-registry-app-v0-0.9.2.dar',
      'daml/dars/utility-registry-holding-v0-0.3.2.dar',
      'canton-network-utility-dars-0.14.4.tar.gz',
      'canton-network-utility-dars-0.14.4.tar.gz.sha256',
    ]) {
      const ignored = spawnSync(
        'git',
        ['check-ignore', '-q', '--no-index', path],
        { cwd: repo },
      );
      assert.equal(ignored.status, 0, `${path} must be gitignored`);
    }
  });

  test('a force-added Utility DAR fails the gate even though it is gitignored', () => {
    const path = join(
      repo,
      'daml',
      'dars',
      'utility-registry-app-v0-0.9.2.dar',
    );
    writeFileSync(path, storedZip(UTILITY_ENTRY));
    execFileSync(
      'git',
      ['add', '-f', 'daml/dars/utility-registry-app-v0-0.9.2.dar'],
      { cwd: repo },
    );
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /utility-registry-app-v0-0\.9\.2\.dar/);
    execFileSync(
      'git',
      ['rm', '-q', '--cached', 'daml/dars/utility-registry-app-v0-0.9.2.dar'],
      { cwd: repo },
    );
    rmSync(path);
  });

  test('a renamed Utility DAR fails the gate before it is ever added', () => {
    const path = join(repo, 'vendor-deps.dar');
    writeFileSync(path, storedZip(UTILITY_ENTRY));
    assert.ok(listCandidateFiles(repo).includes('vendor-deps.dar'));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /vendor-deps\.dar: contains Digital Asset Utility marker/,
    );
    rmSync(path);
  });

  test('findProprietaryArtifacts skips paths deleted from the worktree', () => {
    assert.deepEqual(
      findProprietaryArtifacts(repo, ['gone/utility-registry-v0-0.8.2.dar']),
      [],
    );
  });
});

describe('the history gate (--range)', () => {
  let repo;
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = (message) =>
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-q',
      '-m',
      message,
    );

  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'synfin-artifact-history-'));
    git('init', '-q');
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git('add', 'README.md');
    commit('base');
  });

  after(() => rmSync(repo, { recursive: true, force: true }));

  const runRange = (range) =>
    spawnSync(process.execPath, [SCRIPT, '--range', range, repo], {
      encoding: 'utf8',
    });

  test('a Utility DAR added then deleted in the range fails, although the tree is clean', () => {
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(repo, 'deps.dar'), storedZip(UTILITY_ENTRY)); // renamed: content rule
    git('add', 'deps.dar');
    commit('add a renamed utility dar');
    git('rm', '-q', 'deps.dar');
    commit('delete it again');

    assert.equal(
      spawnSync(process.execPath, [SCRIPT, repo], { encoding: 'utf8' }).status,
      0,
      'tree is clean',
    );
    const result = runRange(`${base}..HEAD`);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /deps\.dar \(commit [0-9a-f]{12}\): contains Digital Asset Utility marker/,
    );
  });

  test('a range with only allowed content passes', () => {
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(repo, 'splice-amulet.dar'), storedZip(SPLICE_ENTRY));
    writeFileSync(
      join(repo, 'NOTES.md'),
      'utility-registry-app-v0 named in text is fine\n',
    );
    git('add', 'splice-amulet.dar', 'NOTES.md');
    commit('allowed');
    const result = runRange(`${base}..HEAD`);
    assert.equal(result.status, 0, result.stderr);
  });

  test('--range without a value is a usage error', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--range'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
  });
});
