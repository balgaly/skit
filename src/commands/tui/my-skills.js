'use strict';

const format = require('../../ui/format');
const { pickAction } = require('../../ui/picker');
const { listSkills } = require('../../core/manifest');
const { remove } = require('../remove');
const { resolveSkitHome } = require('../../index');

/**
 * Show installed skills and allow removal.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome]
 */
async function mySkills(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  const skills = listSkills(skitHome);
  const entries = Object.entries(skills);

  if (entries.length === 0) {
    console.log('');
    console.log(format.warn('No skills installed.'));
    console.log(format.dim('Use "Browse registry" to find and install skills.'));
    return;
  }

  // Group by source for display
  const grouped = {};
  for (const [name, data] of entries) {
    const src = data.source || 'unknown';
    if (!grouped[src]) grouped[src] = [];
    grouped[src].push(name);
  }

  console.log('');
  for (const [source, names] of Object.entries(grouped)) {
    console.log(format.header(source));
    for (const name of names) {
      console.log(`  ${name}`);
    }
    console.log('');
  }

  // Build choice list: each skill + back
  const choices = entries.map(([name, data]) => ({
    name: `${name}  ${format.dim('(' + (data.source || 'unknown') + ')')}`,
    value: name,
  }));
  choices.push({ name: format.dim('← Back'), value: '__back__' });

  let selected;
  try {
    selected = await pickAction('Select a skill to manage:', choices);
  } catch {
    return;
  }

  if (selected === '__back__') return;

  let action;
  try {
    action = await pickAction(`Manage "${selected}":`, [
      { name: 'Remove', value: 'remove' },
      { name: 'Back', value: 'back' },
    ]);
  } catch {
    return;
  }

  if (action === 'remove') {
    await remove(selected, { skitHome, yes: false });
  }
}

module.exports = { mySkills };
