'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { fetchRegistry, validateRegistryUrl, stripAnsi } = require('../../src/core/registry');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-registry-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const SAMPLE_INDEX = {
  version: 1,
  updated: '2026-04-05',
  entries: [
    {
      name: 'superpowers',
      description: 'Claude Code skills',
      url: 'https://github.com/anthropics/claude-code-skills',
      tags: ['productivity'],
      author: 'anthropics',
      agents: ['claude-code'],
    },
  ],
};

describe('stripAnsi', () => {
  it('removes ANSI escape codes from a string', () => {
    const ansi = '\u001b[32mhello\u001b[0m';
    assert.strictEqual(stripAnsi(ansi), 'hello');
  });

  it('returns plain string unchanged', () => {
    assert.strictEqual(stripAnsi('plain text'), 'plain text');
  });
});

describe('validateRegistryUrl', () => {
  it('accepts https://github.com/ URLs', () => {
    assert.strictEqual(validateRegistryUrl('https://github.com/foo/bar'), true);
  });

  it('rejects http:// URLs', () => {
    assert.strictEqual(validateRegistryUrl('http://github.com/foo/bar'), false);
  });

  it('rejects non-github URLs', () => {
    assert.strictEqual(validateRegistryUrl('https://evil.com/foo/bar'), false);
  });

  it('rejects empty string', () => {
    assert.strictEqual(validateRegistryUrl(''), false);
  });

  it('rejects null/undefined', () => {
    assert.strictEqual(validateRegistryUrl(null), false);
    assert.strictEqual(validateRegistryUrl(undefined), false);
  });
});

describe('fetchRegistry - fetch success', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns entries and writes cache on successful fetch', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => SAMPLE_INDEX,
    });

    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.strictEqual(result.entries.length, 1);
    assert.strictEqual(result.entries[0].name, 'superpowers');

    const cacheFile = path.join(tmpDir, 'registry-cache.json');
    assert.ok(fs.existsSync(cacheFile));
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    assert.ok(cache.fetchedAt);
    assert.deepStrictEqual(cache.data, SAMPLE_INDEX);
  });
});

describe('fetchRegistry - cache hit', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns cached data without fetching when cache is fresh', async () => {
    const cacheFile = path.join(tmpDir, 'registry-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({
      fetchedAt: Date.now() - 1000,
      data: SAMPLE_INDEX,
    }), 'utf-8');

    let fetchCalled = false;
    const mockFetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };

    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.strictEqual(fetchCalled, false);
    assert.strictEqual(result.entries[0].name, 'superpowers');
  });

  it('refetches when cache is stale (older than 1hr)', async () => {
    const cacheFile = path.join(tmpDir, 'registry-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({
      fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      data: SAMPLE_INDEX,
    }), 'utf-8');

    let fetchCalled = false;
    const freshIndex = { ...SAMPLE_INDEX, entries: [] };
    const mockFetch = async () => { fetchCalled = true; return { ok: true, json: async () => freshIndex }; };

    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.strictEqual(fetchCalled, true);
    assert.strictEqual(result.entries.length, 0);
  });
});

describe('fetchRegistry - fetch failure', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns stale cache when fetch throws', async () => {
    const cacheFile = path.join(tmpDir, 'registry-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({
      fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      data: SAMPLE_INDEX,
    }), 'utf-8');

    const mockFetch = async () => { throw new Error('Network error'); };

    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.strictEqual(result.entries[0].name, 'superpowers');
  });

  it('returns empty entries when fetch fails and no cache exists', async () => {
    const mockFetch = async () => { throw new Error('Network error'); };
    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.deepStrictEqual(result.entries, []);
  });

  it('returns stale cache when server returns non-200', async () => {
    const cacheFile = path.join(tmpDir, 'registry-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({
      fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      data: SAMPLE_INDEX,
    }), 'utf-8');

    const mockFetch = async () => ({ ok: false, status: 503 });
    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.strictEqual(result.entries[0].name, 'superpowers');
  });

  it('returns stale cache when response JSON is malformed', async () => {
    const cacheFile = path.join(tmpDir, 'registry-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({
      fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      data: SAMPLE_INDEX,
    }), 'utf-8');

    const mockFetch = async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('bad JSON'); },
    });
    const result = await fetchRegistry({ skitHome: tmpDir, _fetch: mockFetch });
    assert.strictEqual(result.entries[0].name, 'superpowers');
  });
});
