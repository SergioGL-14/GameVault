# Accessibility checklist

Run this checklist with the desktop application, not the browser-only test environment. Test once at the default 1440 × 900 window size and once at the 980 × 680 minimum.

## Keyboard

- [ ] Start with no modal open. Tab reaches the brand, Perfil, Biblioteca, and the interactive controls in the visible view in a logical order.
- [ ] Switch between Perfil and Biblioteca. A visible focus indicator follows keyboard focus and the destination heading receives focus.
- [ ] In Biblioteca, reach the search field and every status filter, including Abandonado and En deseo at the minimum window size.
- [ ] Open a game card and use the detail actions. Returning to Biblioteca restores focus to the originating card.
- [ ] Open each dialog: add game, edit game, edit profile, and add or edit achievement. Focus starts in the first field, Tab and Shift+Tab stay inside, and Escape closes the dialog.
- [ ] Close each dialog with Escape and with its Cancelar or close button. Focus returns to the control that opened it.
- [ ] Trigger a validation or asynchronous error. The message remains visible, does not rely only on color, and focus is not lost.

## Screen reader

- [ ] Confirm the document is announced in Spanish and exposes one main landmark plus the named primary navigation.
- [ ] Confirm Perfil, Biblioteca, library filters, catalog sources, and showcase actions announce their current or pressed state.
- [ ] Confirm game cards and cover-only profile controls announce the full game title.
- [ ] Confirm each dialog is announced by its visible heading.
- [ ] Confirm catalog results, library result counts, achievement loading, achievement progress, and errors are announced without moving focus unexpectedly.

Automated Axe checks cover representative profile, library, detail, and modal states. Layout, rendered contrast, native dialog focus containment, and actual speech output remain manual checks because jsdom does not reproduce them reliably.
