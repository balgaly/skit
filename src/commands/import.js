'use strict';

const fs = require('node:fs');
const path = require('node:path');
const format = require('../ui/format');
const { spinner } = require('../ui/spinner');

const { detectUrlType, downloadFile, wrapAsSkill } = require('../core/importer');
const { linkSkill } = require('../core/linker');
const { addSkill } = require('../core/manifest');
const { install } = require('./install');
const { resolveSkitHome, ensureDirs, getAgentAdapter } = require('../index');

/**
 * Derive a skill name from a filename (strip extension).
 * e.g. "my-helper.md" -> "my-helper"
 */
function deriveSkillName(filename) {
  const ext = path.extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

/**
 * Import a skill from a URL or local file path.
 *
 * - github-repo: delegate to install command
 * - github-gist: download gist files, create standalone skill
 * - github-subfolder: clone repo, extract subfolder as standalone
 * - raw-file / raw-github: download file, wrap as skill
 * - local-path: copy file, wrap as skill
 *
 * @param {string} url - URL or local file path
 * @param {object} [options]
 * @param {string} [options.skitHome] - override skit home (for testing)
 * @param {string} [options.agentSkillDir] - override agent skill dir (for testing)
 * @param {boolean} [options.all] - pass through to install for repos
 */
async function importSkill(url, options = {}) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    console.log(format.error('Error: URL or path is required'));
    return;
  }

  const trimmedUrl = url.trim();
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  fs.mkdirSync(agentSkillDir, { recursive: true });

  // Security warning for external imports
  console.log(format.warn(`\n  Warning: Importing skill from external source`));
  console.log(format.dim(`  Review the skill content before using it with sensitive code.\n`));

  let detected;
  try {
    detected = detectUrlType(trimmedUrl);
  } catch (err) {
    console.log(format.error(`Error: ${err.message}`));
    return;
  }

  const { type, parsed } = detected;

  switch (type) {
    case 'github-repo':
      // Delegate to install command
      console.log(format.info(`Detected: GitHub repo (${parsed.user}/${parsed.repo})`));
      await install(trimmedUrl, options);
      return;

    case 'github-gist':
      await importGist(trimmedUrl, parsed, skitHome, agentSkillDir);
      return;

    case 'github-subfolder':
      await importSubfolder(trimmedUrl, parsed, skitHome, agentSkillDir);
      return;

    case 'raw-github':
      await importRawFile(
        `https://raw.githubusercontent.com/${parsed.user}/${parsed.repo}/${parsed.branch}/${parsed.path}`,
        trimmedUrl,
        skitHome,
        agentSkillDir
      );
      return;

    case 'raw-file':
      await importRawFile(parsed.url, trimmedUrl, skitHome, agentSkillDir);
      return;

    case 'local-path':
      await importLocalFile(parsed.path, skitHome, agentSkillDir);
      return;

    default:
      console.log(format.error(`Error: unsupported URL type: ${type}`));
  }
}

/**
 * Import a local file as a standalone skill.
 */
async function importLocalFile(filePath, skitHome, agentSkillDir) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(format.error(`Error: file does not exist: ${resolvedPath}`));
    return;
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    console.log(format.error(`Error: not a file: ${resolvedPath}`));
    return;
  }

  const filename = path.basename(resolvedPath);
  const skillName = deriveSkillName(filename);
  const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone', skillName);

  if (fs.existsSync(standaloneDir)) {
    console.log(format.error(`Error: skill "${skillName}" already exists at ${standaloneDir}`));
    return;
  }

  fs.mkdirSync(standaloneDir, { recursive: true });

  // Copy the file into the standalone directory
  fs.copyFileSync(resolvedPath, path.join(standaloneDir, filename));

  // Wrap as skill (creates SKILL.md)
  wrapAsSkill(standaloneDir, skillName, resolvedPath);

  // Link to agent skill dir
  const targetPath = path.join(agentSkillDir, skillName);
  try {
    linkSkill(standaloneDir, targetPath);
  } catch (err) {
    console.log(format.error(`Error linking skill: ${err.message}`));
    return;
  }

  // Update manifest
  addSkill(skitHome, skillName, {
    source: '_standalone',
    path: skillName,
    linkedTo: targetPath,
    importedFrom: resolvedPath,
    installedAt: new Date().toISOString(),
  });

  console.log(format.success(`Installed ${skillName} from local file`));
  console.log(format.dim(`  ${skillName} -> ${targetPath}`));
}

