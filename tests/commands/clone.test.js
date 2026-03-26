const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { clone } = require('../../src/commands/clone');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skit-clone-test-${crypto.randomUUID()}-`));
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
 * Create a skill subdirectory with SKILL.md inside parentDir.
 */
function createSkillDir(parentDir, skillName, description) {
  const skillDir = path.join(parentDir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: ${description || 'A test skill'}\n---\n# ${skillName}\n`
  );
  return skillDir;
}

/**
 * Create a local bare git repo that acts as a "remote", with skill directories.
 * Returns the path to the bare repo.
 */
function createBareRepoWithSkills(tmpDir, repoName, skills) {
  // Create a working repo first
  const workDir = path.join(tmpDir, `${repoName}-work`);
  fs.mkdirSync(workDir, { recursive: true });

  execFileSync('git', ['init'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, stdio: 'pipe' });

  // Create skill directories
  for (const skill of skills) {
    createSkillDir(workDir, skill.name, skill.description);
  }

  execFileSync('git', ['add', '.'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, stdio: 'pipe' });

  // Create a bare clone
  const bareDir = path.join(tmpDir, `${repoName}.git`);
  execFileSync('git', ['clone', '--bare', workDir, bareDir], { stdio: 'pipe' });

  return bareDir;
}

/**
 * Create a valid skit profile JSON.
 */
function createProfile(sources, skills, user = 'testuser') {
  return {
    skit: '1.0',
    user,
    exported: new Date().toISOString(),
    sources: sources.map((s) => ({
      name: s.name,
      type: s.type || 'external',
      origin: s.origin || null,
    })),
    skills: skills.map((sk) => ({
      name: sk.name,
      source: sk.source,
      importedFrom: sk.importedFrom || undefined,
    })),
  };
}

