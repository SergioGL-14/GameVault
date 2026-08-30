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
- **Steam search by default**. It needs no setup and imports localized store information, artwork, and screenshots.
- **Optional RAWG search** for games that are missing from Steam. RAWG requires the user's own API key.
- **Manual entries** when neither catalog has the right game.
- **Local SQLite storage**. There is no account, cloud service, or remote library database.

## Adding a game

Open **Library → Add game** and choose one of the three sources:

1. **Steam** — the normal path. Search by title and select the matching game.
2. **RAWG** — optional fallback for games outside Steam. The key is checked before it is saved and encrypted with Electron `safeStorage`.
3. **Manual entry** — title, cover URL, and description without any external provider.

Imported metadata is copied into the local database, so titles, descriptions, and personal progress remain available offline. Artwork still uses the provider's remote URLs and needs a network connection.

Steam's store search and app-detail endpoints currently work without authentication, but they are not documented as a stable third-party API contract. That is an accepted limitation for this MVP. The provider boundary is deliberately small so it can be replaced by a GameVault API later without changing the library model.

More detail about both providers is in [`docs/catalog-api.md`](docs/catalog-api.md).

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

The SQLite database is created in Electron's `userData` directory. It is not stored inside the repository.

## Checks

GitHub Actions runs the same checks on every pull request and every push to `main`.

```bash
npm run lint
npm run typecheck
npm test
```

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

## Current limits

- Achievements are not implemented yet.
- Store-account imports (Steam library, Epic, itch.io, and others) are not implemented; games are added one at a time.
- Covers can be replaced by URL, but there is no local image picker yet.
- RAWG remains a bring-your-own-key option until the project has its own backend.
- The current UI has one Spanish localization rather than a full translation system.

Those are deliberate boundaries for now. The next useful work is improving the personal profile and building the achievement model, not adding infrastructure the desktop MVP does not need.
