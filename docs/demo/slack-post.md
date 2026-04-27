# skit — Internal AI Channel Post

> Drop into your company AI channel. Fill in the `[VIDEO LINK]` placeholder. Handout link = wherever you host `docs/demo/handout.html` (GitHub Pages, S3, intranet, etc).

---

## Short version (single message)

> **skit — a package manager for AI agent skills** 📦
>
> Just gave a 25-min live demo of a side project I've been building. It's `npm` for the markdown skills your AI coding agent reads — works with Claude Code, Cursor, and Windsurf from the same library.
>
> **Why you might care:**
> - Install skills from any GitHub repo with one command
> - Keep them up to date with `skit update`
> - Switch between Claude Code / Cursor without re-copying files
> - Coming soon: clone a teammate's entire skill setup with `skit clone <user>`
>
> 🎥 Recording: [VIDEO LINK]
> 📄 Try it yourself (copy-paste commands): [HANDOUT LINK]
> 📦 `npm install -g skit-cli` — works on macOS, Linux, Windows
>
> Happy to chat if you want to try it — it's open source, and I'm looking for early users.

---

## Long version (threaded / multi-message)

**Message 1 (main post):**

> **skit — the package manager your AI agent skills have been waiting for** 📦
>
> I gave a live demo today for folks across Claude Code, Cursor, and Copilot. Thought I'd share it here for the rest of the team.
>
> **The problem:** your agent skills (those `SKILL.md` files with frontmatter) are a mess. Some live in `~/.claude/skills/`, some in `~/.cursor/rules/`, some got copied from a Slack message three months ago. You have no idea what's current, what came from where, or how to share your setup when a teammate asks.
>
> **skit fixes that.** Think `npm`, but for skills. One library, linked into whichever agent you're using.
>
> 🎥 Recording (25 min): [VIDEO LINK]
> 📄 Self-serve handout with copy-paste commands: [HANDOUT LINK]

**Message 2 (thread reply):**

> **What you can do with it today:**
>
> ```
> npm install -g skit-cli
> skit install https://github.com/anthropics/skills   # pick what you want from the list
> skit list                                           # see everything, grouped by source
> skit update                                         # refresh everything from source repos
> skit doctor                                         # health check — broken links, stale sources
> skit config set agent cursor && skit sync           # switch agents without re-copying
> ```
>
> Skills are just markdown — skit doesn't execute anything. It manages symlinks (or NTFS junctions on Windows) into wherever your agent looks.

**Message 3 (thread reply):**

> **Who this is for:**
> - Claude Code / Cursor / Windsurf users — native adapters, works out of the box
> - GitHub Copilot users — no native hook yet, but you can still use skit to organize skills and paste them into Copilot instructions
>
> **Coming next:** `skit clone <github-username>` — one command to adopt someone else's entire skill setup. Great for team onboarding or new laptops. Ships in the next patch.
>
> **Feedback welcome** — DMs open, or file issues at [github.com/balgaly/skit](https://github.com/balgaly/skit). If you try it and hit anything weird, I want to hear about it.

---

## Tone / formatting notes

- Channel is likely Slack — replace `**bold**` with `*bold*` if your workspace uses classic markdown (Slack's rich text editor handles both).
- The emoji at the top of each message is optional but helps the post stand out in a busy channel.
- The short version works in a single message (~900 chars). The long version is better if you want engagement — threaded replies get people reacting per sub-message.
- DON'T promise the registry or a marketplace — neither is live yet. The "coming next" is `skit clone` specifically.

---

## Post-post follow-ups

- Pin the message if your channel supports it.
- React yourself with 📦 so there's an anchor reaction people can pile onto.
- If anyone in the thread tries it and hits the "add more skills from same source" UX gap, acknowledge it's a known rough edge and that a fix is landing this week.
