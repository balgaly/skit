const fs = require('node:fs');
const path = require('node:path');
const format = require('../ui/format');

const { unlinkSkill, isLinked } = require('../core/linker');
const { getAgentAdapter } = require('../index');

/**
 * Unlink a skill from the agent's skill directory.
 * Removes the junction/symlink but keeps the source.
 *
 * @param {string} skillName — name of the skill to unlink
 * @param {object} [options]
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 */
function unlink(skillName, options = {}) {
  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  const targetPath = path.join(agentSkillDir, skillName);

  // Validate: skill exists in agent directory
  if (!fs.existsSync(targetPath)) {
    console.log(format.error(`Error: skill "${skillName}" not found in ${agentSkillDir}`));
    return;
  }

  // Validate: it's actually a symlink/junction
  if (!isLinked(targetPath)) {
    console.log(format.error(`Error: "${skillName}" is not a link — refusing to remove a real directory`));
    return;
  }

  // Remove the link
  unlinkSkill(targetPath);

  console.log(
    format.success(`Unlinked `) +
    format.bold(skillName) +
    format.success(` from ${agentSkillDir}`)
  );
}

module.exports = { unlink };
