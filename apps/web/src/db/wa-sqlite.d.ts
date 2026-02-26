declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  export class OriginPrivateFileSystemVFS {
    constructor()
    readonly name: string
    close(): Promise<void>
  }
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    constructor(idbDatabaseName?: string)
    name: string
    close(): Promise<void>
  }
}
