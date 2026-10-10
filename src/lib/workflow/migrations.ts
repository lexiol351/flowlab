import { z } from 'zod';
import { WORKFLOW_SCHEMA_VERSION, WorkflowV1Schema } from './types.ts';
import type { WorkflowV1 } from './types.ts';

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

// ---------------------------------------------------------------------------
// Schema version 0 (the original beta shape)
// ---------------------------------------------------------------------------

/**
 * v0 differences from v1:
 * - nodes stored their config under `params` instead of `data`
 * - nodes had no `label`
 * - edges had no `id`
 * - no `createdAt` / `updatedAt` timestamps
 */
const WorkflowV0NodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  params: z.record(z.string(), z.unknown()),
});

const WorkflowV0EdgeSchema = z.object({
  source: z.string().min(1),
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  targetHandle: z.string().min(1),
});

const WorkflowV0Schema = z.object({
  version: z.literal(0),
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.array(WorkflowV0NodeSchema),
  edges: z.array(WorkflowV0EdgeSchema),
});

type WorkflowV0 = z.infer<typeof WorkflowV0Schema>;

let migrationEdgeCounter = 0;

function makeEdgeId(): string {
  migrationEdgeCounter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `migrated-edge-${Date.now()}-${migrationEdgeCounter}`;
}

/** Migrate a v0 workflow document to the current schema version. */
export function migrateV0ToV1(v0: WorkflowV0): WorkflowV1 {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: v0.id,
    name: v0.name,
    createdAt: now,
    updatedAt: now,
    nodes: v0.nodes.map((n) => ({
      id: n.id,
      // Validated as a known node type by the v1 schema parse below.
      type: n.type as WorkflowV1['nodes'][number]['type'],
      position: { x: n.position.x, y: n.position.y },
      data: { ...n.params },
    })),
    edges: v0.edges.map((e) => ({
      id: makeEdgeId(),
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    })),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse an unknown value (from a JSON file, IndexedDB, …) into a valid
 * current-version workflow, migrating older schema versions as needed.
 *
 * @throws {MigrationError} when the data is not a recognizable workflow.
 */
export function migrateWorkflow(input: unknown): WorkflowV1 {
  if (typeof input !== 'object' || input === null) {
    throw new MigrationError('Imported data is not a workflow object.');
  }

  const version = (input as { version?: unknown }).version;

  if (version === WORKFLOW_SCHEMA_VERSION) {
    const parsed = WorkflowV1Schema.safeParse(input);
    if (!parsed.success) {
      throw new MigrationError(
        `Workflow failed schema validation: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
      );
    }
    return parsed.data;
  }

  if (version === 0) {
    const parsedV0 = WorkflowV0Schema.safeParse(input);
    if (!parsedV0.success) {
      throw new MigrationError(
        `Legacy workflow (v0) is malformed: ${parsedV0.error.issues[0]?.message ?? 'unknown error'}`,
      );
    }
    const migrated = migrateV0ToV1(parsedV0.data);
    const parsedV1 = WorkflowV1Schema.safeParse(migrated);
    if (!parsedV1.success) {
      throw new MigrationError(
        `Migrated workflow failed validation: ${parsedV1.error.issues[0]?.message ?? 'unknown error'}`,
      );
    }
    return parsedV1.data;
  }

  throw new MigrationError(
    `Unsupported workflow schema version: ${JSON.stringify(version)}. This version of FlowLab reads v0–v${WORKFLOW_SCHEMA_VERSION}.`,
  );
}

/** Parse a JSON string into a migrated, validated workflow. */
export function parseWorkflowJson(json: string): WorkflowV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new MigrationError('File is not valid JSON.');
  }
  return migrateWorkflow(parsed);
}

/** Serialize a workflow for export (pretty-printed, version-stamped). */
export function serializeWorkflow(workflow: WorkflowV1): string {
  const parsed = WorkflowV1Schema.safeParse(workflow);
  if (!parsed.success) {
    throw new MigrationError('Cannot export: workflow failed schema validation.');
  }
  return JSON.stringify(parsed.data, null, 2);
}
