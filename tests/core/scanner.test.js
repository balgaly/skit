const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { scanForSkills, parseFrontmatter } = require('../../src/core/scanner');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-scanner-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function createSkillDir(parentDir, dirName, frontmatter) {
  const skillDir = path.join(parentDir, dirName);
  fs.mkdirSync(skillDir, { recursive: true });
  let content = '';
  if (frontmatter !== undefined) {
    content = `---\n`;
    for (const [key, value] of Object.entries(frontmatter)) {
      content += `${key}: ${value}\n`;
    }
    content += `---\n\n# ${dirName}\n`;
  }
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  return skillDir;
}

// --- parseFrontmatter ---

describe('parseFrontmatter', () => {
  it('extracts name and description from frontmatter', () => {
    const content = '---\nname: view-md\ndescription: Renders markdown as HTML\n---\n\n# View MD\n';
    const result = parseFrontmatter(content);
    assert.strictEqual(result.name, 'view-md');
    assert.strictEqual(result.description, 'Renders markdown as HTML');
  });

  it('returns empty object for content with no frontmatter', () => {
    const content = '# Just a heading\n\nSome body text.\n';
    const result = parseFrontmatter(content);
    assert.deepStrictEqual(result, {});
  });

  it('returns empty object for empty string', () => {
    assert.deepStrictEqual(parseFrontmatter(''), {});
  });

  it('handles frontmatter with extra fields', () => {
    const content = '---\nname: my-skill\nauthor: test\ntags: foo\n---\n';
    const result = parseFrontmatter(content);
    assert.strictEqual(result.name, 'my-skill');
    assert.strictEqual(result.author, 'test');
  });

  it('handles values with colons in them', () => {
    const content = '---\nname: my-skill\ndescription: Use when: user wants help\n---\n';
    const result = parseFrontmatter(content);
    assert.strictEqual(result.description, 'Use when: user wants help');
  });

  it('returns empty object when only one delimiter exists', () => {
    const content = '---\nname: broken\nno closing delimiter\n';
    const result = parseFrontmatter(content);
    assert.deepStrictEqual(result, {});
  });
});

// --- scanForSkills ---

describe('scanForSkills', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('finds skills in a directory', () => {
    createSkillDir(tmpDir, 'view-md', { name: 'view-md', description: 'Renders markdown' });
    createSkillDir(tmpDir, 'run-tests', { name: 'run-tests', description: 'Runs test suite' });

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills.length, 2);

    const names = skills.map(s => s.name).sort();
    assert.deepStrictEqual(names, ['run-tests', 'view-md']);
  });

  it('returns empty array for empty directory', () => {
    const skills = scanForSkills(tmpDir);
    assert.deepStrictEqual(skills, []);
  });

  it('ignores directories without SKILL.md', () => {
    createSkillDir(tmpDir, 'real-skill', { name: 'real-skill', description: 'A real one' });
    // Create a directory without SKILL.md
    fs.mkdirSync(path.join(tmpDir, 'not-a-skill'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'not-a-skill', 'README.md'), '# Not a skill');

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'real-skill');
  });

  it('falls back to directory name when frontmatter has no name', () => {
    createSkillDir(tmpDir, 'my-cool-skill', { description: 'No name field here' });

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'my-cool-skill');
  });

  it('uses empty string for description when not in frontmatter', () => {
    createSkillDir(tmpDir, 'no-desc', { name: 'no-desc' });

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].description, '');
  });

  it('returns path relative to the scanned directory', () => {
    createSkillDir(tmpDir, 'view-md', { name: 'view-md', description: 'test' });

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills[0].path, 'view-md');
  });

  it('only scans one level deep (not deeply nested)', () => {
    // Create a nested skill two levels deep — should not be found
    const nested = path.join(tmpDir, 'level1', 'level2');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'SKILL.md'), '---\nname: deep-skill\ndescription: Too deep\n---\n');

    // Create a valid top-level skill
    createSkillDir(tmpDir, 'top-skill', { name: 'top-skill', description: 'Top level' });

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'top-skill');
  });

  it('finds SKILL.md at root level (single-skill repos)', () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '---\nname: root-skill\ndescription: A root skill\n---\n');
    createSkillDir(tmpDir, 'sub-skill', { name: 'sub-skill', description: 'A sub skill' });

    const skills = scanForSkills(tmpDir);
    assert.strictEqual(skills.length, 2);
    const names = skills.map(s => s.name);
    assert.ok(names.includes('root-skill'));
    assert.ok(names.includes('sub-skill'));
    const rootSkill = skills.find(s => s.name === 'root-skill');
    assert.strictEqual(rootSkill.path, '.');
  });

  it('works with the existing test fixture', () => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures', 'mock-skills');
    const skills = scanForSkills(fixturesDir);
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'test-skill');
    assert.strictEqual(skills[0].description, 'A test skill for testing');
    assert.strictEqual(skills[0].path, 'test-skill');
  });
});
