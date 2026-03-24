const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const claudeCode = require('../../src/agents/claude-code');
const { getAdapter, listAdapters } = require('../../src/agents/index');

const fixtureSkillDir = path.join(__dirname, '..', 'fixtures', 'mock-skills', 'test-skill');

describe('claude-code adapter', () => {
  it('has correct name', () => {
    assert.strictEqual(claudeCode.name, 'claude-code');
  });

  it('skillDir() returns path containing .claude/skills', () => {
    const dir = claudeCode.skillDir();
    const expected = path.join(os.homedir(), '.claude', 'skills');
    assert.strictEqual(dir, expected);
  });

  it('detectSkill() returns true for dir with SKILL.md', () => {
    assert.strictEqual(claudeCode.detectSkill(fixtureSkillDir), true);
  });

  it('detectSkill() returns false for dir without SKILL.md', () => {
    assert.strictEqual(claudeCode.detectSkill(os.tmpdir()), false);
  });

  it('getSkillMeta() extracts name and description from frontmatter', () => {
    const meta = claudeCode.getSkillMeta(fixtureSkillDir);
    assert.strictEqual(meta.name, 'test-skill');
    assert.strictEqual(meta.description, 'A test skill for testing');
  });

  it('getSkillMeta() falls back to dir name when no frontmatter name', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skit-agent-test-'));
    const skillDir = path.join(tmpDir, 'my-fallback-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Just a heading\nNo frontmatter here.');

    try {
      const meta = claudeCode.getSkillMeta(skillDir);
      assert.strictEqual(meta.name, 'my-fallback-skill');
      assert.strictEqual(meta.description, '');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('adapter loader', () => {
  it('getAdapter("claude-code") returns the claude-code adapter', () => {
    const adapter = getAdapter('claude-code');
    assert.strictEqual(adapter.name, 'claude-code');
    assert.strictEqual(adapter, claudeCode);
  });

  it('getAdapter("unknown") throws', () => {
    assert.throws(() => getAdapter('unknown'), /Unknown agent adapter: "unknown"/);
  });

  it('listAdapters() returns ["claude-code"]', () => {
    const adapters = listAdapters();
    assert.deepStrictEqual(adapters, ['claude-code']);
  });
});
