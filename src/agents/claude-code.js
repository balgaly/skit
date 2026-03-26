const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseFrontmatter } = require('../core/scanner');

module.exports = {
  name: 'claude-code',

  skillDir() {
    // Allow override via environment variable (for testing)
    if (process.env.SKIT_AGENT_SKILL_DIR) {
      return process.env.SKIT_AGENT_SKILL_DIR;
    }
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