/**
 * Import a raw file from a URL as a standalone skill.
 */
async function importRawFile(downloadUrl, originalUrl, skitHome, agentSkillDir) {
  const urlPath = downloadUrl.split('?')[0];
  const filename = path.posix.basename(urlPath);
  const skillName = deriveSkillName(filename);
  const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone', skillName);

  if (fs.existsSync(standaloneDir)) {
    console.log(format.error(`Error: skill "${skillName}" already exists at ${standaloneDir}`));
    return;
  }

  fs.mkdirSync(standaloneDir, { recursive: true });

  const s = spinner(`Downloading ${filename}...`).start();

  try {
    await downloadFile(downloadUrl, path.join(standaloneDir, filename));
    s.succeed(`Downloaded ${filename}`);
  } catch (err) {
    s.fail(`Failed to download ${filename}`);
    console.log(format.error(`Error: ${err.message}`));
    // Clean up
    fs.rmSync(standaloneDir, { recursive: true, force: true });
    return;
  }

  // Wrap as skill
  wrapAsSkill(standaloneDir, skillName, originalUrl);

  // Link
  const targetPath = path.join(agentSkillDir, skillName);
  try {
    linkSkill(standaloneDir, targetPath);
  } catch (err) {
    console.log(format.error(`Error linking skill: ${err.message}`));
    return;
  }

  // Manifest
  addSkill(skitHome, skillName, {
    source: '_standalone',
    path: skillName,
    linkedTo: targetPath,
    importedFrom: originalUrl,
    installedAt: new Date().toISOString(),
  });

  console.log(format.success(`Installed ${skillName} from ${originalUrl}`));
  console.log(format.dim(`  ${skillName} -> ${targetPath}`));
}

/**
 * Import a GitHub gist as a standalone skill.
 */
