const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { link } = require('../../src/commands/link');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-link-test-'));
}

/**
 * Capture stdout during a function call.
 */
async function captureStdout(fn) {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join('');
}

describe('skit link', () => {
  let tmpDir;
  let skillSource;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create a valid skill source directory with SKILL.md
    skillSource = path.join(tmpDir, 'my-cool-skill');
    fs.mkdirSync(skillSource, { recursive: true });
    fs.writeFileSync(
      path.join(skillSource, 'SKILL.md'),
      '---\nname: my-cool-skill\ndescription: A cool skill\n---\n# My Cool Skill\n'
    );

    // Create a mock agent skill directory (instead of real ~/.claude/skills)
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(agentSkillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a working junction/symlink for a valid skill', async () => {
    const output = await captureStdout(() =>
      link(skillSource, { agentSkillDir })
    );

    const linkPath = path.join(agentSkillDir, 'my-cool-skill');
    // Link should exist
    assert.ok(fs.existsSync(linkPath), 'Link should exist');
    // Should be a symlink/junction
    const stats = fs.lstatSync(linkPath);
    assert.ok(stats.isSymbolicLink(), 'Should be a symlink');
    // Should be able to read through the link
    const content = fs.readFileSync(path.join(linkPath, 'SKILL.md'), 'utf-8');
    assert.ok(content.includes('My Cool Skill'));
    // Output should indicate success
    assert.ok(output.includes('my-cool-skill'), 'Output should contain skill name');
  });

  it('uses directory name as fallback when SKILL.md has no frontmatter name', async () => {
    // Create skill with no name in frontmatter
    const noNameSkill = path.join(tmpDir, 'fallback-name');
    fs.mkdirSync(noNameSkill, { recursive: true });
    fs.writeFileSync(path.join(noNameSkill, 'SKILL.md'), '# Just a heading\n');

    const output = await captureStdout(() =>
      link(noNameSkill, { agentSkillDir })
    );

    const linkPath = path.join(agentSkillDir, 'fallback-name');
    assert.ok(fs.existsSync(linkPath), 'Link should exist with directory name');
    assert.ok(output.includes('fallback-name'), 'Output should contain fallback name');
  });

  it('shows error when path does not exist', async () => {
    const badPath = path.join(tmpDir, 'nonexistent');
    const output = await captureStdout(() =>
      link(badPath, { agentSkillDir })
    );

    assert.ok(
      output.includes('does not exist') || output.includes('not found'),
      `Expected error about nonexistent path, got: ${output}`
    );
    // No link should be created
    const entries = fs.readdirSync(agentSkillDir);
    assert.equal(entries.length, 0, 'No links should be created');
  });

  it('shows error when path has no SKILL.md', async () => {
    const noSkillDir = path.join(tmpDir, 'no-skill');
    fs.mkdirSync(noSkillDir, { recursive: true });
    fs.writeFileSync(path.join(noSkillDir, 'README.md'), '# Not a skill');

    const output = await captureStdout(() =>
      link(noSkillDir, { agentSkillDir })
    );

    assert.ok(
      output.includes('SKILL.md') || output.includes('not a valid skill'),
      `Expected error about missing SKILL.md, got: ${output}`
    );
    const entries = fs.readdirSync(agentSkillDir);
    assert.equal(entries.length, 0, 'No links should be created');
  });

  it('shows error when skill name already exists in target', async () => {
    // First link succeeds
    await captureStdout(() => link(skillSource, { agentSkillDir }));

    // Second link with same name should fail
    const output = await captureStdout(() =>
      link(skillSource, { agentSkillDir })
    );

    assert.ok(
      output.includes('already exists'),
      `Expected error about existing skill, got: ${output}`
    );
  });
});
