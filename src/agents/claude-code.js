const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseFrontmatter } = require('../core/scanner');

module.exports = {
  name: 'claude-code',

  skillDir() {
    return path.join(os.homedir(), '.claude', 'skills');
  },

  detectSkill(dir) {
    return fs.existsSync(path.join(dir, 'SKILL.md'));
  },

  getSkillMeta(dir) {
    const content = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return {
      name: frontmatter.name || path.basename(dir),
      description: frontmatter.description || '',
    };
  },
};
