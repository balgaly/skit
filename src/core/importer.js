'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Known file extensions that indicate a downloadable raw file.
 */
const KNOWN_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.py', '.sh', '.toml'];

/**
 * Detect the type of a URL or path and parse its components.
 *
 * @param {string} url - The URL or local path to analyze
 * @returns {{ type: string, parsed: object }}
 */
function detectUrlType(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL or path is required');
  }

  const trimmed = url.trim();

  // GitHub gist: gist.github.com/<user>/<id>
  const gistMatch = trimmed.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([^/]+?)\/?$/);
  if (gistMatch) {
    return {
      type: 'github-gist',
      parsed: { user: gistMatch[1], id: gistMatch[2] },
    };
  }

  // Raw GitHub file: raw.githubusercontent.com/<user>/<repo>/<branch>/<path>
  const rawGhMatch = trimmed.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+?)$/);
  if (rawGhMatch) {
    return {
      type: 'raw-github',
      parsed: {
        user: rawGhMatch[1],
        repo: rawGhMatch[2],
        branch: rawGhMatch[3],
        path: rawGhMatch[4],
      },
    };
  }

  // GitHub subfolder: github.com/<user>/<repo>/tree/<branch>/<path>
  const subfolderMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+?)$/);
  if (subfolderMatch) {
    return {
      type: 'github-subfolder',
      parsed: {
        user: subfolderMatch[1],
        repo: subfolderMatch[2],
        branch: subfolderMatch[3],
        path: subfolderMatch[4],
      },
    };
  }

  // GitHub repo root: github.com/<user>/<repo>[.git][/]
  const repoMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (repoMatch) {
    return {
      type: 'github-repo',
      parsed: { user: repoMatch[1], repo: repoMatch[2] },
    };
  }

  // If it starts with http(s), treat as raw file
  if (/^https?:\/\//.test(trimmed)) {
    const urlPath = trimmed.split('?')[0]; // strip query params
    const filename = path.posix.basename(urlPath);
    return {
      type: 'raw-file',
      parsed: { url: trimmed, filename },
    };
  }

  // Otherwise, treat as a local path
  return {
    type: 'local-path',
    parsed: { path: trimmed },
  };
}

/**
 * Extract the repository name from a GitHub URL.
 *
 * @param {string} url - A GitHub URL
 * @returns {string|null} The repository name, or null if not a GitHub URL
 */
function extractRepoName(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/^https?:\/\/github\.com\/[^/]+\/([^/]+?)(?:\.git)?\/?(?:\/.*)?$/);
  if (!match) {
    return null;
  }

  return match[1];
}

/**
 * Extract the gist ID from a GitHub gist URL.
 *
 * @param {string} url - A gist URL
 * @returns {string|null} The gist ID, or null if not a gist URL
 */
function extractGistId(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const match = url.match(/^https?:\/\/gist\.github\.com\/[^/]+\/([^/]+?)\/?$/);
  if (!match) {
    return null;
  }

  return match[1];
}

/**
 * Download a file from a URL to a local path.
 * Only supports https: URLs for security.
 *
 * @param {string} url - The https URL to download
 * @param {string} destPath - The local file path to write to
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  if (!url || typeof url !== 'string') {
    return Promise.reject(new Error('URL is required'));
  }
  if (!destPath || typeof destPath !== 'string') {
    return Promise.reject(new Error('Destination path is required'));
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`Invalid URL: ${url}`));
  }

  if (parsed.protocol !== 'https:') {
    return Promise.reject(new Error('Only https: URLs are supported for security'));
  }

  return new Promise((resolve, reject) => {
    const destDir = path.dirname(destPath);
    fs.mkdirSync(destDir, { recursive: true });

    const file = fs.createWriteStream(destPath);

    const request = https.get(url, { headers: { 'User-Agent': 'skit-cli' } }, (response) => {
      // Follow redirects (3xx)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Download failed with status ${response.statusCode}: ${url}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(resolve);
      });
    });

    request.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(new Error(`Download failed: ${err.message}`));
    });

    file.on('error', (err) => {
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(new Error(`File write failed: ${err.message}`));
    });
  });
}

/**
 * If a directory doesn't have a SKILL.md, create a wrapper one with minimal frontmatter.
 *
 * @param {string} dirPath - Path to the skill directory
 * @param {string} skillName - Name of the skill
 * @param {string} importedFrom - The URL the skill was imported from
 */
function wrapAsSkill(dirPath, skillName, importedFrom) {
  if (!skillName || typeof skillName !== 'string') {
    throw new Error('Skill name is required');
  }

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  const skillMdPath = path.join(dirPath, 'SKILL.md');

  // Don't overwrite existing SKILL.md
  if (fs.existsSync(skillMdPath)) {
    return;
  }

  // List existing files in the directory
  const files = fs.readdirSync(dirPath).filter((f) => {
    return fs.statSync(path.join(dirPath, f)).isFile();
  });

  const filesList = files.length > 0
    ? '\n## Files\n\n' + files.map((f) => `- ${f}`).join('\n') + '\n'
    : '';

  const content = `---
name: ${skillName}
imported_from: ${importedFrom}
---

# ${skillName}

Imported skill from ${importedFrom}.
${filesList}`;

  fs.writeFileSync(skillMdPath, content, 'utf-8');
}

module.exports = {
  detectUrlType,
  extractRepoName,
  extractGistId,
  downloadFile,
  wrapAsSkill,
};
