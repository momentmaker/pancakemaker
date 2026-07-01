import '@testing-library/jest-dom/vitest'

// Node >= 22 ships an experimental global Web Storage that is non-functional
// without --localstorage-file (its methods are undefined) and shadows jsdom's
// window.localStorage. The app and several tests use the bare `localStorage`
// global, so install a working in-memory Storage on both globalThis and window
// to mirror real browser behavior regardless of the Node version's webstorage.
function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  } as unknown as Storage
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = createStorage()
  Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: storage, configurable: true, writable: true })
  }
}
