'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { enable, disable, isEnabled, allow } = require('../../src/core/incognito');

const HOOK_CMD = 'node .claude/quarantine-plugins.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-incognito-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeState(dir, state) {
  const stateDir = path.join(dir, '.claude');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'incognito-state.json'), JSON.stringify(state));
}

function readSettings(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf-8'));
}

// ─── isEnabled ───────────────────────────────────────────────────────────────

describe('isEnabled', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns false when state file does not exist', () => {
    assert.strictEqual(isEnabled(tmpDir), false);
  });

  it('returns false when state.enabled is false', () => {
    writeState(tmpDir, { enabled: false });
    assert.strictEqual(isEnabled(tmpDir), false);
  });

  it('returns true when state.enabled is true', () => {
    writeState(tmpDir, { enabled: true, managedPlugins: [], managedDenySkills: [] });
    assert.strictEqual(isEnabled(tmpDir), true);
  });

  it('returns false for corrupt state file', () => {
    const stateDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'incognito-state.json'), 'not json {{{');
    assert.strictEqual(isEnabled(tmpDir), false);
  });

  it('returns false for non-existent project path', () => {
    assert.strictEqual(isEnabled(path.join(os.tmpdir(), 'skit-no-such-dir-xyz')), false);
  });
});

// ─── enable ──────────────────────────────────────────────────────────────────

describe('enable', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns INVALID_PATH error for non-existent directory', () => {
    const result = enable(path.join(os.tmpdir(), 'skit-no-such-dir-xyz'));
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_PATH');
  });

  it('returns success with pluginsQuarantined and skillsBlocked counts', () => {
    const result = enable(tmpDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.pluginsQuarantined, 'number');
    assert.strictEqual(typeof result.skillsBlocked, 'number');
  });

  it('creates .claude/quarantine-plugins.js', () => {
    enable(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'quarantine-plugins.js')));
  });

  it('creates state file with enabled: true', () => {
    enable(tmpDir);
    const state = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'incognito-state.json'), 'utf-8'));
    assert.strictEqual(state.enabled, true);
    assert.ok(Array.isArray(state.managedPlugins));
    assert.ok(Array.isArray(state.managedDenySkills));
  });

  it('adds SessionStart hook to settings.local.json', () => {
    enable(tmpDir);
    const settings = readSettings(tmpDir);
    const hasHook = settings.hooks.SessionStart.some(g =>
      Array.isArray(g.hooks) && g.hooks.some(h => h.command === HOOK_CMD)
    );
    assert.ok(hasHook, 'SessionStart hook should be present');
  });

  it('returns alreadyEnabled: true when called twice', () => {
    enable(tmpDir);
    const result = enable(tmpDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyEnabled, true);
  });

  it('does not duplicate SessionStart hook on re-enable', () => {
    enable(tmpDir);
    // Reset state so second enable runs
    writeState(tmpDir, { enabled: false, managedPlugins: [], managedDenySkills: [] });
    enable(tmpDir);
    const settings = readSettings(tmpDir);
    const hookCount = (settings.hooks.SessionStart || []).reduce(
      (n, g) => n + (g.hooks || []).filter(h => h.command === HOOK_CMD).length, 0
    );
    assert.strictEqual(hookCount, 1, 'SessionStart hook should not be duplicated');
  });

  it('preserves existing permissions.allow entries', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(git:*)'] } })
    );
    enable(tmpDir);
    const settings = readSettings(tmpDir);
    assert.ok(
      settings.permissions.allow.includes('Bash(git:*)'),
      'Pre-existing allow entry should be preserved'
    );
  });

  it('quarantines globally-enabled plugins', () => {
    // Set up a fake global settings with an enabled plugin
    const homeClaudeDir = path.join(os.homedir(), '.claude');
    const globalPath = path.join(homeClaudeDir, 'settings.json');
    let originalGlobal = null;
    try { originalGlobal = fs.readFileSync(globalPath, 'utf-8'); } catch { /* not present */ }

    fs.mkdirSync(homeClaudeDir, { recursive: true });
    fs.writeFileSync(globalPath, JSON.stringify({ enabledPlugins: { 'test-plugin@test': true } }));

    try {
      enable(tmpDir);
      const settings = readSettings(tmpDir);
      assert.strictEqual(settings.enabledPlugins['test-plugin@test'], false,
        'Globally enabled plugin should be quarantined to false');
    } finally {
      if (originalGlobal !== null) {
        fs.writeFileSync(globalPath, originalGlobal);
      } else {
        try { fs.unlinkSync(globalPath); } catch { /* ok */ }
      }
    }
  });
});

// ─── disable ─────────────────────────────────────────────────────────────────

