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

  for (const line of frontmatterBlock.split('\n')) {
    const colonIndex = line.indexOf(': ');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 2).trim();
    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Recursively scan dirPath for immediate subdirectories containing SKILL.md.
 * Returns array of { name, description, path }.
 */
function scanForSkills(dirPath) {
  const resolvedDir = path.resolve(dirPath);
  const results = [];

  // Check for SKILL.md at root level (single-skill repos)
  const rootSkillMd = path.join(resolvedDir, 'SKILL.md');
  if (fs.existsSync(rootSkillMd)) {
    const content = fs.readFileSync(rootSkillMd, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    results.push({
      name: frontmatter.name || path.basename(resolvedDir),
      description: frontmatter.description || '',
      path: '.',
    });
  }

  // Check one level deep (multi-skill repos)
  let entries;
  try {
    entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = path.join(resolvedDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    results.push({
      name: frontmatter.name || entry.name,
      description: frontmatter.description || '',
      path: entry.name,
    });
  }

  return results;
}

module.exports = { scanForSkills, parseFrontmatter };
