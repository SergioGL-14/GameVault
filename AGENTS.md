# GameVault agent guide

This file defines the working rules for any automated or human contributor changing GameVault. It is intentionally stable. Current priorities and delivery status belong in GitHub issues, not in this file.

## Project intent

GameVault is a local-first Electron desktop application for maintaining a personal game library and profile. React renders the interface, SQLite stores personal data locally, and catalog providers supply optional metadata.

Preserve these product boundaries unless an approved issue explicitly changes them:

- Personal library and profile data remain on the user's machine.
- Steam is the default catalog and RAWG is an optional fallback.
- Manual entries remain available when a remote catalog is unsuitable.
- The renderer never accesses SQLite, the filesystem, credentials, or remote providers directly.
- A backend, cloud accounts, release automation, and store distribution are not implied by ordinary feature work.

The application UI is currently Spanish. Source code, code comments, documentation, commit messages, pull requests, and issues are written in professional English.

## Start every session here

Do not rely on a previous conversation or a stale handoff. Reconstruct the current state before proposing or editing anything.

1. Read `README.md`, `CHANGELOG.md`, `ROADMAP.md`, and the relevant files under `docs/`.
2. Run `git status --short --branch` and inspect recent commits with `git log --oneline -10`.
3. Inspect open pull requests with `gh pr list --state open`.
4. Compare `ROADMAP.md` with `gh issue view 11` when the user asks to continue roadmap work or choose the next delivery. Reconcile any mismatch before selecting work. Otherwise, follow the user's explicit task.
5. When work belongs to an issue, read it in full, including scope, exclusions, acceptance criteria, comments, and linked work.
6. Search the codebase for the existing implementation and every caller before deciding where to change it.
7. Confirm that no concurrent or unrelated work conflicts with the selected change.

If GitHub is unavailable, report that the live roadmap and pull-request state could not be verified. Do not guess their contents from `CHANGELOG.md`.

## Sources of truth

Use each source only for the information it owns:

- `README.md`: behavior and setup that exist now.
- `CHANGELOG.md`: user-visible and operational changes made since the last release.
- `docs/`: current operational and technical behavior.
- `ROADMAP.md`: local mirror of the ordered roadmap and priority.
- GitHub issue #11: remote tracking mirror of `ROADMAP.md`; both must change together.
- Individual GitHub issues: scope, exclusions, and acceptance criteria for a delivery.
- Pull requests and Actions: review and verification status.
- Code and migrations: actual runtime behavior and persisted schema.

Plans do not belong in operational documentation. Historical decisions do not belong in documents describing current behavior. Remove superseded instructions instead of preserving contradictory history.

## Repository structure

The structure should describe product capabilities rather than framework categories:

```text
src/
|- library/          Framework-free library model and validation
|- catalog/          Provider-neutral catalog model and contracts
|- desktop-api.ts    Contract shared across the Electron boundary
|- main/             Electron composition, IPC, and infrastructure adapters
|  |- library/       SQLite implementations
|  `- catalog/       Steam, RAWG, and credential implementations
|- preload/          Narrow contextBridge implementation
`- renderer/src/     React features grouped by library, profile, and catalog
```

Keep conventional root configuration files in their standard locations. Do not create generic `services`, `utils`, `managers`, `controllers`, or `use-cases` folders when a domain name communicates the responsibility better.

## Dependency direction

Dependencies point inward toward plain domain code:

- `src/library` must not import Electron, React, SQLite, provider SDKs, network clients, or filesystem APIs.
- `src/catalog/model.ts` defines provider-neutral catalog contracts and must not depend on provider implementations.
- `src/desktop-api.ts` may compose library and catalog contracts but contains no transport implementation.
- `src/main` implements infrastructure and wires dependencies at the Electron entry point.
- `src/preload` translates the desktop API into explicit IPC calls only.
- `src/renderer` depends on domain contracts and `window.api`, never on main-process modules.
- Provider adapters normalize external data before it enters the library.

Business rules belong in plain TypeScript and should be testable without Electron, React, a database, the network, or the filesystem. Pass infrastructure dependencies into code that needs them. Do not instantiate hidden dependencies inside domain logic.

## Engineering decision ladder

After understanding the complete flow, stop at the first option that solves the problem correctly:

1. Do not build it if the requirement does not need it. Apply YAGNI.
2. Reuse an existing helper, contract, component, or project pattern.
3. Use the standard library.
4. Use a native browser, Node.js, Electron, React, or SQLite capability.
5. Use an already-installed dependency.
6. Implement the smallest local solution.
7. Add a dependency or abstraction only when the previous options are insufficient.

