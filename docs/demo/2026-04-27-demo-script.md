# skit Live Demo — 2026-04-27

> 25-30 min live terminal demo for a mixed-agent audience (Claude Code / Cursor / Copilot users).
> Live-coded on a fresh EC2 box (Claude Code via Bedrock).
> v1.2.0 — matches what audience installs from npm.

---

## Pre-flight (before audience arrives)

On the EC2 box (verified 2026-04-27):

```bash
# Sanity
node --version        # v20.20.2 confirmed
npm --version         # 10.8.2 confirmed
claude --version      # 2.1.119 via Bedrock, instance role auth

# One-time: set user-local npm prefix (audience hits EACCES otherwise)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile

# Clean slate
rm -rf ~/.skit ~/.claude/skills
npm uninstall -g skit-cli 2>/dev/null || true

# Install fresh — exactly what audience will run
npm install -g skit-cli
skit --version        # 1.2.0

# Two terminal windows:
#  LEFT  — where you run skit commands
#  RIGHT — shows `ls ~/.claude/skills/` live (watch or repeat manually)
```

Open README.md in a browser tab as backup visual.
Keep this file open in a second monitor — don't memorize, read out loud where useful.

---

## Audience segmentation (30 sec at top)

> "Quick show of hands — who's using Claude Code? Cursor? Copilot?
> Something else? Great — skit works with all three of the first ones today,
> and I'll call out where Copilot folks need to adapt."

---

## Act 1 — The Problem (3 min)

**Talking points, not slides. Do this while staring at an empty terminal.**

- You've collected skills (markdown files with frontmatter) from Slack, GitHub, gists, colleagues.
- They live in `~/.claude/skills/` or `~/.cursor/rules/`.
- You have no idea:
  - Where each one came from
  - Whether it's up to date
  - How to share your full setup with a teammate
  - How to get them on your new laptop
- And if you switch agents — Claude Code today, Cursor tomorrow — you duplicate everything.

> "This is the problem skit solves. Think `npm` for AI agent skills,
> except the skills live in the original author's git repo — skit just manages
> the links into your agent's skill directory."

---

## Act 2 — Install + Pick Your Agent (2 min)

**Left terminal:**

```bash
npm install -g skit-cli
skit --help
```

Scroll the help output. Talking points per audience segment:

- **Claude Code users**: skills land in `~/.claude/skills/` — exactly where Claude Code already reads from.
- **Cursor users**: `skit config set agent cursor` → links go to `~/.cursor/rules/` instead.
- **Windsurf users**: same pattern with `agent windsurf`.
- **Copilot users**: no native adapter yet, but skills are just markdown — use them as `@workspace` context manually, or as system prompts. skit still helps you organize them.

```bash
skit config set agent claude-code
skit config get
```

---

## Act 3 — Install Real Skills from GitHub (8 min)

This is the meat. Use a real public repo so audience can follow along.

**Primary demo source: `anthropics/skills`** — the official Anthropic skill pack (pdf, docx, pptx, xlsx, canvas-design, etc.). Large, well-known, obvious utility.

```bash
skit install https://github.com/anthropics/skills
```

What happens live:
1. skit clones the repo into `~/.skit/sources/external/anthropics--skills/`
2. Scans recursively for folders containing `SKILL.md`
3. Opens an interactive checkbox picker

**Pick 3 skills** for the demo (keeps it fast):
- `pdf` — read/create/edit PDFs
- `docx` — Word document manipulation
- `xlsx` — spreadsheet work

**Right terminal** (show filesystem):

```bash
ls -la ~/.claude/skills/
```

Audience sees three symlinks appear. Narrate:

> "Notice — skit didn't *copy* those files. They're symlinks (junctions on Windows)
> pointing back to the clone in `~/.skit/`. That means when I run `skit update`,
> every skill from this repo updates at once, and I never have a stale copy drift."

**Show they work** — jump into Claude Code on the EC2 box:

```bash
claude
> use the pdf skill to tell me what it can do
```

Claude Code picks up the skill instantly. That's the "aha" moment.

**Audience-adaptive riff:**
- *Cursor users*: "same thing happens in Cursor — the rules file is there, Cursor picks it up on next session."
- *Copilot users*: "you'd copy the SKILL.md content into your prompt or Copilot instructions. skit still gives you one place to manage them."

---

## Act 4 — List, Doctor, Update (4 min)

```bash
skit list
```

Grouped by source. Every skill shows its description from frontmatter.

```bash
skit doctor
```

Health check. Explain the categories:
- **Tracked**: skit knows about this skill, link is healthy
- **Untracked**: something in the skill dir that skit didn't install (orphan from before)
- **Mislocated**: link points nowhere
- **Updates available**: source repo has new commits

```bash
skit update
```

