import type { ExperimentSessionRecord, TrialData } from './experimentTypes'

const DB_NAME = 'naps-experiment'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'sessionId' })
      }
      if (!db.objectStoreNames.contains('trials')) {
        const store = db.createObjectStore('trials', { keyPath: ['sessionId', 'trialNumber'] })
        store.createIndex('bySession', 'sessionId')
      }
      if (!db.objectStoreNames.contains('pendingSync')) {
        db.createObjectStore('pendingSync', { autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = fn(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        transaction.oncomplete = () => db.close()
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      })
  )
}

export function saveSession(record: ExperimentSessionRecord): Promise<void> {
  return tx('sessions', 'readwrite', (store) => store.put(record)).then(() => {})
}

export function getSession(sessionId: string): Promise<ExperimentSessionRecord | undefined> {
  return tx('sessions', 'readonly', (store) => store.get(sessionId))
}

export function updateSessionStatus(
  sessionId: string,
  status: ExperimentSessionRecord['status'],
  currentTrialIndex: number
): Promise<void> {
  return getSession(sessionId).then((record) => {
    if (!record) return
    record.status = status
    record.currentTrialIndex = currentTrialIndex
    if (status === 'completed' || status === 'synced') {
      record.completedAt = new Date().toISOString()
    }
    return saveSession(record)
  })
}

export function saveTrial(sessionId: string, trial: TrialData): Promise<void> {
  return tx('trials', 'readwrite', (store) =>
    store.put({ sessionId, ...trial })
  ).then(() => {})
}

export function getTrials(sessionId: string): Promise<TrialData[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction('trials', 'readonly')
        const store = transaction.objectStore('trials')
        const index = store.index('bySession')
        const request = index.getAll(sessionId)
        request.onsuccess = () => { db.close(); resolve(request.result) }
        request.onerror = () => { db.close(); reject(request.error) }
      })
  )
}

interface PendingSyncEntry {
  type: 'session' | 'trials'
  sessionId: string
  data: unknown
  createdAt: string
}

export function addPendingSync(entry: PendingSyncEntry): Promise<void> {
  return tx('pendingSync', 'readwrite', (store) => store.add(entry)).then(() => {})
}

export function getPendingSync(): Promise<Array<PendingSyncEntry & { id: number }>> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction('pendingSync', 'readonly')
        const store = transaction.objectStore('pendingSync')
        const results: Array<PendingSyncEntry & { id: number }> = []
        const request = store.openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            results.push({ id: cursor.key as number, ...cursor.value })
            cursor.continue()
          } else {
            db.close()
            resolve(results)
          }
        }
        request.onerror = () => { db.close(); reject(request.error) }
      })
  )
}

export function clearPendingSync(ids: number[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction('pendingSync', 'readwrite')
        const store = transaction.objectStore('pendingSync')
        for (const id of ids) store.delete(id)
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => { db.close(); reject(transaction.error) }
      })
  )
}
