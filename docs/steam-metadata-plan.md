# Steam Metadata Reliability Plan

Tracked by [#43](https://github.com/SergioGL-14/GameVault/issues/43). The later game-card expansion is tracked separately by [#42](https://github.com/SergioGL-14/GameVault/issues/42).

## Goal

Importing or refreshing a Steam library produces usable game cards automatically. New and retained incomplete cards are enriched by AppID, progress is visible, completed work survives cancellation or restart, and user edits are never replaced.

## Confirmed failure

The database inspected on 2026-09-08 contained 363 Steam ownerships and no pending metadata rows, but eight rows marked as refreshed had no description or screenshots. The completion marker currently records that a Store response was processed, not that the resulting card is usable.

## Usable card contract

A Steam card is usable when it has:

- a non-empty title;
- a non-empty description; and
- a cover reference that was successfully imported into managed local storage.

Screenshots, background artwork, release information, companies, genres, platforms, website, and scores improve the card but do not keep it pending when Steam does not publish them. A background is downloaded when available but is not part of the completion gate.

## User flow

1. The user requests a Steam library refresh from Settings.
2. GameVault previews and saves the complete ownership snapshot before metadata work starts.
3. GameVault processes every new or incomplete retained Steam card sequentially by AppID.
4. Settings shows the current game, completed count, total count, failures, and remaining work.
5. The user can cancel. Completed cards remain saved and incomplete cards remain pending.
6. Opening GameVault resumes metadata work already made pending by a user-requested import. It does not refresh account ownership.
7. A later Steam library refresh retries any card that remains incomplete.
8. The individual game form can force a metadata refresh without replacing user-edited fields.

No separate repair command or repair screen is added.

## Metadata selection

- Request Steam Store details by the exact AppID.
- Select description from `short_description`, then `detailed_description`, then `about_the_game`.
- Parse optional fields independently so one malformed optional value does not discard valid core metadata.
- Treat `success: false` and a response without the usable-card fields as incomplete, not successfully refreshed.
- Keep the ownership title for aliases or unavailable Store entries.
- Keep unknown application types visible. Known non-game classification is deferred to #42.

## Images

- Download the selected cover and background through the existing managed-image module.
- Accept only supported image formats within the existing per-file size limit.
- Use a timeout, a temporary file, and atomic publication.
- Preserve a user-selected managed image on every provider refresh.
- Keep screenshots remote during this delivery.
- Do not add a global cache quota or automatic cleanup until shared-reference cleanup is implemented safely.

## Manual precedence

The current game row does not identify which catalog fields were edited by the user. This delivery must record explicit user overrides for catalog-managed fields. A normal metadata pass fills or refreshes provider-managed fields and skips overridden fields. Clearing or changing an override is only caused by an explicit user edit, never by provider data.

Personal status, rating, notes, showcased state, completion date, achievements, and other personal values remain outside catalog replacement.

## Progress and cancellation

- Keep one active Steam metadata operation in the main process.
- Emit typed progress for each completed game through the existing Electron seam.
- Use an abort signal for the current request and image download.
- Cancellation stops before the next game and leaves unfinished rows pending.
- Stop fan-out on authentication, rate-limit, offline, or timeout failures.
- Report persistence failures separately and abort instead of presenting them as Steam failures.

The database already persists pending work through `metadata_refreshed_at IS NULL`; no job table is required.

## Delivery tasks

- [x] Add regression coverage for sparse Store responses being marked complete.
- [x] Add description fallback and field-level defensive normalization.
- [x] Define the metadata-completeness rule in the library module.
- [x] Add an additive migration for field override state and requeue incomplete Steam cards.
- [x] Download cover and background artwork into managed storage.
- [x] Apply provider metadata while preserving user overrides and personal data.
- [x] Make provider networking and persistence failures distinguishable.
- [x] Add typed progress and cancellation across main, preload, and renderer.
- [x] Resume pending enrichment without repeating ownership import.
- [x] Show accessible progress and a final failure summary.
- [x] Verify fresh and upgraded databases, cancellation, restart, offline, timeout, and rate-limit behavior.
- [x] Update operational documentation and the changelog after behavior exists.

## Deferred expansion

Issue #42 adds Steam playtime and last activity, features, language capabilities, age information, and known non-game hiding. User-edited playtime remains authoritative and the visible value remains one total across platforms.

IGDB, RAWG changes, a backend, another platform, local screenshots, configurable metadata sources, and automatic image cleanup are outside #43.
