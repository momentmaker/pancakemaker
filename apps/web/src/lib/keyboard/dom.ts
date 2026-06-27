// Marks an element as keyboard-cursor-navigable. Set on the element as a literal
// `data-kbd-item-id` attribute (Card, ExpenseRow) and located via kbdItemSelector,
// so the selector string lives in exactly one place.
export const KBD_ITEM_ATTR = 'data-kbd-item-id'

export function kbdItemSelector(id: string): string {
  return `[${KBD_ITEM_ATTR}="${id}"]`
}
