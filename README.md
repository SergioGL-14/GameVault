# GameVault

[![CI](https://github.com/SergioGL-14/GameVault/actions/workflows/ci.yml/badge.svg)](https://github.com/SergioGL-14/GameVault/actions/workflows/ci.yml)

**A personal desktop game library with a profile that actually feels personal.**

GameVault is where I keep track of the games I own, what I am currently playing, what I have finished, and the titles I still want to get to. It borrows the visual language of Steam profiles and cover walls, but the library itself belongs to the user and stays on the local machine.

The application is still an early MVP. The interface is currently in Spanish because that is the language I use it in; the repository documentation is kept in English.

---

## What works today

- **Personal profile** with avatar, background, bio, location, level, library summary, featured games, recent completions, current games, and most common genres.
- **Cover-based library** with text search and status filters.
- **A proper page for every game** with artwork, description, screenshots, release information, developer/publisher details, personal notes, score, playtime, and completion state.
- **Manually managed achievements** on each game page, with unlock progress and aggregate profile totals stored locally.
- **Steam search by default**. It needs no setup and imports localized store information, artwork, and screenshots.
- **Optional RAWG search** for games that are missing from Steam. RAWG requires the user's own API key.
- **Manual entries** when neither catalog has the right game.
- **Manual Steam library refresh** from Settings, with a simple Steam web login, an advanced personal-key fallback, one canonical card per game, and retained ownership history.
- **Durable local artwork** selected from disk for game covers, profile avatars, and profile backgrounds.
- **Local SQLite storage**. There is no account, cloud service, or remote library database.

## Adding a game

Open **Library → Add game** and choose one of the three sources:

1. **Steam** — the normal path. Search by title and select the matching game.
2. **RAWG** — optional fallback for games outside Steam. The key is checked before it is saved and encrypted with Electron `safeStorage`. Linux systems without a secure credential backend must use `RAWG_API_KEY` instead of saving the key.
3. **Manual entry** — title, optional cover URL or local image, and description without any external provider.

Imported metadata is copied into the local database, so titles, descriptions, and personal progress remain available offline. Steam covers and backgrounds are also downloaded into GameVault's managed `userData/images` directory; screenshots and RAWG artwork remain remote. Covers, avatars, and profile backgrounds selected from disk use the same managed storage and remain available if the original file moves or is deleted. PNG, JPEG, GIF, and WebP files up to 10 MiB are supported.

Adding a title already in the library reuses its existing card. GameVault first matches the exact catalog provider and ID, then falls back to the normalized title for manual entries. Only missing catalog metadata is filled; status, playtime, score, notes, featured state, achievements, and existing artwork are preserved. Catalog-backed games also provide **Actualizar metadatos** in their edit form for an explicit refresh using the saved provider identity.

Catalog failures do not block the local library. The add-game dialog distinguishes connection, timeout, authentication, rate-limit, invalid-input, and provider-response failures, keeps manual entry available, and lets searches be retried explicitly. Rejected RAWG credentials saved by GameVault can be replaced or removed from the same dialog. If `RAWG_API_KEY` supplies the credential, update or remove the environment variable and restart GameVault instead.

Steam's store search and app-detail endpoints currently work without authentication, but they are not documented as a stable third-party API contract. Retired Store entries retain their imported title and use verified Steam CDN artwork when available; imported demos and mods are enriched like games. That is an accepted limitation for this MVP. The provider boundary is deliberately small so it can be replaced by a GameVault API later without changing the library model.

More detail about both providers is in [`docs/catalog-api.md`](docs/catalog-api.md).

## Settings and Steam library

Open the gear-shaped **Settings** action and use the Steam integration. The normal path opens Steam's own sign-in page in an isolated Electron browser session. Password and Steam Guard input remain inside Steam's page; GameVault retains the local browser session but does not receive or store the password. A personal Web API key plus SteamID64 or profile URL remains available as an advanced fallback and is encrypted with Electron `safeStorage`.

GameVault accesses the owned-games library only when **Refresh now** is selected. It shows a preview before writing, creates every new visible game, and requires confirmation before associating a title with an existing manual or catalog entry. The ownership snapshot is saved first; metadata is then completed sequentially through the existing Steam catalog using each AppID, including retained games no longer present in the latest ownership snapshot. Global progress shows the current game and remaining work and can be cancelled safely. A card is complete only when its merged metadata has a title, description, and managed local cover. Pending entries resume at startup and after Steam's requested rate-limit delay without repeating ownership import; other temporary failures remain pending for the next application start. Steam Store aliases and Store titles that would collapse distinct AppIDs retain the unique title reported by ownership. Repeated refreshes update ownership without duplicating cards or replacing explicit catalog-field edits, personal data, or local artwork. Disconnecting clears the isolated Steam session or saved key while preserving imported games and ownership history.

After the library has been refreshed, **Import achievements** runs a separate per-game synchronization. Web login combines Steam's public achievement definitions with the connected account's Community pages; the personal-key fallback uses Steam's documented achievement APIs. A failed game preserves its previous achievement snapshot, and manual completed or pending overrides continue to win over imported state.

Steam account refresh does not retrieve playtime, friends, activity, reviews, or social data.

## Accessibility

Core navigation, library filters, game cards, forms, and dialogs support keyboard operation and expose their state to assistive technology. Modal dialogs contain focus, close with Escape, and return focus to their opener. Errors and asynchronous result updates use live announcements instead of relying on color alone.

The repeatable keyboard and screen-reader smoke test is documented in [`docs/accessibility-checklist.md`](docs/accessibility-checklist.md).

## Run it locally

Requirements:

- Node.js 24 or later
- npm 11 or later

```bash
git clone https://github.com/SergioGL-14/GameVault.git
cd GameVault
npm install
npm run dev
```

The SQLite database and managed local image copies are created in Electron's `userData` directory. They are not stored inside the repository.

## Checks

GitHub Actions runs the same checks on every pull request and every push to `main`.
Dependency updates and the protected-branch recovery procedure are documented in [`docs/repository-maintenance.md`](docs/repository-maintenance.md).

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

CI also creates unpacked builds on Windows, macOS, and Linux, and smoke-tests the packaged Windows application.

Build a Windows installer with:

```bash
npm run build:win
```

## Project layout

```text
src/
|- library/    Framework-free library model and input validation
|- catalog/    Provider-neutral catalog model and contract
|- main/       Electron IPC plus SQLite, Steam, and RAWG adapters
|- preload/    Narrow GameVault API exposed through contextBridge
|- renderer/   React features grouped by library, profile, and catalog
`- desktop-api.ts  Contract shared by Electron and the renderer
```

The library model has no Electron, React, database, or provider dependencies. The renderer never talks to SQLite or external catalogs directly; Steam and RAWG responses are normalized in main-process adapters before they enter the library.

Planned deliveries are tracked in [`ROADMAP.md`](ROADMAP.md) and mirrored in [GitHub issue #11](https://github.com/SergioGL-14/GameVault/issues/11).

The product boundaries and current delivery detail are documented in [`docs/product-concept.md`](docs/product-concept.md), [`CONTEXT.md`](CONTEXT.md), and [`docs/delivery-status.md`](docs/delivery-status.md).

## Current limits

- Steam achievement synchronization is manual and does not import rarity data.
- Steam library import is manual and supports one connected account. An optional scheduled ownership refresh is tracked in [#44](https://github.com/SergioGL-14/GameVault/issues/44); other account providers are not implemented.
- Steam playtime, last activity, store capabilities, languages, age information, and application-type filtering are tracked in [#42](https://github.com/SergioGL-14/GameVault/issues/42).
- One canonical game currently accepts one Steam AppID. Support for merging editions or several provider identities is deferred until a second real provider requires it.
- Steam web login follows Playnite's practical approach and depends on Store-page session data that Valve does not document as a stable third-party contract. The personal API-key route remains available if that flow changes.
- Local image copies are retained when an edit is cancelled or an image is replaced or removed. Reference-aware automatic cleanup is tracked in [#45](https://github.com/SergioGL-14/GameVault/issues/45).
- RAWG remains a bring-your-own-key option until the project has its own backend.
- The current UI has one Spanish localization rather than a full translation system.

Those are deliberate boundaries for now. The next useful work is strengthening the local desktop experience, not adding infrastructure the MVP does not need.