describe('disable', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns INVALID_PATH error for non-existent directory', () => {
    const result = disable(path.join(os.tmpdir(), 'skit-no-such-dir-xyz'));
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_PATH');
  });

  it('returns alreadyDisabled: true when not enabled', () => {
    const result = disable(tmpDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyDisabled, true);
  });

  it('removes quarantine-plugins.js', () => {
    enable(tmpDir);
    disable(tmpDir);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'quarantine-plugins.js')));
  });

  it('removes incognito-state.json', () => {
    enable(tmpDir);
    disable(tmpDir);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'incognito-state.json')));
  });

  it('removes SessionStart hook from settings.local.json', () => {
    enable(tmpDir);
    disable(tmpDir);
    const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hasHook = settings.hooks &&
        settings.hooks.SessionStart &&
        settings.hooks.SessionStart.some(g =>
          Array.isArray(g.hooks) && g.hooks.some(h => h.command === HOOK_CMD)
        );
      assert.ok(!hasHook, 'SessionStart hook should be removed after disable');
    }
  });

  it('preserves non-incognito permissions.allow entries', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(git:*)'] } })
    );
    enable(tmpDir);
    disable(tmpDir);
    const settingsPath = path.join(claudeDir, 'settings.local.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.ok(
        settings.permissions && settings.permissions.allow &&
        settings.permissions.allow.includes('Bash(git:*)'),
        'Non-incognito allow entry should survive disable'
      );
    }
  });

  it('is idempotent — disable after disable returns alreadyDisabled', () => {
    enable(tmpDir);
    disable(tmpDir);
    const result = disable(tmpDir);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyDisabled, true);
  });

  it('full round-trip: enable → disable returns success', () => {
    const r1 = enable(tmpDir);
    assert.strictEqual(r1.success, true);
    const r2 = disable(tmpDir);
    assert.strictEqual(r2.success, true);
    assert.strictEqual(isEnabled(tmpDir), false);
  });
});

// ─── allow ───────────────────────────────────────────────────────────────────

describe('allow', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    enable(tmpDir);
  });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns INVALID_PATH error for non-existent directory', () => {
    const result = allow(path.join(os.tmpdir(), 'skit-no-such-dir-xyz'), 'ship');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_PATH');
  });

  it('returns INVALID_NAME for empty string', () => {
    const result = allow(tmpDir, '');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_NAME');
  });

  it('returns INVALID_NAME for name with newline', () => {
    const result = allow(tmpDir, 'foo\nbar');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_NAME');
  });

  it('returns INVALID_NAME for name with quotes', () => {
    const result = allow(tmpDir, 'foo"bar');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_NAME');
  });

  it('returns INVALID_NAME for name exceeding 200 characters', () => {
    const result = allow(tmpDir, 'a'.repeat(201));
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.code, 'INVALID_NAME');
  });

  it('adds Skill(name) to permissions.allow for a skill', () => {
    const result = allow(tmpDir, 'ship');
    assert.strictEqual(result.success, true);
    const settings = readSettings(tmpDir);
    assert.ok(settings.permissions.allow.includes('Skill(ship)'));
  });

  it('removes skill from permissions.deny when allowing', () => {
    // Add to deny first
    const settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    settings.permissions = settings.permissions || {};
    settings.permissions.deny = [...(settings.permissions.deny || []), 'Skill(ship)'];
    fs.writeFileSync(settingsPath, JSON.stringify(settings));

    allow(tmpDir, 'ship');
    const updated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    assert.ok(!(updated.permissions.deny || []).includes('Skill(ship)'),
      'Skill(ship) should be removed from deny list');
  });

  it('sets plugin to true in enabledPlugins for a plugin', () => {
    const result = allow(tmpDir, 'superpowers@claude-plugins-official');
    assert.strictEqual(result.success, true);
    const settings = readSettings(tmpDir);
    assert.strictEqual(settings.enabledPlugins['superpowers@claude-plugins-official'], true);
  });

  it('is idempotent — allowing same skill twice does not duplicate entry', () => {
    allow(tmpDir, 'ship');
    allow(tmpDir, 'ship');
    const settings = readSettings(tmpDir);
    const count = (settings.permissions.allow || []).filter(e => e === 'Skill(ship)').length;
    assert.strictEqual(count, 1, 'Skill(ship) should appear exactly once');
  });

  it('accepts valid names with hyphens and underscores', () => {
    assert.strictEqual(allow(tmpDir, 'my-skill').success, true);
    assert.strictEqual(allow(tmpDir, 'my_skill').success, true);
    assert.strictEqual(allow(tmpDir, 'code-reviewer').success, true);
  });
});
