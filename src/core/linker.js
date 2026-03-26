const fs = require('node:fs');
const path = require('node:path');

/**
 * Create a symlink (or junction on Windows) from sourcePath to targetPath.
 *
 * @param {string} sourcePath - The skill directory to link from (resolved to absolute).
 * @param {string} targetPath - The link location to create.
 * @throws If source doesn't exist, target already exists, or target parent dir missing.
 */
function linkSkill(sourcePath, targetPath) {
  const resolvedSource = path.resolve(sourcePath);

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source path does not exist: ${resolvedSource}`);
  }

  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    throw new Error(`Target parent directory does not exist: ${parentDir}`);
  }

  if (fs.existsSync(targetPath)) {
    throw new Error(`Target path already exists: ${targetPath}`);
  }

  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(resolvedSource, targetPath, type);
}

/**
 * Remove a symlink/junction. No-op if it doesn't exist.
 *
 * @param {string} targetPath - The link to remove.
 */
function unlinkSkill(targetPath) {
  if (!isLinked(targetPath)) {
    return;
  }
  // Use unlinkSync for symlinks/junctions — rmSync with recursive:false
  // throws ERR_FS_EISDIR on Windows junctions.
  fs.unlinkSync(targetPath);
}

/**
 * Check if a path is a symlink or junction.
 *
 * @param {string} targetPath - The path to check.
 * @returns {boolean}
 */
function isLinked(targetPath) {
  try {
    const stats = fs.lstatSync(targetPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the target of a symlink/junction, or null if not a link.
 *
 * @param {string} targetPath - The link path to read.
 * @returns {string|null}
 */
function getLinkTarget(targetPath) {
  try {
    if (!isLinked(targetPath)) {
      return null;
    }
    return fs.readlinkSync(targetPath);
  } catch {
    return null;
  }
}

module.exports = { linkSkill, unlinkSkill, isLinked, getLinkTarget };
