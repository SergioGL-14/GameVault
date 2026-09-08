# Changelog

## Unreleased

### Added

- Steam catalog search and localized game details without an API key.
- Optional RAWG search with an encrypted personal API key.
- Manual game entries for titles missing from both catalogs.
- Individual game pages with artwork, screenshots, metadata, and personal progress.
- Editable profile background, avatar, location, bio, and featured games.
- SQLite migrations that preserve data from earlier MVP builds.
- Tests for the repository, catalog providers, credential storage, and database migration.
- Contract tests for the preload and IPC boundaries plus renderer tests for adding, editing, and deleting games.
- Manually managed game achievements with persisted unlock state, per-game progress, and aggregate profile totals.
- Durable local PNG, JPEG, GIF, and WebP images for game covers, profile avatars, and profile backgrounds.
- General settings and a Playnite-inspired Steam integration with isolated web login, advanced personal-key fallback, and explicit library preview and refresh.
- Separate manual Steam achievement import with retained provider evidence and manual override precedence.
- Visible and cancelable Steam metadata enrichment with durable managed cover and background downloads.

### Changed

- Reworked the library into a dense cover wall with search and status filters.
- Rebuilt the profile around a wide identity header, collection summary, showcases, and real library statistics.
- Increased the default window to 1440 × 900 with a 980 × 680 minimum.
- Separated the library and catalog models from Electron, SQLite, provider, and React adapters.
- Restricted the preload bridge to GameVault operations instead of exposing generic Electron helpers.
- Updated Electron to version 44 to incorporate current security fixes.
- Added continuous integration for linting, type checking, tests, and production builds.
- Added grouped Dependabot updates and required CI protection for `main`.
- Added a local roadmap mirror and repository-level guidance for architecture, security, testing, documentation, and protected Git workflows.
- Validated renderer-supplied IPC data before using library, profile, credential, or catalog dependencies.
- Kept failed game deletions open with a visible error instead of leaving an unhandled rejection.
- Aligned Node.js type declarations with the supported Node.js 24 runtime.
- Updated TypeScript to version 6 and removed the deprecated `baseUrl` compiler option.
- Added provider-neutral catalog failures with actionable offline, timeout, retry, and RAWG credential recovery states.
- Made core navigation, filters, game views, forms, errors, and dialogs keyboard and screen-reader accessible.
- Hardened Electron navigation, renderer sandboxing, RAWG credential storage, IPC input limits, and startup failure handling.
- Made SQLite upgrades transactional and versioned, with strict corruption reporting and preserved foreign keys.
- Kept successful game changes visible when a secondary refresh fails and removed the hidden six-game showcase limit.
- Added reproducible LF formatting checks and unpacked application verification across supported build platforms.
- Kept local image paths behind a narrow native picker and served managed copies through an opaque application protocol.
- Separated canonical games from Steam ownership and kept account refresh manual, transactional, and idempotent.
- Simplified primary navigation around the local profile, library, and a compact Settings action.
- Saved Steam ownership before a separately retryable game-by-game metadata pass, preserving personal edits and local artwork.
- Preferred verified vertical Steam artwork with Store artwork as a fallback, and stopped metadata or achievement fan-out after rate-limit and authentication failures.
- Added a return-to-Steam-state action for manually overridden achievements and refreshed profile totals after achievement imports.
- Preserved Steam-reported unlock dates through the achievement-evidence schema upgrade.
- Made Steam metadata enrichment resumable for active and retained AppIDs, skipping completed entries on later passes and automatically retrying pending entries after startup or a provider rate limit, including Store `429` responses without `Retry-After`.
- Enriched imported Steam demos and mods, and retained verified CDN artwork for delisted applications whose Store detail envelope is unavailable.
- Reconciled duplicate additions by catalog identity or normalized title, filling only missing metadata while preserving personal data and existing artwork.
- Added an explicit per-game metadata refresh for catalog-backed library entries.
- Requeued Steam metadata once after upgrade and preserved unique ownership titles when Store aliases or collapsed names would create false duplicates, repairing entries such as the F.E.A.R. expansions automatically.
- Defined usable Steam cards by title, description, and managed cover; incomplete cards remain pending and resume without repeating ownership import.
- Preserved explicit catalog-field edits during automatic and per-game metadata refreshes, including edits saved while background enrichment is active.
- Stopped Steam metadata fan-out on rate limits, authentication, offline, and timeout failures while keeping local persistence failures distinct.
