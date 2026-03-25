'use strict';

const { listSkills, listSources } = require('../core/manifest');
const { readConfig } = require('../core/config');
const { resolveSkitHome, ensureDirs } = require('../index');

/**
 * Export the current skit profile as JSON to stdout.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 */
function profileExport(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const config = readConfig(skitHome);
  const sources = listSources(skitHome);
  const skills = listSkills(skitHome);

  const profile = {
    skit: '1.0',
    user: config.user || null,
    exported: new Date().toISOString(),
    sources: Object.entries(sources).map(([name, data]) => {
      const entry = { name, type: data.type || 'external' };
      if (data.origin) {
        entry.origin = data.origin;
      }
      return entry;
    }),
    skills: Object.entries(skills).map(([name, data]) => {
      const entry = { name, source: data.source };
      if (data.importedFrom) {
        entry.importedFrom = data.importedFrom;
      }
      return entry;
    }),
  };

  process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
}

module.exports = { profileExport };
