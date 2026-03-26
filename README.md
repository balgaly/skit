# skit

> A cross-platform package manager for AI agent skills

[![npm version](https://img.shields.io/npm/v/skit.svg)](https://www.npmjs.com/package/skit)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

**"npm for AI agent skills. Install, organize, and update skills from any source."**

---

## Quick Start

```bash
# Install globally
npm install -g skit

# Install skills from a GitHub repo
skit install https://github.com/someone/their-skills

# Clone someone's entire skill setup
npx skit clone snir

# List all installed skills
skit list
```

---

## Why skit?

AI coding agents (Claude Code, Cursor, Windsurf) support custom skills, but managing them is messy. `skit` fixes this:

- **Cross-platform**: Works seamlessly on Windows (junctions), macOS, and Linux (symlinks)
- **Multi-source**: Install from GitHub repos, local folders, gists, or raw URLs
- **Version control**: Track every skill's origin, version, and updates
- **One-command sharing**: `skit clone <user>` lets you instantly replicate anyone's skill setup
- **Smart imports**: Automatically detect and install skills from any URL
- **Health checks**: Detect broken links, missing sources, and available updates

---

## Commands

| Command | Description |
|---------|-------------|
| `skit install <url>` | Clone repo, scan for skills, interactive picker, link selected |
| `skit install <local-path>` | Register local folder as source, link skills |
| `skit import <any-url>` | Smart import from gist/GitHub path/raw URL |
| `skit remove <skill>` | Remove junction, prompt if last skill from source |
| `skit remove --source <name>` | Remove all skills from a source |
| `skit list` | Show all skills grouped by source |
| `skit list --source <name>` | Filter by source |
| `skit update [source]` | Git pull + re-link (all sources or specific one) |
| `skit sync` | Recreate all junctions from manifest (new machine setup) |
| `skit clone <user>` | Fetch user's profile, install everything |
| `skit clone <url>` | Fetch profile from URL, install everything |
| `skit profile export` | Export manifest as shareable profile JSON to stdout |
| `skit profile import <file>` | Apply a profile (install missing, prompt for conflicts) |
| `skit profile diff <file-or-user>` | Show what they have that you don't |
| `skit profile push` | Publish profile to GitHub gist (requires `gh` CLI) |
| `skit doctor` | Health check: broken links, missing sources, updates available |
| `skit link <path>` | Low-level: create junction for one skill directory |
| `skit unlink <skill>` | Low-level: remove junction only, keep source |
| `skit config set <key> <value>` | Set config (agent, user, skitHome) |
| `skit config get <key>` | Get config value |

---

## Supported Agents

- **Claude Code** (default) — `~/.claude/skills/`
- **Extensible design** — adding new agents is ~20 lines of code

Future agents (community contributions welcome):
- Cursor
- Windsurf
- VS Code extensions
- Any AI agent with a skill/rule directory

---

## Profile & Clone (The Viral Feature)

Share your entire skill setup in one command:

```bash
# Export your profile
skit profile export > my-skills.json

# Or publish it as a GitHub Gist
skit profile push

# Anyone can now clone your setup
npx skit clone your-github-username
```

`skit clone` automatically:
- Fetches the profile from GitHub Gists
- Clones all source repositories
- Installs all skills with interactive conflict resolution
- Sets up your agent directory with junctions/symlinks

**Growth engine**: One user shares their profile, dozens install it instantly.

---

## Cross-Platform Linking

`skit` uses filesystem links to keep skills organized without duplicating files:

- **Windows**: NTFS junctions (no admin rights required)
- **macOS/Linux**: Directory symlinks

Your agent sees skills in `~/.claude/skills/`, but they actually live in `~/.skit/sources/` where they're tracked, versioned, and updatable.

---

## How It Works

```
~/.skit/
├── config.json          # Agent, username, home directory
├── manifest.json        # Single source of truth for all skills
├── sources/
│   ├── own/             # Your repos (you author these)
│   │   └── my-skills/   # git repo clone
│   └── external/        # Everything from elsewhere
│       ├── their-skills/
│       └── _standalone/ # from import (gists, URLs)
└── profiles/            # Cached imported profiles

~/.claude/skills/        # Agent target (junctions/symlinks ONLY)
├── skill-1 → ~/.skit/sources/own/my-skills/skill-1
├── skill-2 → ~/.skit/sources/external/their-skills/skill-2
└── skill-3 → ~/.skit/sources/external/_standalone/skill-3
```

---

## Smart Import

`skit import` detects and handles multiple URL formats:

```bash
# Full GitHub repo → delegates to install
skit import https://github.com/user/repo

# GitHub subfolder → installs just that skill
skit import https://github.com/user/repo/tree/main/skills/my-skill

# GitHub Gist → downloads all files as a skill
skit import https://gist.github.com/user/abc123

# Raw URL → wraps as a standalone skill
skit import https://raw.githubusercontent.com/user/repo/main/skill.md
```

---

## Examples

### Install from GitHub

```bash
$ skit install https://github.com/someone/their-skills

  Cloning someone/their-skills...
  Found 5 skills:

  [x] cool-skill      - Use when reviewing PRs for security issues
  [ ] another-skill   - Use when generating changelogs
  [x] test-runner     - Use when running test suites

  Space to toggle, Enter to confirm, A to select all

  Installed 2 skills from their-skills
    cool-skill    -> ~/.claude/skills/cool-skill
    test-runner   -> ~/.claude/skills/test-runner
```

### Clone a Profile

```bash
$ npx skit clone snir

  Fetching snir's profile...
  Found 8 skills from 3 sources:

  snirs-skills (4 skills)
    view-md, split, code-reviewer, ship

  their-skills (2 skills)
    cool-skill, test-runner

  standalone (2 skills)
    pr-helper, quick-docs

  Install all 8 skills? (Y/n/pick)

  Cloned 3 sources, installed 8 skills
  Your setup now matches snir's profile
```

### Health Check

```bash
$ skit doctor

  Checking 8 skills...

  Broken links:
    pr-helper -> source missing (sources/external/_standalone/pr-helper)

  Updates available:
    their-skills: 3 commits behind (d4e5f6a -> b7c8d9e)
    snirs-skills: up to date

  Unused sources:
    old-tools: cloned but no skills installed

  1 issue found. Run 'skit sync' to fix broken links.
```

---

## License

ISC

---

## Contributing

Issues and PRs welcome! This is v1.0 — there's lots of room to grow.

**Roadmap**:
- Interactive TUI browser (`npx skit`)
- Community registry with trending/popular skills
- Additional agent adapters (Cursor, Windsurf, VS Code)

See `docs/design.md` for the full specification.
