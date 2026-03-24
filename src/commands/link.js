const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');

const { linkSkill } = require('../core/linker');
const { parseFrontmatter } = require('../core/scanner');
const { getAgentAdapter } = require('../index');

/**
 * Link a skill directory into the agent's skill directory.
 *
 * @param {string} skillPath — path to the skill directory
 * @param {object} [options]
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 */
function link(skillPath, options = {}) {
  const resolved = path.resolve(skillPath);

  // Validate: path exists
  if (!fs.existsSync(resolved)) {
    console.log(chalk.red(`Error: path does not exist: ${resolved}`));
    return;
  }

  // Validate: path contains SKILL.md
  const skillMdPath = path.join(resolved, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    console.log(chalk.red(`Error: not a valid skill — SKILL.md not found in ${resolved}`));
    return;
  }

  // Get skill name from frontmatter (fallback to directory name)
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  const skillName = frontmatter.name || path.basename(resolved);

  // Get agent skill directory
  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();

  // Ensure agent skill directory exists
  fs.mkdirSync(agentSkillDir, { recursive: true });

  // Build target path
  const targetPath = path.join(agentSkillDir, skillName);

  // Check if already exists
  if (fs.existsSync(targetPath)) {
    console.log(chalk.red(`Error: skill "${skillName}" already exists at ${targetPath}`));
    return;
  }

  // Create the link
  linkSkill(resolved, targetPath);

  console.log(
    chalk.green(`Linked `) +
    chalk.bold(skillName) +
    chalk.green(` → ${targetPath}`)
  );
}

module.exports = { link };
