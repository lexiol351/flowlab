import { migrateWorkflow } from '../workflow/migrations.ts';
import type { WorkflowV1 } from '../workflow/types.ts';

/**
 * IndexedDB persistence for FlowLab.
 *
 * - Database: `flowlab-db`
 * - Store `workflows`: full WorkflowV1 documents keyed by `id`
 * - Store `meta`: simple key/value pairs (active workflow id, theme, …)
 *
 * Every read passes through the schema migration pipeline, so older or
 * slightly malformed records are upgraded (or safely skipped) instead of
 * crashing the app.
 */

const DB_NAME = 'flowlab-db';
const DB_VERSION = 1;
const WORKFLOWS_STORE = 'workflows';
const META_STORE = 'meta';

export interface MetaRecord {
  key: string;
  value: unknown;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
        db.createObjectStore(WORKFLOWS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked.'));
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    const request = run(objectStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export interface WorkflowIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ListResult {
  workflows: WorkflowV1[];
  /** Ids of records that failed migration/validation and were skipped. */
  corruptedIds: string[];
}

/** Read all workflows, migrating old schema versions; skip corrupted records. */
export async function listWorkflows(): Promise<ListResult> {
  const db = await openDb();
  try {
    const records = await tx<unknown[]>(db, WORKFLOWS_STORE, 'readonly', (s) => s.getAll());
    const workflows: WorkflowV1[] = [];
    const corruptedIds: string[] = [];
    for (const record of records) {
      try {
        workflows.push(migrateWorkflow(record));
      } catch (err) {
        const id =
          typeof record === 'object' && record !== null && 'id' in record
            ? String((record as { id: unknown }).id)
            : '(unknown id)';
        corruptedIds.push(id);
        console.warn(`Skipping corrupted workflow record "${id}":`, err);
      }
    }
    workflows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { workflows, corruptedIds };
  } finally {
    db.close();
  }
}

export async function getWorkflow(id: string): Promise<WorkflowV1 | undefined> {
  const db = await openDb();
  try {
    const record = await tx<unknown>(db, WORKFLOWS_STORE, 'readonly', (s) => s.get(id));
    if (record === undefined) return undefined;
    return migrateWorkflow(record);
  } finally {
    db.close();
  }
}

export async function saveWorkflow(workflow: WorkflowV1): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, WORKFLOWS_STORE, 'readwrite', (s) => s.put(workflow));
  } finally {
    db.close();
  }
}

export async function deleteWorkflow(id: string): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, WORKFLOWS_STORE, 'readwrite', (s) => s.delete(id));
  } finally {
    db.close();
  }
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await openDb();
  try {
    const record = await tx<MetaRecord | undefined>(db, META_STORE, 'readonly', (s) => s.get(key));
    return record?.value;
  } finally {
    db.close();
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, META_STORE, 'readwrite', (s) => s.put({ key, value } satisfies MetaRecord));
  } finally {
    db.close();
  }
}

/** Remove a corrupted record so it stops being reported. Exported for tests. */
export async function deleteCorruptedRecord(id: string): Promise<void> {
  await deleteWorkflow(id);
}

/** Test/support helper: wipe the database (used by E2E setup). */
export async function clearDatabase(): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, WORKFLOWS_STORE, 'readwrite', (s) => s.clear());
    await tx(db, META_STORE, 'readwrite', (s) => s.clear());
  } finally {
    db.close();
  }
}

/** Close + delete the database. Used by tests to get a clean slate. */
export async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB delete blocked.'));
  });
}
