export type CommandGroup = 'Routes' | 'Categories' | 'Panels' | 'Recent expenses' | 'Actions'

export const COMMAND_GROUP_ORDER: CommandGroup[] = [
  'Routes',
  'Categories',
  'Panels',
  'Recent expenses',
  'Actions',
]

export interface CommandItem {
  id: string
  group: CommandGroup
  label: string
  sublabel?: string
  // The text the fuzzy matcher searches (may include extra context like the route).
  matchText: string
  run: () => void
}
