# Library and Achievement Plan

This plan breaks external account imports and aggregated achievements into independently deliverable changes. GitHub issues own acceptance criteria and completion state.

## Planned vocabulary

- **Canonical game:** the single GameVault entry for a game, independent of ownership providers.
- **Provider ownership:** an external account's association with a canonical game.
- **Canonical achievement:** one achievement shown by GameVault, potentially mapped to several provider achievements.
- **Provider evidence:** the last successfully reported unlock state from a provider.
- **Manual override:** an explicit completed or pending decision that wins over provider evidence.
- **Effective achievement state:** the manual override when present, otherwise completion evidence from any provider.

## Product rules

- GameVault stores one canonical game regardless of how many providers report ownership.
- External accounts update only through an explicit **Refresh now** action in Settings.
- Owned-game refreshes apply one complete account snapshot atomically. Achievement refreshes apply complete snapshots per game so one unsupported title does not discard valid updates for every other game.
- Provider data never deletes canonical games, custom achievements, notes, ratings, images, or other personal data.
- Disconnecting an account removes its credentials but retains the last successful ownership and achievement evidence until the user explicitly removes imported data in a future supported flow.
- GameVault retrieves only data required by the active delivery.
- Manual achievement decisions always take precedence over provider evidence.
- Achievement provider origins remain internal and are not displayed in the normal achievement list.

## Delivery 1: Settings and Steam library

Tracked by [#4](https://github.com/SergioGL-14/GameVault/issues/4).

- [ ] Verify and document the supported Steam identity, authentication, privacy, and owned-games contracts.
- [ ] Add Settings with General profile fields and Connections.
- [ ] Model canonical games separately from Steam ownerships.
- [ ] Migrate existing manual, Steam-catalog, and RAWG-catalog games without data loss.
- [ ] Use an isolated Steam web session as the default connection, never expose its cookies or temporary token to the renderer, and clear it on disconnect. Retain a personal Web API key as an advanced fallback, encrypted by the operating system and never stored in SQLite. Environment keys are not supported for Steam.
- [ ] Preview exact ownership matches, new games, ambiguous canonical matches, and failures.
- [ ] Require every visible owned game to map to an existing canonical game or create a new one; ambiguity may require confirmation but never silently skips the game.
- [ ] Apply a confirmed owned-games snapshot transactionally and idempotently.
- [ ] Mark absent Steam ownerships inactive only after a complete successful refresh.
- [ ] Show game ownership platforms without creating duplicate cards.
- [ ] Cover provider parsing, matching, migration, persistence, IPC, and renderer behavior with tests.

This delivery imports account identity, owned-game identifiers, ownership state, and basic metadata needed for usable game cards. It excludes achievements, playtime, friends, activity, reviews, and social data.

## Delivery 2: Steam achievements and manual precedence

Tracked by [#35](https://github.com/SergioGL-14/GameVault/issues/35).

- [ ] Verify and document Steam's game schema and player achievement contracts.
- [ ] Separate canonical achievements from provider identities and unlock evidence.
- [ ] Preserve existing custom achievements and unlock state during migration.
- [ ] Import achievement definitions and player unlock evidence through **Refresh now**.
- [ ] Reconcile repeated snapshots without duplicate achievements.
- [ ] Let users force completed, force pending, or return to synchronized state.
- [ ] Calculate game and profile totals from effective achievement state.
- [ ] Keep the previous snapshot when any required game response is incomplete.
- [ ] Retain last-known evidence and effective totals when Steam is disconnected, then update it after reconnection and a successful refresh.
- [ ] Cover reconciliation, overrides, completion derivation, migration, and UI behavior with tests.

Steam does not provide a universal game-completion flag. GameVault may derive completion only when a game has at least one known achievement and every effective achievement is completed. Games without known achievements retain manual status.

## Delivery 3: A second provider

Tracked by [#37](https://github.com/SergioGL-14/GameVault/issues/37).

- [ ] Select a provider only after reviewing its supported account, library, and achievement contracts.
- [ ] Reuse the integration seam, manual refresh, and canonical ownership rules. Extract a generic installable-plugin runtime only when a second real integration proves its required interface.
- [ ] Attach another ownership to existing games rather than creating duplicate cards.
- [ ] Merge equivalent achievements and request confirmation for ambiguous matches.
- [ ] Add provider-exclusive achievements to the canonical list.
- [ ] Prove that manual overrides win over evidence from every provider.
- [ ] Keep game completion governed by #35 rather than accepting incomparable provider-level completion flags.

## Delivery 4: GameVault achievement packs

Tracked by [#36](https://github.com/SergioGL-14/GameVault/issues/36).

- [ ] Define the initial pack source and matching contract before implementation.
- [ ] Preview and install packs only with explicit user confirmation.
- [ ] Offer packs only when no provider-backed achievements are currently known for the canonical game.
- [ ] Keep installation idempotent and preserve custom and provider achievements.
- [ ] Let pack achievements participate in the same manual completion and totals model.
- [ ] Keep an installed pack if official achievements are discovered later and reconcile exact duplicates while preserving provider mappings and manual state.
- [ ] Support removal without deleting unrelated achievements.
- [ ] Remove only pack provenance from a reconciled achievement; keep the canonical achievement while another provenance or mapping remains.

A hosted catalog, community publishing, moderation, and automatic installation remain deferred until there is evidence they are needed.
