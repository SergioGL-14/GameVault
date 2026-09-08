# Next Improvements

This document records the rationale and boundaries for the next Steam and managed-storage deliveries. GitHub issues own their acceptance criteria and completion state; `ROADMAP.md` owns delivery order.

## Steam playtime and activity

Tracked by [#42](https://github.com/SergioGL-14/GameVault/issues/42).

Steam metadata reliability was delivered separately because playtime and activity require new domain rules rather than another Store-field mapping. GameVault currently has one editable playtime total, while Steam provides provider evidence that may change after every session.

The next delivery keeps one visible total across ownership providers. Imported Steam playtime updates that total until the user edits it manually; a manual value remains authoritative afterward. Last activity, application type, supported features, language capabilities, age information, and content descriptors are added in the same focused schema expansion. Known non-game application types may be hidden without deleting their canonical records or ownership history, while unknown types remain visible.

This work does not add separate per-platform totals, IGDB, social activity, friends, reviews, purchasing, or a statistics dashboard.

## Managed-image cleanup

Tracked by [#45](https://github.com/SergioGL-14/GameVault/issues/45).

Managed images can outlive a cancelled edit, replacement, metadata refresh, or deleted record. Immediate deletion is unsafe because one file may be referenced by several fields or records and an import may still be publishing it.

Automatic cleanup must take a complete snapshot of managed references in SQLite and remove only strict managed-image files with no references. Game covers, game backgrounds, profile avatars, and profile backgrounds all participate in the reference set. Active imports and recent temporary files require protection. Files outside the managed directory, malformed names, remote URLs, and directories are never cleanup candidates.

Cleanup should run at a safe application lifecycle point, remain bounded, and report filesystem failures without blocking startup or changing database references. Content-hash deduplication and configurable cache quotas remain separate concerns.

## Scheduled Steam ownership refresh

Tracked by [#44](https://github.com/SergioGL-14/GameVault/issues/44).

Ownership synchronization calls `GetOwnedGames` and can activate or retire ownership records. It is different from startup metadata resumption, which only completes AppIDs from an ownership snapshot the user already confirmed and never asks Steam for a new library.

The current manual flow remains the default because ownership changes may contain ambiguous matches, private-profile failures, unexpectedly empty responses, expired authentication, or rate limits. A later scheduled flow must therefore be explicitly enabled, run only while GameVault is open, reuse complete-snapshot validation, and queue ambiguity for user review instead of applying it silently.

Scheduled ownership work must not overlap manual refresh, metadata enrichment, or account mutation. It needs conservative backoff and visible last-attempt, last-success, pending-review, and failure states. It does not imply background execution while GameVault is closed, realtime Steam events, scheduled achievement refresh, multiple accounts, cloud notifications, or a backend scheduler.

## Delivery order

1. Merge and close #43 after review and required CI.
2. Deliver Steam playtime, activity, and store-record expansion in #42.
3. Add safe automatic managed-image cleanup in #45.
4. Keep opt-in scheduled ownership refresh in #44 as a later delivery until automatic ownership changes are a demonstrated need.
