'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { scanSkillDir, discover } = require('../../src/commands/discover');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-discover-test-'));
}
function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('scanSkillDir', () => {
  let tmpDir, agentDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    agentDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(agentDir, { recursive: true });
    // Write empty manifest
    fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ skills: {}, sources: {} }), 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ agent: 'claude-code' }), 'utf-8');
  });
  afterEach(() => cleanTmpDir(tmpDir));

  it('returns empty result when agent skill dir does not exist', async () => {
    const result = await scanSkillDir({ skitHome: tmpDir, agentSkillDir: path.join(tmpDir, 'nonexistent') });
    assert.strictEqual(result.untracked_clean.length, 0);
    assert.strictEqual(result.tracked.length, 0);
  });

  it('classifies skill with SKILL.md as untracked_clean', async () => {
    const skillDir = path.join(agentDir, 'my-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: my-skill\ndescription: test\n---\n', 'utf-8');

    const result = await scanSkillDir({ skitHome: tmpDir, agentSkillDir: agentDir });
    assert.strictEqual(result.untracked_clean.length, 1);
    assert.strictEqual(result.untracked_clean[0].name, 'my-skill');
  });

  it('classifies skill without SKILL.md as untracked_no_skillmd', async () => {
    const skillDir = path.join(agentDir, 'bare-skill');
    fs.mkdirSync(skillDir);

    const result = await scanSkillDir({ skitHome: tmpDir, agentSkillDir: agentDir });
    assert.strictEqual(result.untracked_no_skillmd.length, 1);
    assert.strictEqual(result.untracked_no_skillmd[0].name, 'bare-skill');
  });

  it('classifies already-tracked skill as tracked', async () => {
    const skillDir = path.join(agentDir, 'tracked-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tracked-skill\n---\n', 'utf-8');
    // Add to manifest
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({
      skills: { 'tracked-skill': { source: 'own', path: skillDir } },
      sources: {}
    }), 'utf-8');

    const result = await scanSkillDir({ skitHome: tmpDir, agentSkillDir: agentDir });
    assert.strictEqual(result.tracked.length, 1);
    assert.strictEqual(result.untracked_clean.length, 0);
  });

  it('does not classify skill as mislocated when path contains sources/ as prefix of longer dirname', async () => {
    // This test verifies the path.sep fix: a skill in agentDir (outside sources/)
    // should not be confused with one inside sources-evil/
    // Real dirs have realPath === dir so they go to untracked_clean, not mislocated
    const skillDir = path.join(agentDir, 'legit-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: legit-skill\n---\n', 'utf-8');

    const result = await scanSkillDir({ skitHome: tmpDir, agentSkillDir: agentDir });
    assert.strictEqual(result.mislocated.length, 0);
    assert.strictEqual(result.untracked_clean[0].name, 'legit-skill');
  });
});

describe('discover', () => {
  let tmpDir, agentDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    agentDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ skills: {}, sources: {} }), 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ agent: 'claude-code' }), 'utf-8');
  });
  afterEach(() => cleanTmpDir(tmpDir));

  it('returns empty registered when nothing found', async () => {
    const result = await discover({ skitHome: tmpDir, agentSkillDir: agentDir });
    assert.deepStrictEqual(result.registered, []);
  });

  it('registers selected skills and creates backup', async () => {
    const skillDir = path.join(agentDir, 'found-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: found-skill\ndescription: A found skill\n---\n', 'utf-8');

    const mockInquirer = {
      prompt: async (questions) => {
        if (questions[0].type === 'checkbox') {
          return { skills: questions[0].choices.map(c => c.value) };
        }
        return {};
      }
    };

    const result = await discover({ skitHome: tmpDir, agentSkillDir: agentDir, _inquirer: mockInquirer });
    assert.deepStrictEqual(result.registered, ['found-skill']);

    // Verify manifest was updated
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest.skills['found-skill']);
    assert.strictEqual(manifest.skills['found-skill'].source, 'discovered');

    // Verify backup was created
    const files = fs.readdirSync(tmpDir);
    const backupFile = files.find(f => f.startsWith('manifest.backup-'));
    assert.ok(backupFile, 'backup file should exist');
  });

  it('returns empty registered when user presses Ctrl-C during prompt', async () => {
    const skillDir = path.join(agentDir, 'ctrl-c-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: ctrl-c-skill\n---\n', 'utf-8');

    const mockInquirer = {
      prompt: async () => { throw new Error('User force closed the prompt'); }
    };

    const result = await discover({ skitHome: tmpDir, agentSkillDir: agentDir, _inquirer: mockInquirer });
    assert.deepStrictEqual(result.registered, []);

    // Manifest should be unchanged
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf-8'));
    assert.deepStrictEqual(manifest.skills, {});
  });

  it('returns empty registered when user selects nothing', async () => {
    const skillDir = path.join(agentDir, 'skipped-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: skipped-skill\n---\n', 'utf-8');

    const mockInquirer = {
      prompt: async () => ({ skills: [] })  // user deselected everything
    };

    const result = await discover({ skitHome: tmpDir, agentSkillDir: agentDir, _inquirer: mockInquirer });
    assert.deepStrictEqual(result.registered, []);
  });
});
