# AGENTS.md

## Project Shape

- This repo is a single Tampermonkey/Violentmonkey userscript. `LINUXDO_ReadBoost.js` is the shipped artifact and runtime entrypoint, even though the display name is now `Discourse Read Boost`.
- Edit `LINUXDO_ReadBoost.js` directly; there is no source/build split or generated bundle step.
- There is no package manager manifest, CI, linter, formatter, or test suite in the repo. Do not invent `npm`/`pnpm` workflows.
- The script runs directly in Discourse topic pages matched by the userscript metadata block; changes to supported forums belong in the `@match` lines at the top of `LINUXDO_ReadBoost.js`.

## Verification

- Use `node --check LINUXDO_ReadBoost.js` for the available local syntax check.
- Browser behavior must be validated manually in a userscript manager on a matched Discourse topic page; the script depends on userscript APIs (`GM_*`) and Discourse DOM/API details.

## Release / Publishing

- `scripts/sync-to-greasyfork.sh` is the release helper. It checks GPL metadata, optionally bumps `// @version`, then commits, tags, and pushes after interactive prompts.
- Do not run `scripts/sync-to-greasyfork.sh` unless the user explicitly asks for a release/publish flow; it performs git write operations and pushes to `origin main`.
- Keep `// @license      GPL-3.0`, `LICENSE`, and the userscript `@updateURL`/`@downloadURL` aligned because the release helper and GreasyFork sync depend on them.
- The release helper intentionally keeps the shipped filename `LINUXDO_ReadBoost.js`; do not rename it unless you are also migrating the update URLs and installed user base.

## Implementation Notes

- Persistent settings are stored with `GM_getValue`/`GM_setValue`; changing setting keys affects existing users' saved userscript data.
- Core read simulation posts form-encoded timings to `${window.location.origin}/topics/timings` with Discourse CSRF and session credentials. Preserve same-origin behavior unless intentionally changing supported sites.
- The current batching assumes post IDs are contiguous from `1..totalReplies`; the README notes deleted posts can prevent reaching 100% read completion.
- UI injection targets Discourse's `.header-buttons`, `.timeline-replies`, and `meta[name=csrf-token]`; these selectors are the main compatibility risk when Discourse changes.
- The settings UI should stay narrow and non-overlapping with Discourse's own header controls; prefer inline-flex wrappers and small gaps when adjusting header actions.
