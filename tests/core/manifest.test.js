const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  readManifest,
  writeManifest,
  addSource,
  removeSource,
  addSkill,
  removeSkill,
  getSkill,
  getSource,
  listSkills,
  listSources,
  getSkillsBySource,
} = require('../../src/core/manifest');

const EMPTY_MANIFEST = { version: 1, sources: {}, skills: {} };

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-manifest-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeManifestFile(skitHome, manifest) {
  fs.mkdirSync(skitHome, { recursive: true });
  fs.writeFileSync(
    path.join(skitHome, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

// --- readManifest ---

describe('readManifest', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns empty manifest when no file exists', () => {
    const manifest = readManifest(tmpDir);
    assert.deepStrictEqual(manifest, EMPTY_MANIFEST);
  });

  it('reads manifest from file when it exists', () => {
    const custom = {
      version: 1,
      sources: { 'my-skills': { type: 'own', origin: 'https://github.com/foo/bar' } },
      skills: { 'view-md': { source: 'my-skills', path: 'view-md', agent: 'claude-code' } },
    };
    writeManifestFile(tmpDir, custom);
    const manifest = readManifest(tmpDir);
    assert.deepStrictEqual(manifest, custom);
  });

  it('returns empty manifest when manifest.json contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{broken!!!');
    const manifest = readManifest(tmpDir);
    assert.deepStrictEqual(manifest, EMPTY_MANIFEST);
  });
});

// --- writeManifest ---

describe('writeManifest', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('creates file and directory, then readManifest reads it back', () => {
    const nested = path.join(tmpDir, 'sub', 'dir');
    const manifest = {
      version: 1,
      sources: { x: { type: 'own' } },
      skills: { y: { source: 'x' } },
    };
    writeManifest(nested, manifest);
    const result = readManifest(nested);
    assert.deepStrictEqual(result, manifest);
  });

  it('overwrites existing manifest', () => {
    writeManifest(tmpDir, { version: 1, sources: { a: {} }, skills: {} });
    writeManifest(tmpDir, { version: 1, sources: { b: {} }, skills: {} });
    const result = readManifest(tmpDir);
    assert.ok(result.sources.b);
    assert.strictEqual(result.sources.a, undefined);
  });
});

// --- addSource ---

describe('addSource', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('adds a source to an empty manifest', () => {
    const sourceData = {
      type: 'own',
      origin: 'https://github.com/balgaly/snirs-skills',
      localPath: 'sources/own/snirs-skills',
      gitSha: 'a1b2c3d',
      addedAt: '2026-03-20T00:00:00Z',
      updatedAt: '2026-03-20T00:00:00Z',
    };
    addSource(tmpDir, 'snirs-skills', sourceData);
    const manifest = readManifest(tmpDir);
    assert.deepStrictEqual(manifest.sources['snirs-skills'], sourceData);
    assert.strictEqual(manifest.version, 1);
  });

  it('adds a second source without overwriting the first', () => {
    addSource(tmpDir, 'first', { type: 'own' });
    addSource(tmpDir, 'second', { type: 'external' });
    const manifest = readManifest(tmpDir);
    assert.ok(manifest.sources.first);
    assert.ok(manifest.sources.second);
  });

  it('overwrites a source with the same name', () => {
    addSource(tmpDir, 'src', { type: 'own', origin: 'old' });
    addSource(tmpDir, 'src', { type: 'own', origin: 'new' });
    const manifest = readManifest(tmpDir);
    assert.strictEqual(manifest.sources.src.origin, 'new');
  });
});

// --- removeSource ---

describe('removeSource', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('removes a source from the manifest', () => {
    addSource(tmpDir, 'my-src', { type: 'own' });
    removeSource(tmpDir, 'my-src');
    const manifest = readManifest(tmpDir);
    assert.strictEqual(manifest.sources['my-src'], undefined);
  });

  it('also removes all skills that reference the removed source', () => {
    addSource(tmpDir, 'src-a', { type: 'own' });
    addSource(tmpDir, 'src-b', { type: 'own' });
    addSkill(tmpDir, 'skill-1', { source: 'src-a', path: 'skill-1' });
    addSkill(tmpDir, 'skill-2', { source: 'src-a', path: 'skill-2' });
    addSkill(tmpDir, 'skill-3', { source: 'src-b', path: 'skill-3' });

    removeSource(tmpDir, 'src-a');
    const manifest = readManifest(tmpDir);
    assert.strictEqual(manifest.skills['skill-1'], undefined);
    assert.strictEqual(manifest.skills['skill-2'], undefined);
    assert.ok(manifest.skills['skill-3']);
  });

  it('is a no-op when source does not exist', () => {
    addSource(tmpDir, 'keep', { type: 'own' });
    removeSource(tmpDir, 'nonexistent');
    const manifest = readManifest(tmpDir);
    assert.ok(manifest.sources.keep);
  });
});

