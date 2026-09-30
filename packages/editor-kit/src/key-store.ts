/**
 * Where the signing key lives between visits: IndexedDB, the one browser
 * store that keeps a CryptoKey as it is, so its private half never has to be
 * exported to be kept. One key pair per namespace.
 */

const DATABASE = 'trevixal-keys'
const STORE = 'signing'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then((database) =>
    new Promise<T>((resolve, reject) => {
      const request = work(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).finally(() => database.close()),
  )
}

/** The key pair kept for `namespace`, or null when there is none (or no IndexedDB). */
export async function loadSigningKeys(namespace: string): Promise<CryptoKeyPair | null> {
  if (typeof indexedDB === 'undefined') return null
  const keys = await run<CryptoKeyPair | undefined>('readonly', (store) => store.get(namespace))
  return keys ?? null
}

/** Keep a key pair for `namespace`. */
export async function saveSigningKeys(namespace: string, keys: CryptoKeyPair): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await run('readwrite', (store) => store.put(keys, namespace))
}
