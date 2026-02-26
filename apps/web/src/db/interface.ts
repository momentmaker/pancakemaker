export type DatabaseRow = Record<string, unknown>

export interface Database {
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T = DatabaseRow>(sql: string, params?: unknown[]): Promise<T[]>
  transaction(fn: () => Promise<void>): Promise<void>
}
