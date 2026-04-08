'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const format = require('../ui/format');
const { spinner } = require('../ui/spinner');

const { listSkills, listSources, addSource, addSkill, getSkill } = require('../core/manifest');
const { cloneRepo } = require('../core/git');
const { linkSkill } = require('../core/linker');
const { scanForSkills } = require('../core/scanner');
const { resolveSkitHome, ensureDirs, getAgentAdapter } = require('../index');
const { downloadFile } = require('../core/importer');

/**
 * Detect if a string looks like a URL.
 */
function isUrl(str) {
  return /^https?:\/\//.test(str) || /^file:\/\//.test(str);
}

/**
 * Fetch a profile from a GitHub username using gh CLI.
 * Returns the raw URL of the skit-profile.json file in the user's gist.
 *
 * @param {string} username - GitHub username
 * @param {function} [execFileSyncFn] - Override for execFileSync (for testing)
 * @returns {string|null} Raw URL of the profile, or null if not found
 */
function fetchProfileUrlFromUsername(username, execFileSyncFn = execFileSync) {
  try {
    // Use gh CLI to list user's gists
    const result = execFileSyncFn(
      'gh',
      ['api', `/users/${username}/gists`, '--paginate'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const gists = JSON.parse(result);

    // Find a gist that contains skit-profile.json
    for (const gist of gists) {
      if (gist.files && gist.files['skit-profile.json']) {
        return gist.files['skit-profile.json'].raw_url;
      }
    }

    return null;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('GitHub CLI (gh) not found. Install it from: https://cli.github.com');
    }
    throw new Error(`Failed to fetch gists for user "${username}": ${err.message}`);
  }
}

/**
 * Clone a user's skit profile and install all their sources and skills.
 *
 * @param {string} userOrUrl - GitHub username or direct URL to profile JSON
 * @param {object} [options]
 * @param {string} [options.skitHome] - Override skit home (for testing)
 * @param {string} [options.agentSkillDir] - Override agent skill dir (for testing)
 * @param {function} [options._mockExecFileSync] - Override execFileSync (for testing)
 * @param {function} [options._mockDownloadFile] - Override downloadFile (for testing)
 */
async function clone(userOrUrl, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  fs.mkdirSync(agentSkillDir, { recursive: true });

  const execFileSyncFn = options._mockExecFileSync || execFileSync;
  const downloadFileFn = options._mockDownloadFile || downloadFile;

  // Step 1: Resolve the profile URL
  let profileUrl;

  if (isUrl(userOrUrl)) {
    // Direct URL provided
    profileUrl = userOrUrl;
  } else {
    // Treat as GitHub username
    console.log(format.info(`\n  Fetching ${userOrUrl}'s profile...`));

    try {
      profileUrl = fetchProfileUrlFromUsername(userOrUrl, execFileSyncFn);
    } catch (err) {
      console.log(format.error(`\n  Error: ${err.message}`));
      return;
    }

    if (!profileUrl) {
      console.log(format.error(`\n  Error: No skit profile found for user "${userOrUrl}"`));
      console.log(format.dim(`  They may not have published a profile yet.`));
      console.log(format.dim(`  Ask them to run: ${format.info('skit profile push')}`));
      return;
    }
  }

  // Step 2: Download the profile JSON
  const tempFile = path.join(os.tmpdir(), `skit-clone-${crypto.randomUUID()}.json`);
  let profile;

  try {
    await downloadFileFn(profileUrl, tempFile);
    const raw = fs.readFileSync(tempFile, 'utf-8');
    profile = JSON.parse(raw);
  } catch (err) {
    console.log(format.error(`\n  Error: Failed to fetch profile from ${profileUrl}`));
    console.log(format.error(`  ${err.message}`));
    return;
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }

  const profileSources = profile.sources || [];
  const profileSkills = profile.skills || [];

  // Build a map of source name -> origin from the profile
  const sourceOrigins = {};
  for (const src of profileSources) {
    if (src.origin) {
      sourceOrigins[src.name] = src.origin;
    }
  }

  // Show summary
  console.log(format.bold(`\nFound ${profileSkills.length} skills from ${profileSources.length} sources:`));
  console.log('');

  // Group skills by source for display
  const skillsBySource = {};
  for (const skill of profileSkills) {
    if (!skillsBySource[skill.source]) {
      skillsBySource[skill.source] = [];
    }
    skillsBySource[skill.source].push(skill.name);
  }

  for (const src of profileSources) {
    const skillNames = skillsBySource[src.name] || [];
    if (skillNames.length > 0) {
      console.log(format.bold(`  ${src.name}`) + format.dim(` (${skillNames.length} skills)`));
      console.log(format.dim(`    ${skillNames.join(', ')}`));
      console.log('');
    }
  }

  // Get current manifest state
  const existingSources = listSources(skitHome);

  // Phase 1: Clone missing sources
  let sourcesCloned = 0;
  let sourcesSkipped = 0;

  for (const src of profileSources) {
    const { name, type, origin } = src;

    // Skip sources with no origin (e.g., _standalone)
    if (!origin) {
      console.log(format.warn(`  Skipping source "${name}" — no origin URL`));
      sourcesSkipped++;
      continue;
    }

    // Check if already present by matching origin URL
    const existing = existingSources[name];
    if (existing && existing.origin === origin) {
      console.log(format.dim(`  Skipping source "${name}" — already cloned`));
      sourcesSkipped++;
      continue;
    }

    // Clone it
    const sourceType = type || 'external';
    const targetDir = path.join(skitHome, 'sources', sourceType, name);

    if (fs.existsSync(targetDir)) {
      console.log(format.dim(`  Skipping source "${name}" — directory already exists`));
      sourcesSkipped++;
      continue;
    }

    const s = spinner(`Cloning ${name}...`).start();

    try {
      cloneRepo(origin, targetDir);
      s.succeed(`Cloned ${name}`);

      addSource(skitHome, name, {
        type: sourceType,
        path: targetDir,
        origin,
        installedAt: new Date().toISOString(),
      });
      sourcesCloned++;
    } catch (err) {
      s.fail(`Failed to clone ${name}`);
      console.log(format.error(`  Error cloning "${name}": ${err.message}`));
    }
  }

  // Phase 2: Link missing skills
  let skillsLinked = 0;
  let skillsSkipped = 0;

  // Refresh sources after cloning
  const updatedSources = listSources(skitHome);

  for (const skill of profileSkills) {
    const { name, source: sourceName, importedFrom } = skill;

    // Skip standalone/importedFrom skills with no cloneable origin
    if (importedFrom || sourceName === '_standalone') {
      const origin = sourceOrigins[sourceName];
      if (!origin) {
        console.log(format.warn(`  Skipping skill "${name}" — standalone/importedFrom (no source origin)`));
        skillsSkipped++;
        continue;
      }
    }

    // Check if skill already installed
    const existingSkill = getSkill(skitHome, name);
    if (existingSkill) {
      console.log(format.dim(`  Skipping skill "${name}" — already installed`));
      skillsSkipped++;
      continue;
    }

    // Find the source directory
    const sourceData = updatedSources[sourceName];
    if (!sourceData || !sourceData.path) {
      console.log(format.warn(`  Skipping skill "${name}" — source "${sourceName}" not available`));
      skillsSkipped++;
      continue;
    }

    const sourceDir = sourceData.path;

    // Scan for the skill in the source
    const availableSkills = scanForSkills(sourceDir);
    const skillInfo = availableSkills.find((s) => s.name === name);

    if (!skillInfo) {
      console.log(format.warn(`  Skipping skill "${name}" — not found in source "${sourceName}"`));
      skillsSkipped++;
      continue;
    }

    const skillSourcePath = path.join(sourceDir, skillInfo.path);
    const targetPath = path.join(agentSkillDir, name);

    if (fs.existsSync(targetPath)) {
      console.log(format.dim(`  Skipping skill "${name}" — already exists at target`));
      skillsSkipped++;
      continue;
    }

    try {
      linkSkill(skillSourcePath, targetPath);
      addSkill(skitHome, name, {
        source: sourceName,
        path: skillInfo.path,
        linkedTo: targetPath,
        installedAt: new Date().toISOString(),
      });
      skillsLinked++;
    } catch (err) {
      console.log(format.error(`  Failed to link skill "${name}": ${err.message}`));
    }
  }

  // Summary
  console.log('');
  console.log(format.success(`Clone complete:`));
  console.log(format.dim(`  Sources: ${sourcesCloned} cloned, ${sourcesSkipped} skipped`));
  console.log(format.dim(`  Skills:  ${skillsLinked} linked, ${skillsSkipped} skipped`));
  console.log('');
}

module.exports = { clone };
