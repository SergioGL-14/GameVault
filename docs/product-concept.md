# Product Concept

## Purpose

GameVault is a simple local application for recording the games one person owns and their progress. The normal flow is: open GameVault, import a platform library, and see one complete card for each game with its ownership platforms and combined achievement progress.

GameVault is not a store, launcher, social network, recommendation system, or analytics product.

## Product rules

- Personal library, profile, progress, and achievement data remain on the user's device.
- One canonical game represents the same title across every ownership platform.
- Provider refreshes attach ownership and evidence to that canonical game instead of creating provider-specific copies.
- Metadata import should produce a useful card automatically. A normal user should not need to repair an import manually.
- Refreshing a platform library also retries incomplete metadata for games already retained locally.
- A forced metadata refresh remains available from an individual game form.
- User edits always take precedence over imported values, including title, description, artwork, playtime, and classification.
- Playtime is one user-facing total across all ownership platforms.
- Achievement progress combines provider evidence while preserving explicit manual decisions.
- A provider failure never removes a game, ownership record, personal edit, or previous complete metadata.
- External access occurs only for a user-requested import or for resuming metadata work started by that import.

## Current provider policy

Steam is the only account-library provider. Its AppID is the exact Steam identity and its Store data is the only automatic metadata source in the current plan.

IGDB and a shared GameVault backend are not part of the current delivery. They can be reconsidered only when Steam alone no longer meets the product need and the operational cost is accepted.

## Simplicity constraints

- Keep ownership import and metadata enrichment as two independently recoverable steps behind one user flow.
- Keep processing sequential unless measured performance proves bounded concurrency is necessary.
- Do not add a plugin runtime, configurable provider chains, scheduled account synchronization, or cloud library storage.
- Reuse the existing catalog, repository, managed-image, preload, and IPC seams.
- Add persisted state only when the current data cannot represent a required rule.
