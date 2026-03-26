'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { profilePush } = require('../../src/commands/profile');
const { writeManifest } = require('../../src/core/manifest');
const { writeConfig } = require('../../src/core/config');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skit-profile-push-test-${crypto.randomUUID()}-`));
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

describe('skit profile push', () => {
  let tmpDir;
  let skitHome;
  let mockCalls;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    fs.mkdirSync(skitHome, { recursive: true });
    mockCalls = [];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new gist when no gistUrl in config', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'my-skills': { type: 'own', origin: 'https://github.com/testuser/my-skills', path: '/tmp/my-skills' },
      },
      skills: {
        'skill-one': { source: 'my-skills', path: 'skill-one' },
      },
    });

    const mockExecFileSync = (cmd, args, opts) => {
      mockCalls.push({ cmd, args, opts });
      return Buffer.from('https://gist.github.com/testuser/abc123def456');
    };

    const output = await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    // Should call gh gist create (using execFileSync for security)
    assert.equal(mockCalls.length, 1);
    const call = mockCalls[0];
    assert.equal(call.cmd, 'gh');
    assert.deepStrictEqual(call.args.slice(0, 2), ['gist', 'create']);
    assert.ok(call.args.includes('--public'));
    assert.ok(call.args.includes('--desc'));

    // Should print success message with gist URL
    assert.ok(output.includes('https://gist.github.com/testuser/abc123def456'));
    assert.ok(output.includes('Published') || output.includes('pushed'));

    // Should store gist URL in config
    const updatedConfig = JSON.parse(fs.readFileSync(path.join(skitHome, 'config.json'), 'utf-8'));
    assert.equal(updatedConfig.gistUrl, 'https://gist.github.com/testuser/abc123def456');
  });

  it('updates existing gist when gistUrl is in config', async () => {
    writeConfig(skitHome, {
      agent: 'claude-code',
      user: 'testuser',
      gistUrl: 'https://gist.github.com/testuser/existing123',
    });
    writeManifest(skitHome, {
      version: 1,
      sources: {},
      skills: {},
    });

    const mockExecFileSync = (cmd, args, opts) => {
      mockCalls.push({ cmd, args, opts });
      return Buffer.from('https://gist.github.com/testuser/existing123');
    };

    const output = await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    // Should call gh gist edit (using execFileSync for security)
    assert.equal(mockCalls.length, 1);
    const call = mockCalls[0];
    assert.equal(call.cmd, 'gh');
    assert.deepStrictEqual(call.args.slice(0, 2), ['gist', 'edit']);
    assert.ok(call.args.includes('existing123'));

    // Should print success with URL
    assert.ok(output.includes('https://gist.github.com/testuser/existing123'));
    assert.ok(output.includes('Updated') || output.includes('pushed'));
  });

  it('handles gh CLI not available gracefully', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const mockExecFileSync = (cmd, args, opts) => {
      const err = new Error('Command failed: gh');
      err.code = 'ENOENT';
      throw err;
    };

    const output = await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    // Should print helpful error message
    assert.ok(output.includes('gh') || output.includes('GitHub CLI'));
    assert.ok(output.includes('not found') || output.includes('not installed') || output.includes('install'));
  });

  it('writes profile to temp file and passes it to gh', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'my-skills': { type: 'own', origin: 'https://github.com/testuser/my-skills', path: '/tmp/my-skills' },
      },
      skills: {
        'skill-one': { source: 'my-skills', path: 'skill-one' },
      },
    });

    const mockExecFileSync = (cmd, args, opts) => {
      mockCalls.push({ cmd, args, opts });
      return Buffer.from('https://gist.github.com/testuser/abc123');
    };

    await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    const call = mockCalls[0];
    const args = call.args;

    // Find the temp file path in the args
    const fileArgIndex = args.indexOf('--filename');
    assert.ok(fileArgIndex !== -1, 'Should have --filename argument');
    assert.equal(args[fileArgIndex + 1], 'skit-profile.json');

    // Find the temp file content arg (last arg should be the file path)
    const tempFilePath = args[args.length - 1];
    assert.ok(tempFilePath.includes('.json'), 'Last arg should be a JSON file path');

    // Temp file should have been created (or deleted after - we can't verify without changing impl)
    // Just verify the args are correct structure
  });

  it('includes skill count in gist description', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'source-a': { type: 'own', origin: 'https://github.com/testuser/source-a', path: '/tmp/source-a' },
        'source-b': { type: 'external', origin: 'https://github.com/other/source-b', path: '/tmp/source-b' },
      },
      skills: {
        'skill-one': { source: 'source-a', path: 'skill-one' },
        'skill-two': { source: 'source-a', path: 'skill-two' },
        'skill-three': { source: 'source-b', path: 'skill-three' },
      },
    });

    const mockExecFileSync = (cmd, args, opts) => {
      mockCalls.push({ cmd, args, opts });
      return Buffer.from('https://gist.github.com/testuser/abc123');
    };

    await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    const call = mockCalls[0];
    const args = call.args;
    const descIndex = args.indexOf('--desc');
    assert.ok(descIndex !== -1, 'Should have --desc argument');

    const description = args[descIndex + 1];
    assert.ok(description.includes('3') && description.includes('skill'), 'Description should mention 3 skills');
    assert.ok(description.includes('2') && description.includes('source'), 'Description should mention 2 sources');
  });

  it('prints shareable clone command after success', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const mockExecFileSync = (cmd, args, opts) => {
      return Buffer.from('https://gist.github.com/testuser/abc123');
    };

    const output = await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    assert.ok(output.includes('npx skit clone testuser') || output.includes('skit clone testuser'));
  });

  it('handles gh CLI error with helpful message', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const mockExecFileSync = (cmd, args, opts) => {
      const err = new Error('gh: Not logged in');
      err.status = 1;
      throw err;
    };

    const output = await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    // Should print error and suggest login
    assert.ok(output.includes('Error') || output.includes('Failed'));
    assert.ok(output.includes('gh') || output.includes('GitHub'));
  });

  it('generates valid profile JSON before pushing', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'test-skills': { type: 'own', origin: 'https://github.com/testuser/test-skills', path: '/tmp/test-skills' },
      },
      skills: {
        'my-skill': { source: 'test-skills', path: 'my-skill', importedFrom: null },
      },
    });

    // Capture the temp file content by intercepting the gh call
    let capturedContent = null;
    const mockExecFileSync = (cmd, args, opts) => {
      // Last arg should be the temp file path
      const tempFilePath = args[args.length - 1];
      if (fs.existsSync(tempFilePath)) {
        capturedContent = fs.readFileSync(tempFilePath, 'utf-8');
      }
      return Buffer.from('https://gist.github.com/testuser/abc123');
    };

    await captureStdout(() => profilePush({ skitHome, _mockExecFileSync: mockExecFileSync }));

    // Verify the profile JSON was valid
    assert.ok(capturedContent, 'Should have captured temp file content');
    const profile = JSON.parse(capturedContent);
    assert.equal(profile.skit, '1.0');
    assert.equal(profile.user, 'testuser');
    assert.ok(Array.isArray(profile.sources));
    assert.ok(Array.isArray(profile.skills));
    assert.equal(profile.sources.length, 1);
    assert.equal(profile.skills.length, 1);
  });
});
