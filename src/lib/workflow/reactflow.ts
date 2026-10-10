import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import type {
  FlowEdge,
  FlowNode,
  NodeTypeId,
  WorkflowGraph,
  WorkflowV1,
} from './types.ts';

/** Generate a collision-resistant id (crypto-backed when available). */
export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Data payload stored on every React Flow node. `nodeType` is the FlowLab
 * node type (the RF node `type` is always the shared `flowNode` component).
 */
export interface FlowNodeData extends Record<string, unknown> {
  nodeType: NodeTypeId;
  label?: string;
  config: Record<string, unknown>;
}

export type AppNode = RFNode<FlowNodeData, 'flowNode'>;
export type AppEdge = RFEdge;

/** Convert a persisted workflow into React Flow state. */
export function workflowToAppGraph(workflow: WorkflowV1): {
  nodes: AppNode[];
  edges: AppEdge[];
} {
  return {
    nodes: workflow.nodes.map(
      (n): AppNode => ({
        id: n.id,
        type: 'flowNode',
        position: { x: n.position.x, y: n.position.y },
        data: {
          nodeType: n.type,
          label: n.label,
          config: { ...n.data },
        },
      }),
    ),
    edges: workflow.edges.map(
      (e): AppEdge => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      }),
    ),
  };
}

/** Convert React Flow state back into the engine's graph shape. */
export function appGraphToWorkflowGraph(nodes: AppNode[], edges: AppEdge[]): WorkflowGraph {
  return {
    nodes: nodes.map(
      (n): FlowNode => ({
        id: n.id,
        type: n.data.nodeType,
        position: { x: n.position.x, y: n.position.y },
        label: n.data.label,
        data: { ...n.data.config },
      }),
    ),
    edges: edges.map(
      (e): FlowEdge => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? '',
        target: e.target,
        targetHandle: e.targetHandle ?? '',
      }),
    ),
  };
}

/** Build a persisted WorkflowV1 from editor state. */
export function appGraphToWorkflow(
  id: string,
  name: string,
  nodes: AppNode[],
  edges: AppEdge[],
  createdAt: string,
): WorkflowV1 {
  const graph = appGraphToWorkflowGraph(nodes, edges);
  return {
    version: 1,
    id,
    name,
    createdAt,
    updatedAt: new Date().toISOString(),
    nodes: graph.nodes,
    edges: graph.edges,
  };
}
