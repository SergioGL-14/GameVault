# GameVault

GameVault is a local personal game record. It combines ownership, game information, personal progress, and achievements without becoming a store, launcher, or social platform.

## Language

**Canonical game**:
The single GameVault record for one game, independent of the platforms where the user owns it.
_Avoid_: Platform game, provider game, duplicate card

**Provider ownership**:
An external platform's evidence that one account owns a canonical game.
_Avoid_: Imported game, Steam game

**Game card**:
The user-facing information for a canonical game, including catalog metadata and personal values.
_Avoid_: Provider card, listing

**Usable game card**:
A game card with enough imported information for normal browsing: title, description, and cover.
_Avoid_: Complete metadata, fully populated game

**Incomplete game card**:
A retained game card that does not yet satisfy the usable game card contract and remains eligible for metadata enrichment.
_Avoid_: Broken game, failed import

**Metadata enrichment**:
The recoverable process that adds catalog information to a canonical game after ownership is saved.
_Avoid_: Ownership import, repair

**Provider evidence**:
The last complete achievement or ownership state successfully reported by an external platform.
_Avoid_: Provider truth

**Manual override**:
An explicit user edit that takes precedence over provider metadata or evidence.
_Avoid_: Local patch, custom value

**Effective achievement state**:
The manual override when present, otherwise the combined completion evidence from connected providers.
_Avoid_: Steam state, imported state
