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
