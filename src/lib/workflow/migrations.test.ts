import { describe, expect, it } from 'vitest';
import {
  MigrationError,
  migrateWorkflow,
  parseWorkflowJson,
  serializeWorkflow,
} from './migrations.ts';
import { WorkflowV1Schema } from './types.ts';

const VALID_V1 = {
  version: 1,
  id: 'wf-1',
  name: 'Test',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
  nodes: [
    {
      id: 'n1',
      type: 'textInput',
      position: { x: 10, y: 20 },
      data: { value: 'hi' },
    },
  ],
  edges: [],
};

const LEGACY_V0 = {
  version: 0,
  id: 'wf-old',
  name: 'Legacy',
  nodes: [
    {
      id: 'n1',
      type: 'textInput',
      position: { x: 10, y: 20 },
      params: { value: 'legacy hello' },
    },
    {
      id: 'n2',
      type: 'output',
      position: { x: 200, y: 20 },
      params: {},
    },
  ],
  edges: [{ source: 'n1', sourceHandle: 'value', target: 'n2', targetHandle: 'in' }],
};

describe('migrateWorkflow', () => {
  it('accepts a valid v1 workflow unchanged', () => {
    const result = migrateWorkflow(structuredClone(VALID_V1));
    expect(result.version).toBe(1);
    expect(result.id).toBe('wf-1');
    expect(result.nodes).toHaveLength(1);
  });

  it('migrates a v0 workflow to v1', () => {
    const result = migrateWorkflow(structuredClone(LEGACY_V0));
    expect(result.version).toBe(1);
    expect(result.id).toBe('wf-old');
    expect(result.name).toBe('Legacy');
    // params -> data
    expect(result.nodes[0].data).toEqual({ value: 'legacy hello' });
    expect('params' in result.nodes[0]).toBe(false);
    // edges gain ids
    expect(result.edges).toHaveLength(1);
    expect(typeof result.edges[0].id).toBe('string');
    expect(result.edges[0].id.length).toBeGreaterThan(0);
    expect(result.edges[0].source).toBe('n1');
    // timestamps added
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    // result validates against the v1 schema
    expect(WorkflowV1Schema.safeParse(result).success).toBe(true);
  });

  it('gives migrated edges unique ids', () => {
    const v0 = structuredClone(LEGACY_V0);
    v0.edges.push({ source: 'n1', sourceHandle: 'value', target: 'n2', targetHandle: 'in' });
    const result = migrateWorkflow(v0);
    const ids = result.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects non-object input', () => {
    expect(() => migrateWorkflow(null)).toThrow(MigrationError);
    expect(() => migrateWorkflow('nope')).toThrow(MigrationError);
    expect(() => migrateWorkflow(42)).toThrow(MigrationError);
  });

  it('rejects unsupported future versions', () => {
    expect(() => migrateWorkflow({ ...VALID_V1, version: 99 })).toThrow(MigrationError);
  });

  it('rejects malformed v1 workflows', () => {
    expect(() => migrateWorkflow({ ...VALID_V1, nodes: 'nope' })).toThrow(MigrationError);
    expect(() => migrateWorkflow({ ...VALID_V1, id: '' })).toThrow(MigrationError);
  });

  it('rejects malformed v0 workflows', () => {
    expect(() => migrateWorkflow({ version: 0, id: 'x' })).toThrow(MigrationError);
  });

  it('rejects v0 workflows with unknown node types after migration', () => {
    const v0 = structuredClone(LEGACY_V0);
    v0.nodes[0].type = 'teleport';
    expect(() => migrateWorkflow(v0)).toThrow(MigrationError);
  });
});

describe('parseWorkflowJson', () => {
  it('parses a JSON string into a workflow', () => {
    const result = parseWorkflowJson(JSON.stringify(VALID_V1));
    expect(result.id).toBe('wf-1');
  });

  it('parses and migrates legacy JSON', () => {
    const result = parseWorkflowJson(JSON.stringify(LEGACY_V0));
    expect(result.version).toBe(1);
    expect(result.nodes[0].data).toEqual({ value: 'legacy hello' });
  });

  it('rejects invalid JSON', () => {
    expect(() => parseWorkflowJson('{oops')).toThrow(MigrationError);
  });

  it('rejects JSON that is not a workflow', () => {
    expect(() => parseWorkflowJson('[1,2,3]')).toThrow(MigrationError);
  });
});

describe('serializeWorkflow', () => {
  it('round-trips through parseWorkflowJson', () => {
    const serialized = serializeWorkflow(structuredClone(VALID_V1));
    const parsed = parseWorkflowJson(serialized);
    expect(parsed).toEqual(VALID_V1);
  });

  it('produces version-stamped JSON', () => {
    const serialized = serializeWorkflow(structuredClone(VALID_V1));
    expect(JSON.parse(serialized).version).toBe(1);
  });

  it('refuses to serialize invalid workflows', () => {
    expect(() => serializeWorkflow({ ...VALID_V1, nodes: [] as never, id: '' })).toThrow(
      MigrationError,
    );
  });
});
