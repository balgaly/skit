const fs = require('node:fs');
const path = require('node:path');

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns object with parsed fields, or empty object if no frontmatter.
 */
function parseFrontmatter(content) {
  if (!content || !content.startsWith('---')) {
    return {};
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return {};
  }

  const frontmatterBlock = content.slice(3, endIndex).trim();
  const result = {};
  const lines = frontmatterBlock.split('\n');

  let currentKey = null;
  let multilineValue = [];
  let isMultiline = false;

  for (const line of lines) {
    const isIndented = /^\s+/.test(line);

    if (isIndented && isMultiline && currentKey) {
      multilineValue.push(line.trim());
      continue;
    }

    // Flush previous multiline value
    if (isMultiline && currentKey) {
      result[currentKey] = multilineValue.join(' ').trim();
      isMultiline = false;
      currentKey = null;
      multilineValue = [];
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    if (/^[|>][+-]?$/.test(rawValue)) {
      currentKey = key;
      isMultiline = true;
      multilineValue = [];
    } else {
      result[key] = rawValue;
    }
  }

  // Flush trailing multiline
  if (isMultiline && currentKey) {
    result[currentKey] = multilineValue.join(' ').trim();
  }

  return result;
}

/**
 * Scan a directory for subdirectories containing SKILL.md.
 * Returns array of { name, description, path } relative to basePath.
 */
function scanDir(dirPath, basePath) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const relPath = path.relative(basePath, path.join(dirPath, entry.name));

    results.push({
      name: frontmatter.name || entry.name,
      description: frontmatter.description || '',
      path: relPath,
    });
  }

  return results;
}

/**
 * Scan dirPath for skills. Checks:
 * 1. Root SKILL.md (single-skill repos like blader/humanizer)
 * 2. One level deep: <dir>/<name>/SKILL.md
 * 3. Well-known subdirs: <dir>/skills/<name>/SKILL.md
 *
 * Returns array of { name, description, path }.
 */
function scanForSkills(dirPath) {
  const resolvedDir = path.resolve(dirPath);
  const results = [];
  const seen = new Set();

  // 1. Check for SKILL.md at root level (single-skill repos)
  const rootSkillMd = path.join(resolvedDir, 'SKILL.md');
  if (fs.existsSync(rootSkillMd)) {
    const content = fs.readFileSync(rootSkillMd, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const name = frontmatter.name || path.basename(resolvedDir);
    results.push({ name, description: frontmatter.description || '', path: '.' });
    seen.add(name);
  }

  // 2. Check one level deep
  for (const skill of scanDir(resolvedDir, resolvedDir)) {
    if (!seen.has(skill.name)) {
      results.push(skill);
      seen.add(skill.name);
    }
  }

  // 3. Check well-known subdirectories (skills/, commands/, agents/)
  for (const subdir of ['skills', 'commands', 'agents']) {
    const subdirPath = path.join(resolvedDir, subdir);
    if (fs.existsSync(subdirPath)) {
      for (const skill of scanDir(subdirPath, resolvedDir)) {
        if (!seen.has(skill.name)) {
          results.push(skill);
          seen.add(skill.name);
        }
      }
    }
  }

  return results;
}

module.exports = { scanForSkills, parseFrontmatter };
