import { z } from 'zod';

/** Current version of the workflow JSON schema. Bump when the shape changes. */
export const WORKFLOW_SCHEMA_VERSION = 1 as const;

/** Data types that can flow through ports. `any` is compatible with everything. */
export type PortDataType = 'string' | 'number' | 'any';

export const PORT_DATA_TYPES = ['string', 'number', 'any'] as const;

export const NODE_TYPES = [
  'textInput',
  'numberInput',
  'textTransform',
  'mathTransform',
  'condition',
  'switch',
  'mergeText',
  'template',
  'json',
  'httpRequest',
  'delay',
  'random',
  'datetime',
  'note',
  'output',
] as const;

export type NodeTypeId = (typeof NODE_TYPES)[number];

/** Node categories shown in the palette. */
export const NODE_CATEGORIES = [
  'Input',
  'Transform',
  'Logic',
  'Utility',
  'Output',
] as const;

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

/** A value produced/consumed at runtime. */
export type PortValue = string | number;

export interface PortDef {
  id: string;
  label: string;
  type: PortDataType;
  /** Input ports only: whether the node needs this input to execute. */
  required: boolean;
}

export interface FlowNode {
  id: string;
  type: NodeTypeId;
  position: { x: number; y: number };
  /** Optional user label shown on the node card. */
  label?: string;
  /** Node-type-specific configuration (validated per node type). */
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowV1 {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ---------------------------------------------------------------------------
// Zod schemas (runtime validation for imports / IndexedDB recovery)
// ---------------------------------------------------------------------------

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const FlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  position: PositionSchema,
  label: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

const FlowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  targetHandle: z.string().min(1),
});

export const WorkflowV1Schema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
});

export type { WorkflowV1 as Workflow };

/** Lightweight graph shape used by the engine and validators. */
export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
