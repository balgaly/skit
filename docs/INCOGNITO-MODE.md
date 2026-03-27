# Incognito Mode — skit Feature Plan

> Adapted from the sherpa project's incognito mode spec. Integrated into skit as `skit incognito on/off`.

---

## Problem

Claude Code loads plugins from a hierarchical settings merge:

```
User Global Settings   (~/.claude/settings.json)
        |  merge
Project Settings       (.claude/settings.json)
        |  merge
Project Local Settings (.claude/settings.local.json)   <- highest priority
```

Plugins enabled globally are visible in **every** project. There is no built-in "disable all global plugins for this project" toggle. This causes:

- **Skill development noise**: Global skills interfere when building/testing new skills
- **Clean-room testing**: Can't verify a project works without inherited plugins
- **Security isolation**: Untrusted plugins run in sensitive projects

## Solution

A **quarantine script** that reads the user's global `~/.claude/settings.json`, extracts every enabled plugin, and writes them as `false` into the project's `settings.local.json`. Since local settings have highest merge priority, this effectively blocks all global plugins for this project only.

### How the merge works

```
Global:  { "superpowers@official": true,  "babysitter@a5c.ai": true }
Local:   { "superpowers@official": false, "babysitter@a5c.ai": false }
                                                    |
Result:  { "superpowers@official": false, "babysitter@a5c.ai": false }
```

## skit Integration

### Commands

```bash
# Enable incognito mode for current project
skit incognito on

# Disable incognito mode
skit incognito off

# Check status
skit incognito status

# Allow a specific plugin in incognito mode
skit incognito allow <plugin-name>
```

### What `skit incognito on` does

1. Creates `.claude/quarantine-plugins.js` in the project
2. Adds a `SessionStart` hook to `.claude/settings.local.json` that runs the script
3. Runs the script once to seed the quarantine immediately

### What the quarantine script does

```
1. Read global settings (~/.claude/settings.json)
   Extract: enabledPlugins where value = true

2. Read local settings (.claude/settings.local.json)
   Or start with empty object

3. Build quarantine map: every global plugin key -> false

4. Merge: { ...quarantined, ...existingLocal }
   Quarantine first, existing local overrides win
   (so manually set "true" entries survive)

5. Diff check: skip write if nothing changed

6. Atomic write: write to .tmp then rename into place
```

### What `skit incognito allow <plugin>` does

Sets the plugin to `true` in `settings.local.json`. The spread order `{ ...quarantined, ...existingLocal }` means manual `true` entries survive the quarantine.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| New global plugin added | Next SessionStart blocks it. One-session lag. |
| Global plugin removed | Stale `false` stays. Harmless no-op. |
| User wants a global plugin here | `skit incognito allow <name>` sets it to `true` |
| No global settings file | Script exits silently |
| Multiple Claude instances | Atomic write prevents corruption |

## Limitations

1. **One-session lag**: New global plugins are seen in the first session, blocked from the second onward
2. **Plugin installation is global**: You can't install a plugin only for one project. You can only control enablement.
3. **Manual upkeep for allowlist**: Use `skit incognito allow` to exempt specific plugins

## Future Enhancements

- **Zero-lag mode**: Run quarantine *before* starting Claude Code via a wrapper
- **Allowlist file**: `.claude/incognito-allowlist.json` for exempted plugins
- **Reverse incognito**: Block only specific plugins instead of all
- **Status indicator**: Show "INCOGNITO" in Claude Code status line via `statusLine` setting
- **skit skills isolation**: Block all skit-installed skills too, not just plugins
