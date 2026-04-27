'use strict';

const fs = require('node:fs');
const path = require('node:path');
const format = require('../ui/format');
const { spinner } = require('../ui/spinner');
const { pickSkills } = require('../ui/picker');

const { cloneRepo, getRemoteUrl } = require('../core/git');
const { scanForSkills } = require('../core/scanner');
const { linkSkill } = require('../core/linker');
const { addSource, addSkill, listSkills, getSource } = require('../core/manifest');
const { resolveSkitHome, ensureDirs, getAgentAdapter } = require('../index');

/**
 * Determine if a source string looks like a git URL (or bare repo path ending in .git).
 * Matches: https://, http://, git@, github.com, or paths ending in .git
 */
function isGitUrl(source) {
  if (/^https?:\/\//.test(source)) return true;
  if (/^git@/.test(source)) return true;
  if (/github\.com/.test(source)) return true;
  // Bare repo paths end in .git
  if (source.endsWith('.git')) return true;
  return false;
}

/**
 * Extract a human-readable source name from a git URL or path.
 * Uses "owner--repo" for GitHub URLs to avoid generic names like "skills".
 * e.g. "https://github.com/someone/their-skills.git" => "someone--their-skills"
 * e.g. "git@github.com:someone/repo.git" => "someone--repo"
 * e.g. "/tmp/foo/remote-skills.git" => "remote-skills"
 */
function extractRepoName(source) {
  // Try to extract owner/repo from GitHub URLs
  const ghMatch = source.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (ghMatch) {
    return `${ghMatch[1]}--${ghMatch[2]}`;
  }

  // Fallback: basename without .git
  let cleaned = source.replace(/\/+$/, '');
  let base = path.basename(cleaned);
  base = base.replace(/\.git$/, '');
  return base;
}

/**
 * Install skills from a source (local path or git URL).
 *
 * @param {string} source — local path or git URL
 * @param {object} [options]
 * @param {boolean} [options.own] — mark source as own (sources/own/ instead of sources/external/)
 * @param {boolean} [options.all] — skip picker, install all skills
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 */
async function install(source, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  fs.mkdirSync(agentSkillDir, { recursive: true });

  const sourceType = options.own ? 'own' : 'external';
  let sourceDir;
  let sourceName;

  let sourceAlreadyPresent = false;

  if (isGitUrl(source)) {
    // Git URL: clone to sources/<type>/<repo-name>/
    sourceName = extractRepoName(source);
    const targetDir = path.join(skitHome, 'sources', sourceType, sourceName);

    if (fs.existsSync(targetDir)) {
      // Source already cloned — re-enter to add more skills instead of erroring.
      // Refuse if the existing path is a symlink (defence against attacker-planted
      // junctions pointing into sensitive trees).
      const lst = fs.lstatSync(targetDir);
      if (lst.isSymbolicLink()) {
        console.log(format.error(`\n  Error: "${targetDir}" is a symbolic link, refusing to reuse for security reasons.`));
        console.log(format.dim(`  Remove it manually if it is expected, then retry.`));
        return;
      }

      // Verify the existing clone's remote matches the URL being installed.
      // This blocks a silent source-swap when two URLs share the same owner--repo slot.
      const existingRemote = getRemoteUrl(targetDir);
      if (existingRemote && existingRemote !== source) {
        console.log(format.error(`\n  Error: source "${sourceName}" already exists at ${targetDir} but points to a different remote:`));
        console.log(format.dim(`    existing remote: ${existingRemote}`));
        console.log(format.dim(`    requested URL:   ${source}`));
        console.log(format.dim(`  Remove the existing source with \`skit remove --source ${sourceName}\` and retry.`));
        return;
      }

      sourceAlreadyPresent = true;
      console.log(format.dim(`  Source "${sourceName}" already installed — scanning for additional skills.`));
      sourceDir = targetDir;
    } else {
      // Security warning for external sources
      if (sourceType === 'external') {
        console.log(format.warn(`\n  Warning: Installing skills from external source "${sourceName}"`));
        console.log(format.dim(`  Review the skills before using them with sensitive code.\n`));
      }

      const s = spinner(`Cloning ${sourceName}...`).start();

      try {
        cloneRepo(source, targetDir);
        s.succeed(`Cloned ${sourceName}`);
      } catch (err) {
        s.fail(`Failed to clone ${sourceName}`);
        console.log(format.error(`Error: ${err.message}`));
        return;
      }

      sourceDir = targetDir;
    }
  } else {
    // Local path
    const localDir = path.resolve(source);
    sourceName = path.basename(localDir);

    if (!fs.existsSync(localDir)) {
      console.log(format.error(`Error: path does not exist: ${localDir}`));
      return;
    }

    if (!fs.statSync(localDir).isDirectory()) {
      console.log(format.error(`Error: not a directory: ${localDir}`));
      return;
    }

    // Link local path into sources/<type>/<name> for a self-contained library
    const targetDir = path.join(skitHome, 'sources', sourceType, sourceName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(path.resolve(localDir), targetDir, linkType);
    }

    sourceDir = localDir;
  }

  // Scan for skills
  let skills = scanForSkills(sourceDir);

  if (skills.length === 0) {
    console.log(format.error(`No skills found in ${sourceDir}`));
    return;
  }

  // If the source is already installed, filter out skills we've already linked
  // so the picker shows only what's new/unadded.
  if (sourceAlreadyPresent) {
    const installedNames = new Set(
      Object.entries(listSkills(skitHome))
        .filter(([, s]) => s.source === sourceName)
        .map(([name]) => name)
    );
    const remaining = skills.filter((s) => !installedNames.has(s.name));
    if (remaining.length === 0) {
      console.log(format.success(`All skills from "${sourceName}" are already installed. Nothing to add.`));
      console.log(format.dim(`  Run \`skit update ${sourceName}\` to refresh, or \`skit list --source ${sourceName}\` to see them.`));
      return;
    }
    console.log(format.dim(`  ${installedNames.size} already installed, ${remaining.length} available to add.`));
    skills = remaining;
  }

  // Determine which skills to install
  let selectedSkills;

  if (options.all || skills.length === 1) {
    // Auto-install: single skill or --all flag
    selectedSkills = skills;
  } else {
    // Interactive picker
    try {
      selectedSkills = await pickSkills(skills, options);

      if (selectedSkills.length === 0) {
        console.log(format.warn('No skills selected — nothing to install.'));
        return;
      }
    } catch (err) {
      // If inquirer is not available or fails, fall back to all
      console.log(format.warn('Interactive picker unavailable, installing all skills.'));
      selectedSkills = skills;
    }
  }

  // Record the source in manifest — merge on re-entry so we preserve the
  // original installedAt and don't null out origin if someone re-targets via
  // a local path that happens to match a previously-git-installed slot.
  const existingSource = sourceAlreadyPresent ? getSource(skitHome, sourceName) : null;
  const newOrigin = isGitUrl(source) ? source : null;
  const sourceData = {
    type: (existingSource && existingSource.type) || sourceType,
    path: sourceDir,
    origin: newOrigin || (existingSource && existingSource.origin) || null,
    installedAt: (existingSource && existingSource.installedAt) || new Date().toISOString(),
  };
  addSource(skitHome, sourceName, sourceData);

  // Install each selected skill
  const installed = [];
  for (const skill of selectedSkills) {
    const skillSourcePath = path.join(sourceDir, skill.path);
    const targetPath = path.join(agentSkillDir, skill.name);

    if (fs.existsSync(targetPath)) {
      console.log(format.warn(`  Skipping "${skill.name}" — already exists at ${targetPath}`));
      continue;
    }

    try {
      linkSkill(skillSourcePath, targetPath);
      addSkill(skitHome, skill.name, {
        source: sourceName,
        path: skill.path,
        description: skill.description || null,
        linkedTo: targetPath,
        installedAt: new Date().toISOString(),
      });
      installed.push(skill);
    } catch (err) {
      console.log(format.error(`  Failed to install "${skill.name}": ${err.message}`));
    }
  }

  // Summary
  if (installed.length === 0) {
    console.log(format.warn('No new skills were installed.'));
  } else {
    console.log('');
    console.log(format.success(`Installed ${installed.length} skill${installed.length === 1 ? '' : 's'} from ${sourceName}`));
    for (const skill of installed) {
      const targetPath = path.join(agentSkillDir, skill.name);
      console.log(format.dim(`  ${skill.name}`) + format.dim(` -> ${targetPath}`));
    }
  }
}

module.exports = { install, isGitUrl, extractRepoName };
