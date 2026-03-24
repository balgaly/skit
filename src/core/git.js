'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check if a directory is a git repository (has a .git directory).
 * @param {string} dirPath - Path to check
 * @returns {boolean}
 */
function isGitRepo(dirPath) {
  try {
    const gitDir = path.join(dirPath, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Get the current HEAD SHA of a git repository.
 * @param {string} repoDir - Path to the git repo
 * @returns {string} The 40-character SHA hex string
 * @throws {Error} If not a git repo or git command fails
 */
function getCurrentSha(repoDir) {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return sha;
  } catch (err) {
    throw new Error(`Failed to get current SHA in "${repoDir}": ${err.stderr || err.message}`);
  }
}

/**
 * Get the remote "origin" URL of a git repository.
 * @param {string} repoDir - Path to the git repo
 * @returns {string|null} The remote URL, or null if no remote/not a repo
 */
function getRemoteUrl(repoDir) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return url || null;
  } catch {
    return null;
  }
}

/**
 * Clone a git repository.
 * @param {string} url - The repository URL (or local path) to clone from
 * @param {string} targetDir - The directory to clone into
 * @returns {{ success: true, sha: string }}
 * @throws {Error} If clone fails
 */
function cloneRepo(url, targetDir) {
  try {
    execFileSync('git', ['clone', url, targetDir], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`Failed to clone "${url}" into "${targetDir}": ${err.stderr || err.message}`);
  }

  const sha = getCurrentSha(targetDir);
  return { success: true, sha };
}

/**
 * Pull the latest changes in a git repository.
 * @param {string} repoDir - Path to the git repo
 * @returns {{ success: true, updated: boolean, sha: string }}
 * @throws {Error} If pull fails
 */
function pullRepo(repoDir) {
  const shaBefore = getCurrentSha(repoDir);

  try {
    execFileSync('git', ['pull'], {
      cwd: repoDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`Failed to pull in "${repoDir}": ${err.stderr || err.message}`);
  }

  const shaAfter = getCurrentSha(repoDir);
  return {
    success: true,
    updated: shaBefore !== shaAfter,
    sha: shaAfter,
  };
}

module.exports = {
  cloneRepo,
  pullRepo,
  getCurrentSha,
  isGitRepo,
  getRemoteUrl,
};
