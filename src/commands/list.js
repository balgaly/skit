'use strict';

const format = require('../ui/format');
const { listSkills } = require('../core/manifest');
const { resolveSkitHome, ensureDirs } = require('../index');

/**
 * List installed skills, grouped by source.
 *
 * @param {object} [options]
 * @param {string} [options.source] — filter to only show skills from this source
 * @param {string} [options.skitHome] — override skit home (for testing)
 */
function list(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const skills = listSkills(skitHome);
  const allEntries = Object.entries(skills);

  if (allEntries.length === 0) {
    console.log(format.warn('No skills installed.'));
    console.log(format.dim('Run "skit install <source>" to install skills.'));
    return;
  }

  // Group skills by source
  const grouped = {};
  for (const [name, data] of allEntries) {
    const source = data.source || 'unknown';
    if (!grouped[source]) {
      grouped[source] = [];
    }
    grouped[source].push({ name, ...data });
  }

  // Apply source filter if specified
  const sourceFilter = options.source;
  const sourcesToShow = sourceFilter
    ? Object.keys(grouped).filter((s) => s === sourceFilter)
    : Object.keys(grouped);

  if (sourcesToShow.length === 0) {
    console.log(format.warn(`No skills found from source "${sourceFilter}".`));
    return;
  }

  for (const source of sourcesToShow) {
    const sourceSkills = grouped[source];
    console.log(format.header(source));
    for (const skill of sourceSkills) {
      const desc = skill.description || 'No description';
      console.log(`  ${skill.name}  ${format.dim(desc)}`);
    }
    console.log('');
  }
}

module.exports = { list };