New dependencies require a concrete justification, active maintenance, compatible licensing, and a security review. Do not add a package for behavior that the platform already provides clearly.

## Clean code

- Prefer the smallest correct diff after tracing the real behavior end to end.
- Fix a bug at the shared root cause, not separately in each visible caller.
- Give modules, types, functions, and variables precise domain names.
- Keep functions focused and make state transitions explicit.
- Prefer pure functions for validation, normalization, mapping, and calculations.
- Keep code in one function until a second real use or a genuinely separate responsibility requires extraction.
- Apply DRY after duplication is proven, not in anticipation of it.
- Apply SOLID when it removes coupling or testing pain, never as ceremony.
- Avoid boolean parameters that hide two different operations.
- Avoid speculative extension points, factories, interfaces, wrappers, and compatibility layers.
- Do not add backward compatibility unless persisted data, shipped behavior, or an external consumer requires it.
- Delete obsolete code and documentation instead of leaving parallel old and new paths.
- Handle errors at the boundary that can understand and act on them. Never silently swallow a failure.
- Validate all external data and user input at trust boundaries.
- Avoid `any`, non-null assertions, and `@ts-ignore`. If an exception is unavoidable, document the reason and keep its scope minimal.

Do not refactor unrelated code while delivering an issue. Record unrelated problems in a separate issue when they are real and actionable.

## Electron and security boundaries

- Keep context isolation enabled and expose only the typed `GameVaultApi` through `contextBridge`.
- Never expose `ipcRenderer`, generic Electron helpers, Node.js primitives, filesystem access, or shell execution to the renderer.
- Define every IPC channel in `src/desktop-api.ts` and register it in one main-process boundary.
- Treat every IPC argument as untrusted. Validate identifiers, discriminated unions, URLs, profile data, game data, and provider input before use.
- Keep credentials in the main process. Use Electron `safeStorage` where supported and never store secrets in SQLite, source files, logs, tests, issue bodies, or documentation.
- Do not interpolate untrusted values into SQL, paths, commands, HTML, or remote URLs without the appropriate validation or API.
- External links must use safe browser behavior and must not gain renderer privileges.
- Network calls require timeouts, useful provider-neutral errors, and deterministic tests with no live provider dependency.
- File features must use application-managed locations under `userData`; the renderer receives narrow operations, not arbitrary paths.

Report a discovered secret or security defect immediately. Do not repeat secret values in output and do not commit them.

## SQLite and persisted data

- Schema changes are additive migrations that preserve existing user data.
- Never edit the meaning of an already-applied migration. Add a new migration.
- Run migrations transactionally when SQLite supports the operation.
- Keep SQL and row mapping inside the SQLite adapter.
- Use parameterized statements for all values.
- Test migration from the previous schema and test a fresh database.
- Repository methods return domain values, not raw database rows.
- Destructive data changes require explicit product acceptance criteria and regression tests.

## React and renderer

- Preserve the established visual language instead of introducing generic component-library layouts.
- Keep feature components beside the domain flow they serve.
- Keep server, Electron, filesystem, and database concerns out of React components.
- Derive display state during rendering when possible instead of synchronizing duplicate state through effects.
- Use effects only for external synchronization and clean them up correctly.
- Prefer modern React patterns already supported by the project, including `useDeferredValue`, transitions, and effect events when they solve a real problem.
- Do not add `useMemo` or `useCallback` by default. Use them only for a measured need or an existing project convention.
- Preserve keyboard access, focus behavior, labels, contrast, and visible error states in every UI change.
- User-visible copy remains natural Spanish until localization work changes that policy.

## Documentation and comments

All repository documentation and code comments are written in concise, natural English.

- Document behavior that exists now. Do not document planned behavior as if it were implemented.
- Update `README.md` when setup, architecture, or user-facing behavior changes.
- Update `CHANGELOG.md` for user-visible, security, dependency, architecture, and operational changes.
- Update focused documents under `docs/` when an operational contract or integration changes.
- Every public or exported API and every non-trivial function must have a concise contract where the types and name are not sufficient. State inputs, outputs, errors, side effects, and relevant caveats.
- Comments explain intent, constraints, trade-offs, or surprising edge cases. They never narrate obvious assignments or control flow.
- An intentional simplification must state its limit and the condition that would justify a more complex solution.
- When touching an undocumented existing contract, document the contract being changed without creating unrelated comment churn.

