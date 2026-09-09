import { getDatabase, type StoreName } from './database'

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await getDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

export async function getById<T>(storeName: StoreName, id: string): Promise<T | undefined> {
  const database = await getDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const database = await getDatabase()
  await complete(database.transaction(storeName, 'readwrite').objectStore(storeName).put(value))
}

export async function remove(storeName: StoreName, id: string): Promise<void> {
  const database = await getDatabase()
  await complete(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id))
}

export async function clear(storeName: StoreName): Promise<void> {
  const database = await getDatabase()
  await complete(database.transaction(storeName, 'readwrite').objectStore(storeName).clear())
}

function complete(request: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
