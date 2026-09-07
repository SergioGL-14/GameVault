# Roadmap

This file mirrors [GitHub issue #11](https://github.com/SergioGL-14/GameVault/issues/11) so the delivery order remains available without GitHub access. Individual issues own detailed scope, exclusions, discussion, and acceptance criteria. Neither this file nor issue #11 implies a release date.

Update this file and issue #11 together whenever an item is added, reprioritized, completed, or deferred. If they disagree, stop roadmap work and reconcile them before selecting the next delivery.

The current multi-delivery design is documented in [`docs/library-achievement-plan.md`](docs/library-achievement-plan.md).

## Foundation

- [x] [#9 Automate dependency updates and require CI](https://github.com/SergioGL-14/GameVault/issues/9)
- [x] [#7 Protect the desktop API and critical library flows with tests](https://github.com/SergioGL-14/GameVault/issues/7)

## Completed product deliveries

- [x] [#6 Add manually managed achievements](https://github.com/SergioGL-14/GameVault/issues/6)
- [x] [#1 Improve catalog failure and offline states](https://github.com/SergioGL-14/GameVault/issues/1)
- [x] [#5 Make core flows keyboard and screen-reader accessible](https://github.com/SergioGL-14/GameVault/issues/5)
- [x] [#10 Support durable local profile and game images](https://github.com/SergioGL-14/GameVault/issues/10)
- [x] [#4 Add settings and manually refresh a Steam library](https://github.com/SergioGL-14/GameVault/issues/4)
- [x] [#35 Synchronize Steam achievements with manual overrides](https://github.com/SergioGL-14/GameVault/issues/35)

## Next product deliveries

- [ ] [#37 Add a second provider without duplicating games or achievements](https://github.com/SergioGL-14/GameVault/issues/37)

## Later

- [ ] [#36 Provide optional achievement packs for games without official achievements](https://github.com/SergioGL-14/GameVault/issues/36)
- [ ] [#8 Make the profile showcase configurable](https://github.com/SergioGL-14/GameVault/issues/8)
- [ ] [#2 Add Spanish and English localization](https://github.com/SergioGL-14/GameVault/issues/2)

## Deferred until there is evidence of need

- [ ] [#3 Introduce a GameVault catalog API only when scale requires it](https://github.com/SergioGL-14/GameVault/issues/3)

## Working agreement

- Start an item only after confirming that its issue scope and acceptance criteria remain valid.
- Complete an item only when its acceptance checklist is satisfied, CI passes, documentation reflects current behavior, and the change is merged.
- External ownership and achievement refreshes are user-triggered only. Startup may resume metadata already queued by an explicit import, but it never refreshes account data.
- Record a new idea in an individual issue before adding it to this roadmap.
- Keep release publication, code signing, store distribution, and auto-update outside this roadmap until explicitly prioritized.