describe('skit clone', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(path.join(skitHome, 'sources', 'own'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'external'), { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('clone from direct URL', () => {
    it('should fetch profile from raw URL and install sources + skills', async () => {
      // Create two bare repos
      const repo1 = createBareRepoWithSkills(tmpDir, 'repo-one', [
        { name: 'skill-a', description: 'Skill A' },
        { name: 'skill-b', description: 'Skill B' },
      ]);
      const repo2 = createBareRepoWithSkills(tmpDir, 'repo-two', [
        { name: 'skill-c', description: 'Skill C' },
      ]);

      // Create a profile JSON
      const profile = createProfile(
        [
          { name: 'repo-one', origin: repo1 },
          { name: 'repo-two', origin: repo2 },
        ],
        [
          { name: 'skill-a', source: 'repo-one' },
          { name: 'skill-b', source: 'repo-one' },
          { name: 'skill-c', source: 'repo-two' },
        ]
      );

      const profileFile = path.join(tmpDir, 'profile.json');
      fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf-8');

      // Mock downloadFile to read from local file
      const mockDownloadFile = async (url, destPath) => {
        fs.copyFileSync(profileFile, destPath);
      };

      const output = await captureStdout(() =>
        clone(`file://${profileFile}`, {
          skitHome,
          agentSkillDir,
          _mockDownloadFile: mockDownloadFile,
        })
      );

      // Check that sources were cloned
      assert.ok(
        fs.existsSync(path.join(skitHome, 'sources', 'external', 'repo-one')),
        'repo-one should be cloned'
      );
      assert.ok(
        fs.existsSync(path.join(skitHome, 'sources', 'external', 'repo-two')),
        'repo-two should be cloned'
      );

      // Check that skills were linked
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'skill-a')), 'skill-a should be linked');
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'skill-b')), 'skill-b should be linked');
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'skill-c')), 'skill-c should be linked');

      // Verify output mentions something
      assert.ok(output.length > 0, 'Should produce some output');
    });
  });

  describe('clone from GitHub username (gh CLI)', () => {
    it('should use gh CLI to find gist with skit-profile.json', async () => {
      // Create a bare repo
      const repo = createBareRepoWithSkills(tmpDir, 'user-repo', [
        { name: 'user-skill', description: 'User skill' },
      ]);

      // Create a profile JSON
      const profile = createProfile(
        [{ name: 'user-repo', origin: repo }],
        [{ name: 'user-skill', source: 'user-repo' }],
        'testuser'
      );

      const profileFile = path.join(tmpDir, 'gist-profile.json');
      fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf-8');

      // Mock execFileSync to simulate gh CLI gist lookup
      const mockExecFileSync = (cmd, args, opts) => {
        if (cmd === 'gh' && args[0] === 'api' && args[1].includes('/users/')) {
          // Return a mock gist list response
          const gistData = [
            {
              id: 'abc123',
              files: {
                'skit-profile.json': {
                  filename: 'skit-profile.json',
                  raw_url: `file://${profileFile}`,
                },
              },
            },
          ];
          return JSON.stringify(gistData);
        }
        // Fall through to real git commands
        return execFileSync(cmd, args, opts);
      };

      // Mock downloadFile to read from local file
      const mockDownloadFile = async (url, destPath) => {
        fs.copyFileSync(profileFile, destPath);
      };

      const output = await captureStdout(() =>
        clone('testuser', {
          skitHome,
          agentSkillDir,
          _mockExecFileSync: mockExecFileSync,
          _mockDownloadFile: mockDownloadFile,
        })
      );

      // Check that repo was cloned
      assert.ok(
        fs.existsSync(path.join(skitHome, 'sources', 'external', 'user-repo')),
        'user-repo should be cloned'
      );

      // Check that skill was linked
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'user-skill')), 'user-skill should be linked');

      // Verify output
      assert.ok(output.length > 0, 'Should produce some output');
    });
  });

  describe('profile not found', () => {
    it('should error when profile URL returns 404', async () => {
      const mockDownloadFile = async (url, destPath) => {
        throw new Error('Download failed with status 404: ' + url);
      };

      const output = await captureStdout(() =>
        clone('https://example.com/missing.json', {
          skitHome,
          agentSkillDir,
          _mockDownloadFile: mockDownloadFile,
        })
      );

      assert.ok(output.includes('404') || output.includes('Error'), 'Should mention error');
    });

    it('should error when username has no skit-profile.json gist', async () => {
      const mockExecFileSync = (cmd, args, opts) => {
        if (cmd === 'gh' && args[0] === 'api') {
          // Return empty gist list
          return JSON.stringify([]);
        }
        return execFileSync(cmd, args, opts);
      };

      const output = await captureStdout(() =>
        clone('nonexistent-user', {
          skitHome,
          agentSkillDir,
          _mockExecFileSync: mockExecFileSync,
        })
      );

      assert.ok(
        output.includes('not found') || output.includes('Error'),
        'Should mention profile not found'
      );
    });
  });

  describe('skip already installed', () => {
    it('should skip sources and skills that are already installed', async () => {
      // Create a bare repo
      const repo = createBareRepoWithSkills(tmpDir, 'existing-repo', [
        { name: 'existing-skill', description: 'Existing skill' },
      ]);

      // Pre-install the repo and skill manually
      const sourceDir = path.join(skitHome, 'sources', 'external', 'existing-repo');
      execFileSync('git', ['clone', repo, sourceDir], { stdio: 'pipe' });

      const manifestPath = path.join(skitHome, 'manifest.json');
      const manifest = {
        version: 1,
        sources: {
          'existing-repo': {
            type: 'external',
            path: sourceDir,
            origin: repo,
            installedAt: new Date().toISOString(),
          },
        },
        skills: {
          'existing-skill': {
            source: 'existing-repo',
            path: 'existing-skill',
            linkedTo: path.join(agentSkillDir, 'existing-skill'),
            installedAt: new Date().toISOString(),
          },
        },
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      // Create the link
      const skillSrcPath = path.join(sourceDir, 'existing-skill');
      const skillLinkPath = path.join(agentSkillDir, 'existing-skill');
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(path.resolve(skillSrcPath), skillLinkPath, linkType);

      // Create profile with the same source/skill
      const profile = createProfile(
        [{ name: 'existing-repo', origin: repo }],
        [{ name: 'existing-skill', source: 'existing-repo' }]
      );

      const profileFile = path.join(tmpDir, 'profile.json');
      fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf-8');

      const mockDownloadFile = async (url, destPath) => {
        fs.copyFileSync(profileFile, destPath);
      };

      const output = await captureStdout(() =>
        clone(`file://${profileFile}`, {
          skitHome,
          agentSkillDir,
          _mockDownloadFile: mockDownloadFile,
        })
      );

      // Output should mention skipping
      assert.ok(output.includes('skip') || output.includes('already'), 'Should mention skipping');
    });
  });

  describe('standalone skills with no origin', () => {
    it('should skip standalone skills with no clonable origin', async () => {
      // Create profile with standalone skill (no origin)
      const profile = createProfile(
        [{ name: '_standalone', origin: null }],
        [{ name: 'standalone-skill', source: '_standalone', importedFrom: 'https://gist.github.com/someone/abc' }]
      );

      const profileFile = path.join(tmpDir, 'profile.json');
      fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf-8');

      const mockDownloadFile = async (url, destPath) => {
        fs.copyFileSync(profileFile, destPath);
      };

      const output = await captureStdout(() =>
        clone(`file://${profileFile}`, {
          skitHome,
          agentSkillDir,
          _mockDownloadFile: mockDownloadFile,
        })
      );

      // Should mention skipping the standalone source/skill
      assert.ok(
        output.includes('Skipping') || output.includes('standalone'),
        'Should mention skipping standalone'
      );
    });
  });

  describe('summary output', () => {
    it('should show summary of sources cloned and skills linked', async () => {
      const repo = createBareRepoWithSkills(tmpDir, 'summary-repo', [
        { name: 'summary-skill', description: 'Summary skill' },
      ]);

      const profile = createProfile(
        [{ name: 'summary-repo', origin: repo }],
        [{ name: 'summary-skill', source: 'summary-repo' }]
      );

      const profileFile = path.join(tmpDir, 'profile.json');
      fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2), 'utf-8');

      const mockDownloadFile = async (url, destPath) => {
        fs.copyFileSync(profileFile, destPath);
      };

      const output = await captureStdout(() =>
        clone(`file://${profileFile}`, {
          skitHome,
          agentSkillDir,
          _mockDownloadFile: mockDownloadFile,
        })
      );

      // Should mention summary
      assert.ok(
        output.includes('complete') || output.includes('cloned') || output.includes('linked'),
        'Should show summary'
      );
    });
  });
});
