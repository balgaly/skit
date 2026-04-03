# skit — Roadmap & Backlog

> Living document. Items are ordered roughly by priority within each tier.

---

## Open PRs

### PR #1 — `skit incognito` (feat/incognito-mode)
Per-project plugin quarantine for Claude Code. Blocks all global plugins/skills
for the current project via `settings.local.json`. Allowlist support via
`skit incognito allow <name>`.

**Status:** Implementation complete (546 additions, 3 files). Needs:
- Code + security review (it writes to `.claude/settings.local.json` — audit carefully)
- Tests (PR test plan has 9 manual steps, none automated yet)
- Merge

---

## Near-term (v1.x)

### 1. Version bump → 1.1.0
`package.json` is still at `1.0.0`. Cursor adapter + config validation = minor bump.
One-liner: bump `version` in `package.json` and commit.

### 2. Windsurf agent adapter
Mirror of the Cursor adapter. ~20 lines.
- `skillDir()` → `~/.windsurf/rules/`
- `detectSkill()` — check what Windsurf uses (likely `.windsurfrules` or `SKILL.md`)
- Register in `src/agents/index.js`
- Update README badge to include Windsurf
- 8 tests following cursor adapter pattern

### 3. GitHub Actions CI
A simple matrix workflow catches cross-platform regressions before merge.

```yaml
# .github/workflows/test.yml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: [18, 20]
```

Blocked previously by repo permission scope — resolve that first.
Gives README a green CI badge.

### 4. CHANGELOG.md
Required before first npm publish. One entry per released version.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

```
## [1.1.0] - 2026-04-03
### Added
- Cursor agent adapter (`skit config set agent cursor`)
- Agent value validation in `skit config set`
```

---

## Medium-term (v1.x → v2.0)

### 5. Extract `src/ui/` helpers
chalk/inquirer/ora calls are duplicated inline across 12 command files.
Extract to:
- `src/ui/spinner.js` — ora wrapper with fallback
- `src/ui/picker.js` — inquirer checkbox wrapper
- `src/ui/format.js` — chalk colour helpers, table formatting

Low risk, improves consistency. Good first-contributor task.

### 6. Interactive TUI (`npx skit` with no args)
Launch a menu when run without a subcommand. Browse installed skills,
quick-install from popular sources, open profile diff. Needs `src/ui/` extracted first.

### 7. Community registry
A JSON file on GitHub listing curated skill repos. Powers `skit search <keyword>`
and the TUI browser. Needs adoption data to be useful.

---

## v2.0

### 8. Skill versioning
Pin a skill to a specific git SHA or tag. `skit update` respects pins.

### 9. Skill dependencies
Skills declare what they depend on in `SKILL.md` frontmatter.
`skit install` resolves the dependency graph.

### 10. `skit init`
Scaffold a new skill repo: creates `SKILL.md` with frontmatter template,
`README.md`, and optional `.cursorrules`. Like `npm init` for skills.

---

## Won't do (v1)

- Central package registry with auth (scope creep, maintenance burden)
- Auto-discovery of skills from the internet (security surface)
- TypeScript rewrite (CLAUDE.md: ship fast, add types later)
