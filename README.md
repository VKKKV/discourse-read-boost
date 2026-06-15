# Discourse Read Boost

[![GPLv3 License](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Discourse Read Boost is a Tampermonkey / Violentmonkey userscript for Discourse topic pages. It submits configurable reading-time batches to help fill topic read progress.

The shipped userscript is `discourse-read-boost.user.js`, using the standard `.user.js` filename expected by Tampermonkey and Violentmonkey.

## Features

- Manual start, auto start, and stop while running.
- Configurable delay, batch size, and simulated reading time.
- Same-origin requests to Discourse's `/topics/timings` endpoint.
- Tactical HUD settings modal with compact header telemetry.
- Compact header controls to avoid overlapping Discourse buttons.

## Risk Notice

Using third-party userscripts may violate site rules and can lead to account restrictions, bans, data loss, or script breakage. Review the source before installing and use it at your own risk.

This script does not try to bypass forum detection mechanisms and does not guarantee long-term compatibility with any Discourse site.

## Install

1. Install Tampermonkey or Violentmonkey.
2. Install `discourse-read-boost.user.js` from `https://raw.githubusercontent.com/VKKKV/discourse-read-boost/main/discourse-read-boost.user.js`.
3. Open a supported Discourse topic page.
4. On first run, read the warning and type `明白` to continue.
5. Use the `ReadBoost` status and `设置` button in the page header.

Start manually with default settings first. Enable auto start only after confirming the target site works as expected.

## Supported Sites

The userscript currently matches topic pages on:

- `linux.do`
- `nodeloc.com`
- `www.nodeloc.com`
- `idcflare.com`
- `meta.discourse.org`

To support another Discourse forum, add a matching `@match` line at the top of `discourse-read-boost.user.js`.

## Settings

| Setting            | Description                                 | Default | Suggested range |
| ------------------ | ------------------------------------------- | ------- | --------------- |
| 基础延迟           | Base delay between batches, in ms           | 2000    | 500-10000       |
| 随机延迟范围       | Random extra delay, in ms                   | 300     | 0-3000          |
| 最小每次请求阅读量 | Minimum posts per batch                     | 8       | 1-50            |
| 最大每次请求阅读量 | Maximum posts per batch                     | 20      | 1-100           |
| 最小阅读时间       | Minimum simulated read time per post, in ms | 800     | 100-10000       |
| 最大阅读时间       | Maximum simulated read time per post, in ms | 3000    | 100-30000       |

Keep the defaults unless you have a specific reason to change them. If you need faster completion, prefer a small batch-size increase over aggressively reducing delays.

## Known Limits

- Post IDs are still generated as `1..totalReplies`. Deleted, hidden, or otherwise non-contiguous posts may prevent stable 100% completion.
- Only topic pages are supported. Batch processing from topic lists is not implemented.
- The script depends on Discourse DOM selectors, `meta[name=csrf-token]`, session cookies, and `/topics/timings` behavior.
- Browser privacy settings, userscript manager behavior, or forum security changes can break runtime behavior.

## Development

This repository has no package manager, build step, linter, or test suite. Edit `discourse-read-boost.user.js` directly.

Run the available syntax check after changes:

```bash
node --check discourse-read-boost.user.js
```

Runtime behavior must be verified manually in a userscript manager on a supported Discourse topic page.

The `scripts/` directory contains release helpers. It is not required for normal development or browser testing.

## Notes

- `Discourse Read Boost` is now published as a standalone userscript under `discourse-read-boost.user.js`.
- Existing installs from the previous URL should install the new `.user.js` file manually once.
- The current UI focuses on keeping ReadBoost controls from overlapping Discourse header buttons.

## License

Licensed under [GNU General Public License v3.0](LICENSE).
