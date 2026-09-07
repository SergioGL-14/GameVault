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

Together they provide the AppID, title, platforms, Metacritic score, localized description, release date, developers, publishers, genres, artwork, and screenshots. Imported cards use the conventional vertical library asset when it exists and fall back to Store artwork otherwise. Detail enrichment accepts named demos and mods already present in the owned library. A retired entry reported as `success: false` preserves its imported title and uses verified vertical or legacy header CDN artwork, preventing a terminal Store response from remaining pending indefinitely.

These store endpoints are practical, but they are not listed in the official Steamworks Web API reference as a supported third-party contract. They may change or apply undocumented rate limits. The client uses a ten-second timeout, produces provider-specific errors, and saves imported data locally so normal library browsing does not keep calling Steam.

Primary references:

- [Steam Store search response](https://store.steampowered.com/api/storesearch/?term=portal&l=spanish&cc=ES)
- [Steam Store app-detail response](https://store.steampowered.com/api/appdetails?appids=400&l=spanish&cc=ES)
- [Steamworks Web API overview](https://partner.steamgames.com/doc/webapi_overview)

### Steam account library

Account refresh is separate from catalog search. It uses these Steam Web API methods:

```text
GET https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/
GET https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/
GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/
```

The default connection opens Steam's official Store page in a persistent, isolated Electron partition. GameVault reads only the signed-in SteamID and temporary `webapi_token` exposed by that page, keeps the token in main-process memory, and re-derives it from the retained session before refresh. Password and Steam Guard input remain inside Steam's page. Navigation is restricted to Steam-owned HTTPS login hosts, browser permissions and popups are denied, and disconnect clears the partition's cookies, local storage, and cache.

This Playnite-inspired route sends the temporary token as `access_token`. Valve does not document the Store-page attributes, token, or this authentication route as a stable public contract, so it may break when Steam changes. The advanced fallback accepts a personal Web API key and SteamID64 or individual profile URL. GameVault sends that key only in the `x-webapi-key` header, encrypts it with Electron `safeStorage`, and never writes it to SQLite or returns either credential to the renderer.

The owned-library call runs only after the user selects **Refrescar ahora**. `GetOwnedGames` is the sole ownership source. GameVault saves that complete snapshot before sending each new or pending AppID through the same Store catalog adapter used by manual addition. Metadata completion also covers retained entries absent from a later ownership snapshot because their canonical game remains in the local library. Each successful merge atomically marks that provider entry complete, so later passes do not request it again unless a schema upgrade explicitly queues one corrective pass for every Steam ownership. Pending metadata resumes at application startup and after a Store `Retry-After` delay without refreshing ownership. Other failures remain pending for the next startup rather than entering an unbounded retry loop. When Store returns metadata whose embedded `steam_appid` differs from the requested AppID, GameVault treats it as an alias. If Store metadata would give distinct AppIDs the same visible title, GameVault retains the unique ownership title. Existing personal fields and local artwork are preserved. Playtime and unrelated fields are ignored. There is no scheduled, background, or realtime ownership synchronization.

The complete response is previewed before one SQLite transaction updates ownerships. Missing or malformed collections do not represent an empty library and never deactivate the previous snapshot. An existing Steam catalog AppID is an exact canonical match; title-only matches require confirmation. More contract detail and known Valve documentation gaps are recorded in [`steam-account-api-research.md`](steam-account-api-research.md).

### Steam achievements

Achievement synchronization is a separate explicit action after library import. With a personal API key, GameVault uses the documented `GetSchemaForGame/v2` and `GetPlayerAchievements/v1` methods. With Web login, it uses keyless `IPlayerService/GetGameAchievements/v1` definitions and loads the connected account's Community achievement page through the isolated Steam partition. The Web route maps colored and gray icon filenames back to each definition's stable internal ID; it never sends the Store token to `ISteamUserStats`.

The Web definition method and Community HTML are undocumented contracts. A missing, malformed, duplicate, or incomplete per-game response is rejected before SQLite changes that game's retained snapshot. Other games continue sequentially unless authentication expires or Steam rate-limits the operation. Manual achievement overrides remain effective after later imports and can be cleared to return to Steam's state.

## RAWG

RAWG has wider catalog coverage and is useful for games that do not have a Steam store page. It requires a key on every request.

Shipping one shared key inside Electron would expose it to every user, so the current implementation uses a personal key instead. The main process validates the key, encrypts it with Electron `safeStorage`, and keeps it out of the renderer and SQLite database. Linux's insecure `basic_text` fallback is rejected; those systems can still use `RAWG_API_KEY`. Removing the key deletes the encrypted file.

`RAWG_API_KEY` can supply the credential for development and takes precedence over the encrypted file. Environment credentials cannot be changed from the renderer. If RAWG rejects one, update or remove the variable and restart GameVault.

RAWG requires linked attribution wherever its data or images appear. Its published free tier is aimed at non-commercial projects and has a monthly request limit. The applicable plan needs to be confirmed with RAWG before a public release relies on it.

Primary references:

- [RAWG API](https://rawg.io/apidocs)
- [RAWG API terms](https://rawg.io/tos_api)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)

## Failure behavior

Steam and RAWG adapters map network and provider failures into the same catalog contract. The renderer receives only the provider and one of these categories:

- Invalid input
- Offline or unreachable provider
- Ten-second timeout
- Authentication failure
- Temporary rate limit
- Invalid or unsuccessful provider response

The add-game dialog presents category-specific Spanish guidance and keeps the current query available for an explicit retry. Steam authentication failures require reconnecting its web session or replacing its advanced key. RAWG authentication failures offer actions to replace or remove keys stored by GameVault, or direct environment-key users to `RAWG_API_KEY`. Steam Store metadata retries a rate-limited AppID up to ten times, honoring `Retry-After` or using a 2.5-second fallback when Steam omits it. Exhausted metadata work remains pending for a later automatic pass; other catalog operations do not retry automatically.

Catalog access is optional. A failed request does not change SQLite data or prevent browsing, editing, or manually extending the local library. Previously imported text metadata remains available offline; remote artwork still requires a connection.

## Later

If GameVault grows beyond a local desktop project, the clean next step is a small proxy owned by the project:

```text
GameVault Desktop -> GameVault API -> external providers
```

That service would keep shared credentials on a server, cache provider responses, and enforce request limits. It is intentionally not part of the MVP while Steam plus manual entries cover normal use.
