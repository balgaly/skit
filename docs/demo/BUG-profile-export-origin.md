# Bug — `skit profile export` drops source URL; `skit clone` cannot fetch

**Discovered:** 2026-04-27 during demo dry-run (v1.2.0)
**Severity:** High — makes `clone` + `profile import` effectively useless for external git sources
**Decision:** Don't patch today. Demo narrates the feature without running it. Patch + ship 1.2.1 this week.

## Repro

```bash
skit install https://github.com/anthropics/skills --all
skit profile export > /tmp/p.json
# sources[0] has { name, type } but NO url/origin
rm -rf ~/.skit ~/.claude/skills
skit clone /tmp/p.json
# "Skipping source ... — no origin URL"
# 0 sources cloned, 0 skills linked
```

## Root cause

- `src/core/manifest.js` — `install` writes source entries with key `url`
  (see manifest.json dump: `sources.anthropics--skills.url`)
- `src/commands/profile.js:38` — `profileExport` reads `data.origin` and only emits
  `entry.origin` when that key exists
- Result: every exported profile has sources without any URL, so `clone` / `profile import`
  have nothing to clone from

## Fix

One-line in `profile.js` (or rename the key consistently across install/clone/profile). Add
a regression test: export → import round-trip must preserve source URL.

## Why not today

- Demo is today; republishing 1.2.1 and having audience install exactly-what-was-shown
  collides with the "same version" constraint the user set
- Clone is narrated, not run, in the live demo; the install/list/doctor/update/sync/
  multi-agent-switch journeys all work and carry the talk

## Next step after demo

1. Fix the key mismatch (decide: rename `url` → `origin` in manifest, OR read `data.url` in
   export — the second is backwards-compatible with existing manifests, the first requires
   a migration)
2. Add round-trip test `profile export → profile import` with skills re-linked
3. Bump to 1.2.1, publish, update handout + README