`git pull` on every tracked source. Re-runs the linker. One command, whole library fresh.

> "This is why I keep saying 'npm for skills.' You get the dependency
> management pattern without having to host anything. Authors keep owning
> their skills in their repos."

---

## Act 5 — The Viral Feature: `skit clone` — Narrated, Not Run (3-4 min)

**Known issue on v1.2.0:** `profile export` omits the source URL (bug filed — `docs/demo/BUG-profile-export-origin.md`), so a live end-to-end `clone` would skip every skill. Don't run the full flow. Show the pieces that DO work and talk the rest.

**What to show live:**

```bash
skit profile export       # pipe to less/head — show the JSON shape
```

Point out: `sources[]` + `skills[]`. "This JSON is your whole setup."

**What to narrate (do NOT run `skit clone`):**

> "The headline feature is `skit clone <username>`. Point at a GitHub user who
> published their profile, and skit pulls their gist, clones every source repo,
> and links every skill. One command, full setup on a new laptop or for a new
> teammate. That's the viral loop — your setup becomes portable and shareable.
>
> Full disclosure: we caught a bug in `profile export` during dry-run this
> morning — sources lose their URL on export, which means clone has nothing to
> fetch. Fix is one line, patch ships as 1.2.1 this week. The command works;
> the export that feeds it needs a tweak.
>
> This is what makes skit a social tool, not just a package manager."

**Optional backup proof:** show the command + help text so audience sees it's real:

```bash
skit clone --help
skit profile push --help
```

---

## Act 6 — Multi-agent Switch (2 min)

```bash
skit config set agent cursor
skit sync
ls ~/.cursor/rules/
```

Same three skills, now linked into Cursor's rules directory. Narrate:

> "One library of skills, any agent. You don't maintain three copies.
> Switch agents with `skit config set agent <name>` and re-sync."

Switch back for the rest of the demo:

```bash
skit config set agent claude-code
skit sync
```

---

## Act 7 — Bonus: Incognito (optional, 1-2 min)

Skip if tight on time.

```bash
cd /tmp/some-project
skit incognito on
```

> "Per-project quarantine — blocks your global skills for this project only.
> Useful when you're working on something sensitive, or when a global skill
> is interfering with a project's own `.claude/settings.local.json`."

```bash
skit incognito off
```

---

## Act 8 — What's Next (2 min)

Forward-looking, honest:

- **Skill versioning** — pin a skill to a git SHA or tag; `skit update` respects pins.
- **Skill dependencies** — declare what a skill needs in its frontmatter; skit resolves the graph.
- **`skit init`** — `npm init` for skills. Scaffold a new skill repo with frontmatter template.
- **GitHub Copilot adapter** — once the skill-file format stabilizes on Copilot's side.

> "That's the near-term roadmap. Everything I showed you today is on npm
> right now: `npm install -g skit-cli`, v1.2.0. The HTML handout I'll send
> has copy-paste commands for every user journey you saw."

---

## Q&A Cues (keep answers tight)

- *"Does it work offline?"* — install needs network; day-to-day use (list, sync, link) is fully local.
- *"What if a skill has bad code?"* — skills are markdown; skit doesn't execute anything. Your agent does.
- *"How do I uninstall skit?"* — `npm uninstall -g skit-cli && rm -rf ~/.skit`. Your agent skill dirs are just symlinks — removing `~/.skit` clears them; re-running your agent is clean.
- *"Windows permissions?"* — junctions, no admin required. Tested on Win 10/11.
- *"Why Node, not Python?"* — audience fit. The AGR tool is Python; we wanted the JS/TS crowd covered first.

---

## Time budget

| Act | Minutes | Running total |
|-----|---------|---------------|
| 1. Problem | 3 | 3 |
| 2. Install + agent | 2 | 5 |
| 3. Install skills | 8 | 13 |
| 4. List/doctor/update | 4 | 17 |
| 5. Clone (narrated, bug caveat) | 3-4 | 20-21 |
| 6. Multi-agent switch | 2 | 24 |
| 7. Incognito (skip if late) | 2 | 26 |
| 8. What's next | 2 | 28 |
| Q&A buffer | 2+ | 30 |

---

## Recovery plays (if something breaks live)

- **`skit install` hangs on clone** → Ctrl-C, `skit install ~/demo-cache/anthropics-skills` (pre-clone a local copy before the demo; skit detects local paths).
- **`gh` not authed on EC2** → `gh auth login` was done in pre-flight; if it fails, skip the `profile push` step and run `skit clone https://gist.githubusercontent.com/.../raw/skit-profile.json` directly with a pre-created gist URL.
- **Network dies** → pivot to the HTML handout, walk through the user journeys on the page instead.
- **Picker looks bad over SSH** → `skit install <url> --all` installs everything without the picker.
