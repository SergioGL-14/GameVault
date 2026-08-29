# Catalog providers

GameVault currently has three ways to create a game entry:

1. Steam, used by default and requiring no setup.
2. RAWG, available as an optional fallback with a personal API key.
3. A completely manual entry.

Both remote providers are converted into the same `CatalogGameDetail` shape before anything reaches SQLite. The rest of the application does not know whether a title came from Steam, RAWG, or a future GameVault service.

## Steam

The desktop app currently calls two public Steam Store endpoints:

```text
GET https://store.steampowered.com/api/storesearch/?term=portal&l=spanish&cc=ES
GET https://store.steampowered.com/api/appdetails?appids=400&l=spanish&cc=ES
```

Together they provide the AppID, title, platforms, Metacritic score, localized description, release date, developers, publishers, genres, artwork, and screenshots. GameVault also tries Steam's vertical library capsule and falls back to the background artwork when it is unavailable.

These store endpoints are practical, but they are not listed in the official Steamworks Web API reference as a supported third-party contract. They may change or apply undocumented rate limits. The client uses a ten-second timeout, produces provider-specific errors, and saves imported data locally so normal library browsing does not keep calling Steam.

Primary references:

- [Steam Store search response](https://store.steampowered.com/api/storesearch/?term=portal&l=spanish&cc=ES)
- [Steam Store app-detail response](https://store.steampowered.com/api/appdetails?appids=400&l=spanish&cc=ES)
- [Steamworks Web API overview](https://partner.steamgames.com/doc/webapi_overview)

## RAWG

RAWG has wider catalog coverage and is useful for games that do not have a Steam store page. It requires a key on every request.

Shipping one shared key inside Electron would expose it to every user, so the current implementation uses a personal key instead. The main process validates the key, encrypts it with Electron `safeStorage`, and keeps it out of the renderer and SQLite database. Removing the key deletes the encrypted file.

RAWG requires linked attribution wherever its data or images appear. Its published free tier is aimed at non-commercial projects and has a monthly request limit. The applicable plan needs to be confirmed with RAWG before a public release relies on it.

Primary references:

- [RAWG API](https://rawg.io/apidocs)
- [RAWG API terms](https://rawg.io/tos_api)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)

## Later

If GameVault grows beyond a local desktop project, the clean next step is a small proxy owned by the project:

```text
GameVault Desktop -> GameVault API -> external providers
```

That service would keep shared credentials on a server, cache provider responses, and enforce request limits. It is intentionally not part of the MVP while Steam plus manual entries cover normal use.
