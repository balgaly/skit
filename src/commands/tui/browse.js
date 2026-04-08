'use strict';

const { search } = require('@inquirer/search');
const format = require('../../ui/format');
const { pickAction } = require('../../ui/picker');
const { fetchRegistry, validateRegistryUrl } = require('../../core/registry');
const { install } = require('../install');

const GITHUB_ISSUE_URL = 'https://github.com/balgaly/skit-registry/issues/new';

/**
 * Browse the community registry with live fuzzy search.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {Function} [options._fetch] — override fetch for registry (for testing)
 * @param {Function} [options._open] — override open for browser (for testing)
 * @param {Function} [options._install] — override install command (for testing)
 */
async function browseRegistry(options = {}) {
  const openFn = options._open || require('open');

  console.log('');
  console.log(format.dim('Loading registry...'));

  let registry;
  try {
    registry = await fetchRegistry({ skitHome: options.skitHome, _fetch: options._fetch });
  } catch {
    console.log(format.warn('Could not load registry. Check your network connection.'));
    return;
  }

  if (registry.entries.length === 0) {
    console.log(format.warn('Registry is empty or unavailable.'));
    return;
  }

  // Build search choices
  const searchChoices = registry.entries.map((entry) => ({
    name: `${entry.name}  ${format.dim('— ' + entry.description)}`,
    value: entry,
    description: entry.tags.join(', '),
  }));

  // Add submit option as a separator-style entry
  const SUBMIT = '__submit__';
  searchChoices.push({
    name: format.dim('Submit a repo...'),
    value: SUBMIT,
  });

  let selected;
  try {
    selected = await search({
      message: 'Search skills:',
      source: (input) => {
        if (!input) return searchChoices;
        const q = input.toLowerCase();
        return searchChoices.filter((c) =>
          c.value === SUBMIT ||
          c.value.name.toLowerCase().includes(q) ||
          c.value.description.toLowerCase().includes(q) ||
          (Array.isArray(c.value.tags) && c.value.tags.some((t) => t.toLowerCase().includes(q)))
        );
      },
    });
  } catch {
    // User pressed Ctrl+C
    return;
  }

  if (selected === SUBMIT) {
    await submitRepo({ skitHome: options.skitHome, _open: openFn });
    return;
  }

  await showSkillDetail(selected, { skitHome: options.skitHome, _open: openFn, _install: options._install });
}

/**
 * Show skill detail and install/open options.
 * @param {object} entry — registry entry
 * @param {object} options
 */
async function showSkillDetail(entry, options = {}) {
  const openFn = options._open || require('open');
  const installFn = options._install || install;

  console.log('');
  console.log(format.bold(entry.name));
  console.log(format.dim(`by ${entry.author} · ${(entry.agents || []).join(', ')}`));
  console.log('');
  console.log(entry.description);
  if (entry.tags.length > 0) {
    console.log('');
    console.log(format.dim(`tags: ${entry.tags.join(' · ')}`));
  }
  console.log('');

  let action;
  try {
    action = await pickAction('What would you like to do?', [
      { name: 'Install', value: 'install' },
      { name: 'Open on GitHub', value: 'open' },
      { name: 'Back', value: 'back' },
    ]);
  } catch {
    return;
  }

  if (action === 'install') {
    await installFn(entry.url, { skitHome: options.skitHome });
    // Return to browse after install
    await browseRegistry(options);
  } else if (action === 'open') {
    await openFn(entry.url);
  }
  // 'back' falls through — returns to caller (browseRegistry)
}

/**
 * Prompt for a GitHub URL and open a pre-filled GitHub issue for submission.
 * @param {object} options
 */
async function submitRepo(options = {}) {
  const openFn = options._open || require('open');
  const inquirer = require('inquirer');

  let url = '';
  while (true) {
    const answers = await inquirer.prompt([{
      type: 'input',
      name: 'url',
      message: 'Paste a GitHub URL:',
      default: url || 'https://github.com/',
    }]);
    url = answers.url.trim();

    if (!validateRegistryUrl(url)) {
      console.log(format.error('URL must start with https://github.com/ — please try again.'));
      continue;
    }
    break;
  }

  // Check for SKILL.md (best-effort — warn and continue on network failure)
  console.log(format.dim('Checking for SKILL.md...'));
  const repoPath = url.replace('https://github.com/', '');
  const skillMdUrl = `https://raw.githubusercontent.com/${repoPath}/HEAD/SKILL.md`;

  let hasSkillMd = false;
  try {
    const res = await globalThis.fetch(skillMdUrl);
    hasSkillMd = res.ok;
  } catch {
    console.log(format.warn('Could not check for SKILL.md (network error) — proceeding anyway.'));
    hasSkillMd = true;
  }

  if (!hasSkillMd) {
    console.log(format.warn('No SKILL.md found at the root of this repo. Proceeding anyway.'));
  }

  const repoName = url.split('/').pop();
  const issueTitle = encodeURIComponent(`Add repo: ${repoName}`);
  const issueBody = encodeURIComponent(`**Repository URL:** ${url}\n\n**Description:** (add a short description)\n\n**Tags:** (comma-separated)\n\n**Agents supported:** claude-code, cursor, windsurf`);
  const issueUrl = `${GITHUB_ISSUE_URL}?title=${issueTitle}&body=${issueBody}`;

  console.log(format.success('Opening submission in your browser...'));
  await openFn(issueUrl);
}

module.exports = { browseRegistry, showSkillDetail, submitRepo };
