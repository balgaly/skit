const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseFrontmatter } = require('../core/scanner');

module.exports = {
  name: 'windsurf',

  skillDir() {
    // Allow override via environment variable (for testing)
    if (process.env.SKIT_AGENT_SKILL_DIR) {
      return process.env.SKIT_AGENT_SKILL_DIR;
    }
    return path.join(os.homedir(), '.windsurf', 'rules');
  },

  detectSkill(dir) {
    // Accept SKILL.md (cross-agent skills) or .windsurfrules (Windsurf-native format)
    return (
      fs.existsSync(path.join(dir, 'SKILL.md')) ||
      fs.existsSync(path.join(dir, '.windsurfrules'))
    );
  },

  getSkillMeta(dir) {
    // Prefer SKILL.md frontmatter for cross-agent compatibility
    const skillMd = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      const content = fs.readFileSync(skillMd, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      return {
        name: frontmatter.name || path.basename(dir),
        description: frontmatter.description || '',
      };
    }
    // Fall back to directory name for .windsurfrules-only skills
    return {
      name: path.basename(dir),
      description: '',
    };
  },
};
