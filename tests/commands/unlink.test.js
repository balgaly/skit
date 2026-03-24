const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { unlink } = require('../../src/commands/unlink');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-unlink-test-'));
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

/**
 * Create a junction/symlink in agentSkillDir pointing to source.
 */
function createLink(source, agentSkillDir, name) {
  const targetPath = path.join(agentSkillDir, name);
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(path.resolve(source), targetPath, type);
  return targetPath;
}

describe('skit unlink', () => {
  let tmpDir;
  let skillSource;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create a source directory to link to
    skillSource = path.join(tmpDir, 'my-cool-skill');
    fs.mkdirSync(skillSource, { recursive: true });
    fs.writeFileSync(path.join(skillSource, 'SKILL.md'), '# My Cool Skill\n');

    // Create a mock agent skill directory
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(agentSkillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes an existing junction/symlink', async () => {
    const linkPath = createLink(skillSource, agentSkillDir, 'my-cool-skill');

    // Verify link exists before unlink
    assert.ok(fs.existsSync(linkPath), 'Link should exist before unlink');
    assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), 'Should be a symlink');

    const output = await captureStdout(() =>
      unlink('my-cool-skill', { agentSkillDir })
    );

    // Link should be gone
    assert.ok(!fs.existsSync(linkPath), 'Link should be removed');
    // Source should still exist
    assert.ok(fs.existsSync(skillSource), 'Source directory should still exist');
    // Output should indicate success
    assert.ok(output.includes('my-cool-skill'), 'Output should contain skill name');
    assert.ok(
      output.includes('Unlinked') || output.includes('unlinked') || output.includes('Removed'),
      `Expected success message, got: ${output}`
    );
  });

  it('shows error when skill does not exist', async () => {
    const output = await captureStdout(() =>
      unlink('nonexistent-skill', { agentSkillDir })
    );

    assert.ok(
      output.includes('not found') || output.includes('does not exist'),
      `Expected error about nonexistent skill, got: ${output}`
    );
  });

  it('shows error when target is a real directory (not a link)', async () => {
    // Create a real directory (not a symlink) in the agent skill dir
    const realDir = path.join(agentSkillDir, 'real-dir-skill');
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, 'SKILL.md'), '# Real\n');

    const output = await captureStdout(() =>
      unlink('real-dir-skill', { agentSkillDir })
    );

    // Should warn/error that it's not a symlink
    assert.ok(
      output.includes('not a link') || output.includes('not a symlink') || output.includes('not linked'),
      `Expected warning about non-symlink, got: ${output}`
    );
    // Should NOT remove the real directory
    assert.ok(fs.existsSync(realDir), 'Real directory should not be removed');
  });
});