Write like a professional maintainer:

- Use concrete nouns and verbs.
- Prefer short factual sentences.
- Avoid filler, hype, generic claims, fake quotations, excessive headings, repetitive summaries, and marketing language.
- Do not mention AI, generated content, prompts, or the writing process.
- Do not add decorative comments, emojis, or labels such as "Note:" when the sentence can state the fact directly.
- Keep examples accurate and executable.

## Testing

Tests are required for every non-trivial behavior change and bug fix.

- Prove observable behavior, not implementation details.
- Add the regression test that fails for a reported bug before or with the fix.
- Test domain rules in isolation.
- Test SQLite repositories against an in-memory database where appropriate.
- Mock provider responses and failure modes; never call live Steam or RAWG endpoints in the test suite.
- Test IPC validation at the main-process boundary.
- Test renderer behavior through user-visible actions and outcomes.
- Cover success, invalid input, meaningful failure, and persisted-data migration paths relevant to the change.
- Keep tests deterministic and independent of execution order, local credentials, network access, and the developer's machine.
- Do not replace real assertions with snapshots that merely record a large output.

A trivial documentation-only correction does not require a new test, but existing checks must still pass.

## Required verification

Format only files changed for the current task before running the final checks:

```bash
npx prettier --write <changed-files>
npm run lint
npm run typecheck
npm test
npm run build
```

Replace `<changed-files>` with an explicit file list. Use `npm run format` only when the task intentionally covers the entire repository and no unrelated worktree changes would be modified.

Use `npm install` for normal local setup. CI owns its documented clean-install workaround; do not copy CI-only installation behavior into application scripts without a demonstrated need.

Additional verification is required when relevant:

- Run `npm run build:unpack` after Electron, native dependency, packaging, icon, or builder changes.
- Smoke-test the packaged application after runtime or packaging changes.
- Run `npm audit` after dependency changes and investigate findings rather than applying `--force` blindly.
- Verify migrations against both fresh and previous databases after schema changes.
- Verify keyboard and focus flows manually after interactive UI changes.

Do not claim completion when a required check was skipped. Report PASS, FAIL, or the exact blocker.

## Git and GitHub workflow

`main` is protected. Normal work follows this sequence:

1. Start from an up-to-date `main` and create a focused branch.
2. Keep one issue or one coherent concern per branch.
3. Inspect `git status`, `git diff`, and recent history before staging.
4. Stage only intended files and inspect the staged diff.
5. Use concise English conventional commits that match repository history.
6. Push the branch and open a pull request linked to its issue.
7. Wait for the required `checks` job.
8. Merge only after acceptance criteria and CI are satisfied.
9. Confirm the post-merge `main` workflow, close the issue, and update issue #11.

Never push directly to `main`. Never force-push, rewrite history, skip hooks, weaken checks, delete protected branches, or use the ruleset bypass for routine work. The recovery procedure is documented in `docs/repository-maintenance.md`.

Do not commit, push, merge, close issues, or create releases unless the user explicitly requests that action. Do not amend a commit unless explicitly requested. Never discard, revert, or overwrite unrelated changes made by the user or another agent.

Before reviewing or merging a Dependabot pull request:

- identify whether the update is major, minor, or patch;
- read upstream release and migration notes for majors;
- inspect lockfile changes;
- run the full verification suite;
- keep automatic merging disabled; and
- reject unrelated dependency churn.

Release publication, code signing, store distribution, and auto-update remain deferred until an issue explicitly brings them into scope. Existing local installer commands remain supported.

## Definition of done

A delivery is complete only when all applicable statements are true:

- The selected issue and every caller of changed code were understood.
- The implementation satisfies the issue scope without adding excluded work.
- Dependencies still point inward and security boundaries remain narrow.
- Trust-boundary validation and actionable error handling are present.
- Real tests prove the new or corrected behavior.
- Formatting, lint, typecheck, tests, and build pass.
- Packaging, migration, accessibility, audit, or smoke checks pass when relevant.
- Documentation describes current behavior in professional English.
- `CHANGELOG.md` records the change when required.
- The diff contains no secrets, placeholders, debug output, dead code, or unrelated cleanup.
- The pull request links the issue and required CI passes without bypass.
- The issue acceptance checklist and roadmap are updated after merge.

If work stops before these conditions are met, report in the current conversation what is complete, what remains, which checks ran, and the exact blocker. Add the same factual status to an issue or pull request only when the user explicitly requests that external update. Do not describe partial work as finished.
