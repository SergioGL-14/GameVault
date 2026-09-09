# Delivery Status

Updated 2026-09-09.

## Active delivery

[Issue #42](https://github.com/SergioGL-14/GameVault/issues/42), Steam playtime, activity, and store-record expansion, is the next product delivery. Its current scope preserves one visible playtime total, keeps manual playtime authoritative, and retains hidden non-game ownership evidence. Implementation has not started.

## Latest completed delivery

[Issue #43](https://github.com/SergioGL-14/GameVault/issues/43), Steam metadata reliability and progress, was merged in [PR #46](https://github.com/SergioGL-14/GameVault/pull/46) on 2026-09-09. Product decisions, behavior, and verification are recorded in [`steam-metadata-plan.md`](steam-metadata-plan.md).

## Evidence

- The GameVault worktree was clean before planning started.
- The local database had 363 Steam ownerships, zero pending metadata rows, and eight rows marked complete without descriptions or screenshots.
- Schema version 8 records explicit catalog-field overrides and requeues incomplete cards plus provider-managed remote Steam artwork without losing legacy local covers.
- Playnite core and built-in extensions were reviewed locally. The useful patterns are sequential enrichment, field-level validity, local media import, progress, and cancellation. Its plugin runtime and remote IGDB integration are outside the current scope.
- Baseline lint, type checking, 333 tests, production build, and production dependency audit passed before implementation.
- Final lint, type checking, 360 tests, production build, unpacked Windows packaging, and the packaged Windows smoke test passed on 2026-09-08.
- Required GitHub checks and both packaging jobs passed before PR #46 was merged.
- Regression coverage includes sparse Store responses, description fallback, malformed optional fields, remote-image validation and limits, migration from schema version 7, override precedence, cancellation, restart state, offline, timeout, rate-limit, persistence failure, account changes during enrichment, and editor saves during background enrichment.

## Next checkpoint

Reconfirm issue #42 against the current Steam contracts before implementation. Issue #45 follows with safe managed-image cleanup, and optional scheduled ownership refresh remains a later opt-in delivery in issue #44.
