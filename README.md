<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
    <img alt="skit" src="docs/assets/logo-dark.svg" width="400">
  </picture>
</p>

<p align="center">
  <strong>The package manager for AI agent skills.</strong><br>
  Install, organize, and share skills across Claude Code, Cursor, Windsurf, and more.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/skit"><img src="https://img.shields.io/npm/v/skit.svg?style=flat-square&color=6C63FF" alt="npm version"></a>
  <a href="https://opensource.org/licenses/ISC"><img src="https://img.shields.io/badge/license-ISC-blue.svg?style=flat-square" alt="License: ISC"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/skit?style=flat-square&color=3B82F6" alt="Node.js"></a>
  <a href="#supported-agents"><img src="https://img.shields.io/badge/agents-Claude_Code_%7C_Cursor_%7C_Windsurf-22D3EE?style=flat-square" alt="Agents"></a>
</p>

---

<p align="center">
  <img src="docs/assets/hero-demo.gif" alt="skit install demo" width="720">
</p>

---

## Quick Start

```bash
# Install globally (CLI command stays `skit`)
npm install -g skit-cli

# Install skills from a GitHub repo
skit install https://github.com/someone/their-skills

# Clone someone's entire skill setup
skit clone snir

# List what you have
skit list
```

---

## Why do I need this?

**Your skills are a mess.** You've got markdown files scattered across `~/.claude/skills/`, some copied from GitHub, some you wrote, some a colleague sent on Slack. Half are outdated. You have no idea where they came from or if there's a newer version.

**You can't share your setup.** A teammate asks "what skills do you use?" and you end up zipping folders and writing instructions. When someone shares a great skill repo, everyone manually clones it and copies files around.

**Switching machines is painful.** New laptop? Re-download everything. Reinstall from that gist you bookmarked 3 months ago. Hope you remember which skills you had.

**You use multiple agents.** Claude Code today, Cursor tomorrow, maybe Windsurf for a side project. Each has its own skill directory. You're maintaining the same skills in 3 places.

**Skills break silently.** The repo you cloned 2 months ago got updated. Your local copy is stale. You don't know, and there's no way to check without visiting every GitHub repo manually.

skit solves all of this:

- **`skit install <url>`** — Install from GitHub, gists, or local folders. Scans for skills automatically.
- **`skit update`** — One command to pull the latest version of every skill.
- **`skit clone <user>`** — Replicate anyone's entire setup in seconds.
- **`skit sync`** — New machine? One command to recreate everything from your manifest.
- **`skit doctor`** — Find broken links, stale sources, and available updates.
- **Cross-platform** — Windows (NTFS junctions), macOS, and Linux (symlinks). No admin rights.
- **Multi-agent** — Claude Code, Cursor, and Windsurf supported. VS Code coming.

---

## Commands

| Command | Description |
|---------|-------------|
| `skit install <url\|path>` | Clone repo or register local folder, scan for skills, interactive picker |
| `skit import <any-url>` | Smart import from gist, GitHub subfolder, or raw URL |
| `skit remove <skill>` | Remove a skill (prompts if last skill from source) |
| `skit remove --source <name>` | Remove all skills from a source |
| `skit list` | Show all skills grouped by source |
| `skit update [source]` | Git pull + re-link (all sources or one) |
| `skit sync` | Recreate all links from manifest (new machine setup) |
| `skit clone <user\|url>` | Fetch profile, install everything |
| `skit profile export` | Export your setup as shareable JSON |
| `skit profile import <file>` | Apply a profile with conflict resolution |
| `skit profile diff <file\|user>` | Show what they have that you don't |
| `skit profile push` | Publish profile to GitHub Gist (requires `gh`) |
| `skit doctor` | Health check: broken links, missing sources, updates |
| `skit link <path>` | Low-level: create link for one skill directory |
| `skit unlink <skill>` | Low-level: remove link only, keep source |
| `skit config set <key> <val>` | Set config (agent, user, skitHome) |
| `skit config get <key>` | Get config value |

---

## How It Works

skit keeps skills in a central library (`~/.skit/`) and creates filesystem links into your agent's skill directory. Your agent sees the skills exactly where it expects them, but skit tracks everything behind the scenes.

