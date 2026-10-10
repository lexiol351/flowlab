/**
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDatabase,
  deleteWorkflow,
  getMeta,
  getWorkflow,
  listWorkflows,
  saveWorkflow,
  setMeta,
} from './indexeddb.ts';
import type { WorkflowV1 } from '../workflow/types.ts';

/** Write a raw record, bypassing the typed API (for legacy/corrupt fixtures). */
async function putRaw(record: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('flowlab-db', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('workflows', 'readwrite');
      t.objectStore('workflows').put(record);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

function makeWorkflow(id: string, name: string): WorkflowV1 {
  const now = new Date().toISOString();
  return {
    version: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: 'n1',
        type: 'textInput',
        position: { x: 0, y: 0 },
        data: { value: 'persisted' },
      },
    ],
    edges: [],
  };
}

beforeEach(async () => {
  await clearDatabase();
});

describe('IndexedDB persistence', () => {
  it('saves and retrieves a workflow', async () => {
    const wf = makeWorkflow('wf-1', 'First');
    await saveWorkflow(wf);
    const loaded = await getWorkflow('wf-1');
    expect(loaded).toEqual(wf);
  });

  it('returns undefined for unknown ids', async () => {
    expect(await getWorkflow('nope')).toBeUndefined();
  });

  it('lists workflows newest-first', async () => {
    const older = { ...makeWorkflow('wf-old', 'Old'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...makeWorkflow('wf-new', 'New'), updatedAt: '2026-06-01T00:00:00.000Z' };
    await saveWorkflow(older);
    await saveWorkflow(newer);
    const { workflows, corruptedIds } = await listWorkflows();
    expect(corruptedIds).toEqual([]);
    expect(workflows.map((w) => w.id)).toEqual(['wf-new', 'wf-old']);
  });

  it('overwrites a workflow on re-save', async () => {
    await saveWorkflow(makeWorkflow('wf-1', 'First'));
    await saveWorkflow(makeWorkflow('wf-1', 'Renamed'));
    const loaded = await getWorkflow('wf-1');
    expect(loaded?.name).toBe('Renamed');
  });

  it('deletes workflows', async () => {
    await saveWorkflow(makeWorkflow('wf-1', 'First'));
    await deleteWorkflow('wf-1');
    expect(await getWorkflow('wf-1')).toBeUndefined();
  });

  it('round-trips node data exactly (no loss on save/load)', async () => {
    const wf = makeWorkflow('wf-1', 'First');
    wf.nodes.push({
      id: 'n2',
      type: 'mathTransform',
      position: { x: 100, y: 50 },
      label: 'My math',
      data: { operation: 'divide' },
    });
    wf.edges.push({
      id: 'e1',
      source: 'n1',
      sourceHandle: 'value',
      target: 'n2',
      targetHandle: 'a',
    });
    await saveWorkflow(wf);
    const loaded = await getWorkflow('wf-1');
    expect(loaded).toEqual(wf);
  });

  it('migrates legacy v0 records on read', async () => {
    // Write a raw v0 record bypassing saveWorkflow's typing.
    await putRaw({
      version: 0,
      id: 'wf-legacy',
      name: 'Legacy',
      nodes: [{ id: 'n1', type: 'textInput', position: { x: 0, y: 0 }, params: { value: 'old' } }],
      edges: [],
    });

    const loaded = await getWorkflow('wf-legacy');
    expect(loaded?.version).toBe(1);
    expect(loaded?.nodes[0].data).toEqual({ value: 'old' });
  });

  it('skips corrupted records instead of crashing', async () => {
    await saveWorkflow(makeWorkflow('wf-good', 'Good'));
    await putRaw({ id: 'wf-bad', version: 1, name: 42 });

    const { workflows, corruptedIds } = await listWorkflows();
    expect(workflows.map((w) => w.id)).toEqual(['wf-good']);
    expect(corruptedIds).toEqual(['wf-bad']);
  });

  it('stores and retrieves meta values', async () => {
    await setMeta('theme', 'light');
    expect(await getMeta('theme')).toBe('light');
    expect(await getMeta('missing')).toBeUndefined();
  });

  it('clears the database', async () => {
    await saveWorkflow(makeWorkflow('wf-1', 'First'));
    await setMeta('theme', 'light');
    await clearDatabase();
    const { workflows } = await listWorkflows();
    expect(workflows).toEqual([]);
    expect(await getMeta('theme')).toBeUndefined();
  });
});