// --- addSkill ---

describe('addSkill', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('adds a skill to an empty manifest', () => {
    const skillData = {
      source: 'snirs-skills',
      path: 'view-md',
      agent: 'claude-code',
      installedAt: '2026-03-20T00:00:00Z',
      importedFrom: null,
    };
    addSkill(tmpDir, 'view-md', skillData);
    const manifest = readManifest(tmpDir);
    assert.deepStrictEqual(manifest.skills['view-md'], skillData);
  });

  it('adds multiple skills', () => {
    addSkill(tmpDir, 'a', { source: 'x' });
    addSkill(tmpDir, 'b', { source: 'x' });
    const manifest = readManifest(tmpDir);
    assert.ok(manifest.skills.a);
    assert.ok(manifest.skills.b);
  });

  it('overwrites a skill with the same name', () => {
    addSkill(tmpDir, 'sk', { source: 'old', path: 'old' });
    addSkill(tmpDir, 'sk', { source: 'new', path: 'new' });
    const manifest = readManifest(tmpDir);
    assert.strictEqual(manifest.skills.sk.source, 'new');
  });
});

// --- removeSkill ---

describe('removeSkill', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('removes a skill and returns its data', () => {
    const data = { source: 'src', path: 'view-md', agent: 'claude-code' };
    addSkill(tmpDir, 'view-md', data);
    const removed = removeSkill(tmpDir, 'view-md');
    assert.deepStrictEqual(removed, data);
    const manifest = readManifest(tmpDir);
    assert.strictEqual(manifest.skills['view-md'], undefined);
  });

  it('returns null when skill does not exist', () => {
    const removed = removeSkill(tmpDir, 'nonexistent');
    assert.strictEqual(removed, null);
  });
});

// --- getSkill ---

describe('getSkill', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns skill entry when it exists', () => {
    const data = { source: 'src', path: 'sk' };
    addSkill(tmpDir, 'sk', data);
    assert.deepStrictEqual(getSkill(tmpDir, 'sk'), data);
  });

  it('returns null when skill does not exist', () => {
    assert.strictEqual(getSkill(tmpDir, 'missing'), null);
  });
});

// --- getSource ---

describe('getSource', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns source entry when it exists', () => {
    const data = { type: 'own', origin: 'https://example.com' };
    addSource(tmpDir, 'my-src', data);
    assert.deepStrictEqual(getSource(tmpDir, 'my-src'), data);
  });

  it('returns null when source does not exist', () => {
    assert.strictEqual(getSource(tmpDir, 'missing'), null);
  });
});

// --- listSkills ---

describe('listSkills', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns empty object when no skills exist', () => {
    assert.deepStrictEqual(listSkills(tmpDir), {});
  });

  it('returns all skills', () => {
    addSkill(tmpDir, 'a', { source: 'x' });
    addSkill(tmpDir, 'b', { source: 'y' });
    const skills = listSkills(tmpDir);
    assert.ok(skills.a);
    assert.ok(skills.b);
    assert.strictEqual(Object.keys(skills).length, 2);
  });
});

// --- listSources ---

describe('listSources', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns empty object when no sources exist', () => {
    assert.deepStrictEqual(listSources(tmpDir), {});
  });

  it('returns all sources', () => {
    addSource(tmpDir, 'a', { type: 'own' });
    addSource(tmpDir, 'b', { type: 'external' });
    const sources = listSources(tmpDir);
    assert.ok(sources.a);
    assert.ok(sources.b);
    assert.strictEqual(Object.keys(sources).length, 2);
  });
});

// --- getSkillsBySource ---

describe('getSkillsBySource', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns empty array when no skills belong to the source', () => {
    assert.deepStrictEqual(getSkillsBySource(tmpDir, 'src'), []);
  });

  it('returns only skill names belonging to the specified source', () => {
    addSkill(tmpDir, 'sk1', { source: 'src-a' });
    addSkill(tmpDir, 'sk2', { source: 'src-a' });
    addSkill(tmpDir, 'sk3', { source: 'src-b' });
    const result = getSkillsBySource(tmpDir, 'src-a');
    assert.deepStrictEqual(result.sort(), ['sk1', 'sk2']);
  });

  it('returns empty array for a source with no skills', () => {
    addSource(tmpDir, 'empty-src', { type: 'own' });
    addSkill(tmpDir, 'sk1', { source: 'other-src' });
    assert.deepStrictEqual(getSkillsBySource(tmpDir, 'empty-src'), []);
  });
});