```
~/.skit/
├── config.json              # Agent, username, preferences
├── manifest.json            # Single source of truth
├── sources/
│   ├── own/                 # Your repos (--own flag)
│   │   └── my-skills/
│   └── external/            # Third-party repos
│       ├── someone--skills/
│       └── _standalone/     # From skit import
└── profiles/                # Cached profiles

~/.claude/skills/            # Agent target (links only)
├── code-reviewer → ~/.skit/sources/external/someone--skills/code-reviewer
├── my-tool       → ~/.skit/sources/own/my-skills/my-tool
└── quick-doc     → ~/.skit/sources/external/_standalone/quick-doc
```

**Windows**: NTFS junctions (no elevation needed) · **macOS/Linux**: directory symlinks

---

## Install from GitHub

```bash
$ skit install https://github.com/someone/their-skills
```

<img src="docs/assets/hero-demo.gif" alt="skit install" width="680">

skit clones the repo, scans for skills (directories containing `SKILL.md`), and presents an interactive picker. Selected skills are linked into your agent's skill directory.

---

## List Your Skills

```bash
$ skit list
```

<img src="docs/assets/list-demo.gif" alt="skit list" width="680">

Skills are grouped by source with their descriptions. Own sources are highlighted separately from external ones.

---

## Clone a Profile

The viral feature. One command to replicate anyone's skill setup:

```bash
$ skit clone snir
```

<img src="docs/assets/clone-demo.gif" alt="skit clone" width="680">

`skit clone` fetches the user's profile from GitHub Gists, clones all source repos, and installs every skill. Share your profile with `skit profile push`.

---

## Smart Import

`skit import` handles any URL format:

```bash
# Full repo → delegates to install
skit import https://github.com/user/repo

# Subfolder → installs just that skill
skit import https://github.com/user/repo/tree/main/skills/my-skill

# Gist → downloads files as a standalone skill
skit import https://gist.github.com/user/abc123

# Raw URL → wraps as standalone skill
skit import https://raw.githubusercontent.com/user/repo/main/skill.md
```

---

## Supported Agents

| Agent | Status | Skill Directory |
|-------|--------|-----------------|
| **Claude Code** | Supported | `~/.claude/skills/` |
| **Cursor** | Supported | `~/.cursor/rules/` |
| **Windsurf** | Supported | `~/.windsurf/rules/` |
| **VS Code** | Planned | TBD |

Switch agents with:

```bash
skit config set agent cursor      # use Cursor
skit config set agent windsurf    # use Windsurf
skit config set agent claude-code # use Claude Code (default)
```

Adding a new agent adapter is ~20 lines. See `src/agents/` for examples.

---

## Skill Format

A skill is a directory containing a `SKILL.md` file with optional YAML frontmatter:

```markdown
---
name: my-skill
description: Use when the user wants to do X
---

# My Skill

Instructions for the AI agent...
```

skit scans for skills at the repo root, one level deep, and in well-known subdirectories (`skills/`, `commands/`, `agents/`).

---

## Health Check

```bash
$ skit doctor

  Checking 8 skills...

  Broken links:
    pr-helper → source missing

  Updates available:
    their-skills: 3 commits behind

  1 issue found. Run 'skit sync' to fix broken links.
```

---

## Comparison

| Feature | skit | AGR | skills-manager |
|---------|------|-----|----------------|
| Cross-platform | Windows + macOS + Linux | macOS + Linux | macOS + Linux |
| Install source | Git repos, gists, URLs, local | Git repos | Local only |
| Multi-agent | Claude Code + extensible | Claude Code only | Claude Code only |
| Profile sharing | `skit clone <user>` | — | — |
| Smart import | Any URL auto-detected | — | — |
| Version tracking | Full manifest | — | — |
| Interactive picker | Checkbox UI | — | GUI |
| Package manager | npm | pip | Tauri binary |

---

## Contributing

Issues and PRs welcome. This is v1 — there's lots of room to grow.

**Roadmap**:
- Community registry with search and trending skills
- VS Code agent adapter
- `skit init` scaffolding for new skill repos
- Interactive TUI browser

See [`docs/design.md`](docs/design.md) for the full specification.

---

## Credits

Terminal demo GIFs created with [command-giffer](https://github.com/balgaly/command-giffer).

## License

[ISC](LICENSE)
