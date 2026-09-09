const DATABASE_NAME = 'api-mook'
const DATABASE_VERSION = 1

export const STORES = {
  folders: 'folders',
  rules: 'rules',
  traffic: 'traffic',
  chats: 'chats',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

let databasePromise: Promise<IDBDatabase> | undefined

export function getDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      Object.values(STORES).forEach((name) => {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' })
      })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return databasePromise
}
