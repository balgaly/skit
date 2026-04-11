'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('tui module exports', () => {
  it('exports a tui function', () => {
    const { tui } = require('../../src/commands/tui');
    assert.strictEqual(typeof tui, 'function');
  });
});

describe('tui routing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skit-tui-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls doctor when health-check action is chosen', async () => {
    let doctorCalled = false;
    const { tui } = require('../../src/commands/tui');

    await tui({
      _pickAction: async () => 'health-check',
      _doctor: async () => { doctorCalled = true; return { issues: 0 }; },
      _update: async () => {},
      _sync: async () => {},
      _browse: async () => {},
      _mySkills: async () => {},
      _discover: async () => {},
      _inquirer: { prompt: async () => ({ scan: false }) },
      skitHome: tmpDir,
    });

    assert.strictEqual(doctorCalled, true);
  });

  it('calls update and sync when update-sync action is chosen', async () => {
    let updateCalled = false;
    let syncCalled = false;
    const { tui } = require('../../src/commands/tui');

    await tui({
      _pickAction: async () => 'update-sync',
      _doctor: async () => {},
      _update: async () => { updateCalled = true; },
      _sync: async () => { syncCalled = true; },
      _browse: async () => {},
      _mySkills: async () => {},
      _discover: async () => {},
      _inquirer: { prompt: async () => ({ scan: false }) },
      skitHome: tmpDir,
    });

    assert.strictEqual(updateCalled, true);
    assert.strictEqual(syncCalled, true);
  });

  it('exits cleanly when exit action is chosen', async () => {
    const { tui } = require('../../src/commands/tui');
    await tui({
      _pickAction: async () => 'exit',
      _doctor: async () => {},
      _update: async () => {},
      _sync: async () => {},
      _browse: async () => {},
      _mySkills: async () => {},
      _discover: async () => {},
      _inquirer: { prompt: async () => ({ scan: false }) },
      skitHome: tmpDir,
    });
  });

  it('calls browse screen when browse action is chosen', async () => {
    let browseCalled = false;
    const { tui } = require('../../src/commands/tui');

    await tui({
      _pickAction: async () => 'browse',
      _doctor: async () => {},
      _update: async () => {},
      _sync: async () => {},
      _browse: async () => { browseCalled = true; },
      _mySkills: async () => {},
      _discover: async () => {},
      _inquirer: { prompt: async () => ({ scan: false }) },
      skitHome: tmpDir,
    });

    assert.strictEqual(browseCalled, true);
  });

  it('calls my-skills screen when my-skills action is chosen', async () => {
    let mySkillsCalled = false;
    const { tui } = require('../../src/commands/tui');

    await tui({
      _pickAction: async () => 'my-skills',
      _doctor: async () => {},
      _update: async () => {},
      _sync: async () => {},
      _browse: async () => {},
      _mySkills: async () => { mySkillsCalled = true; },
      _discover: async () => {},
      _inquirer: { prompt: async () => ({ scan: false }) },
      skitHome: tmpDir,
    });

    assert.strictEqual(mySkillsCalled, true);
  });

  it('calls discover when discover action is chosen', async () => {
    let discoverCalled = false;
    const { tui } = require('../../src/commands/tui');

    await tui({
      _pickAction: async () => 'discover',
      _doctor: async () => {},
      _update: async () => {},
      _sync: async () => {},
      _browse: async () => {},
      _mySkills: async () => {},
      _discover: async () => { discoverCalled = true; },
      _inquirer: { prompt: async () => ({ scan: false }) },
      skitHome: tmpDir,
    });

    assert.strictEqual(discoverCalled, true);
  });
});