async function importGist(url, parsed, skitHome, agentSkillDir) {
  const { id } = parsed;

  const s = spinner('Fetching Gist metadata...').start();

  // Fetch gist API
  const https = require('node:https');
  let gistData;
  try {
    gistData = await new Promise((resolve, reject) => {
      const apiUrl = `https://api.github.com/gists/${id}`;
      https.get(apiUrl, { headers: { 'User-Agent': 'skit-cli', Accept: 'application/vnd.github.v3+json' } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned status ${res.statusCode}`));
          return;
        }
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Failed to parse Gist response'));
          }
        });
      }).on('error', (err) => reject(new Error(`Failed to fetch Gist: ${err.message}`)));
    });
    s.succeed('Fetched Gist metadata');
  } catch (err) {
    s.fail('Failed to fetch Gist');
    console.log(format.error(`Error: ${err.message}`));
    return;
  }

  // Derive skill name from gist description or first filename
  const files = Object.keys(gistData.files || {});
  if (files.length === 0) {
    console.log(format.error('Error: Gist has no files'));
    return;
  }

  const skillName = gistData.description
    ? gistData.description.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || deriveSkillName(files[0])
    : deriveSkillName(files[0]);

  console.log(format.info(`Detected: GitHub Gist (${files.length} file${files.length === 1 ? '' : 's'})`));
  console.log(format.info(`Skill name: ${skillName}`));

  const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone', skillName);

  if (fs.existsSync(standaloneDir)) {
    console.log(format.error(`Error: skill "${skillName}" already exists at ${standaloneDir}`));
    return;
  }

  fs.mkdirSync(standaloneDir, { recursive: true });

  // Download each gist file
  for (const fileName of files) {
    const fileData = gistData.files[fileName];
    const fileDest = path.join(standaloneDir, path.basename(fileName));
    if (fileData.content) {
      // Content is inline in API response
      fs.writeFileSync(fileDest, fileData.content, 'utf-8');
    } else if (fileData.raw_url) {
      try {
        await downloadFile(fileData.raw_url, fileDest);
      } catch (err) {
        console.log(format.warn(`Warning: failed to download ${fileName}: ${err.message}`));
      }
    }
  }

  // Wrap as skill
  wrapAsSkill(standaloneDir, skillName, url);

  // Link
  const targetPath = path.join(agentSkillDir, skillName);
  try {
    linkSkill(standaloneDir, targetPath);
  } catch (err) {
    console.log(format.error(`Error linking skill: ${err.message}`));
    return;
  }

  // Manifest
  addSkill(skitHome, skillName, {
    source: '_standalone',
    path: skillName,
    linkedTo: targetPath,
    importedFrom: url,
    installedAt: new Date().toISOString(),
  });

  console.log(format.success(`Installed ${skillName} from gist`));
  console.log(format.dim(`  ${skillName} -> ${targetPath}`));
}

/**
 * Import a GitHub subfolder as a standalone skill.
 * Clones the full repo, then copies just the subfolder.
 */
async function importSubfolder(url, parsed, skitHome, agentSkillDir) {
  const { user, repo, branch, path: subPath } = parsed;
  const skillName = path.posix.basename(subPath);
  const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone', skillName);

  if (fs.existsSync(standaloneDir)) {
    console.log(format.error(`Error: skill "${skillName}" already exists at ${standaloneDir}`));
    return;
  }

  const s = spinner(`Cloning ${user}/${repo} (sparse)...`).start();

  // Clone the repo to a temp dir, then extract the subfolder
  const { cloneRepo } = require('../core/git');
  const tmpCloneDir = path.join(skitHome, 'sources', 'external', '_standalone', `.tmp-${repo}-${Date.now()}`);

  try {
    cloneRepo(`https://github.com/${user}/${repo}.git`, tmpCloneDir);
    s.succeed(`Cloned ${user}/${repo}`);
  } catch (err) {
    s.fail(`Failed to clone ${user}/${repo}`);
    console.log(format.error(`Error: ${err.message}`));
    fs.rmSync(tmpCloneDir, { recursive: true, force: true });
    return;
  }

  // Copy the subfolder out
  const subfolderSrc = path.join(tmpCloneDir, ...subPath.split('/'));
  if (!fs.existsSync(subfolderSrc)) {
    console.log(format.error(`Error: subfolder "${subPath}" not found in repository`));
    fs.rmSync(tmpCloneDir, { recursive: true, force: true });
    return;
  }

  // Copy recursively
  fs.cpSync(subfolderSrc, standaloneDir, { recursive: true });

  // Remove the temp clone
  fs.rmSync(tmpCloneDir, { recursive: true, force: true });

  // Wrap as skill
  wrapAsSkill(standaloneDir, skillName, url);

  // Link
  const targetPath = path.join(agentSkillDir, skillName);
  try {
    linkSkill(standaloneDir, targetPath);
  } catch (err) {
    console.log(format.error(`Error linking skill: ${err.message}`));
    return;
  }

  // Manifest
  addSkill(skitHome, skillName, {
    source: '_standalone',
    path: skillName,
    linkedTo: targetPath,
    importedFrom: url,
    installedAt: new Date().toISOString(),
  });

  console.log(format.success(`Installed ${skillName} from ${user}/${repo}/${subPath}`));
  console.log(format.dim(`  ${skillName} -> ${targetPath}`));
}

module.exports = { importSkill, deriveSkillName };
