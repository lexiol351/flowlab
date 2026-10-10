import {
  arePortsCompatible,
  getNodeDefinition,
  getPortDef,
  isKnownNodeType,
  validateNodeConfig,
} from './nodeRegistry.ts';
import type { FlowEdge, FlowNode, PortValue, WorkflowGraph } from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  seq: number;
  timestamp: string;
  nodeId: string | null;
  level: LogLevel;
  message: string;
}

export interface NodeRunResult {
  status: Exclude<NodeStatus, 'idle' | 'running'>;
  outputs: Record<string, PortValue>;
  error: string | null;
  durationMs: number;
}

export interface ExecutionResult {
  runId: string;
  nodeResults: Record<string, NodeRunResult>;
  log: LogEntry[];
  hasErrors: boolean;
  aborted: boolean;
  /** True when the run was stopped by the execution timeout. */
  timedOut: boolean;
  /** Wall-clock duration of the whole run in milliseconds. */
  totalDurationMs: number;
  /** Values transmitted over edges, keyed by edge id (only for taken edges). */
  edgeValues: Record<string, PortValue>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  /** Warnings don't block execution; errors do. Defaults to 'error'. */
  severity?: 'error' | 'warning';
}

export interface ConnectCheck {
  ok: boolean;
  reason?: string;
}

export interface ExecuteOptions {
  signal?: AbortSignal;
  /**
   * Called when a node starts (result === null, status "running") and when it
   * finishes (result set). Used for live UI updates.
   */
  onNodeUpdate?: (nodeId: string, result: NodeRunResult | null) => void;
  /**
   * Maximum run duration in milliseconds. When exceeded, the run is aborted
   * and remaining nodes are skipped. Defaults to 60_000; set to 0 to disable.
   */
  timeoutMs?: number;
}

export class WorkflowValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(
      `Workflow is invalid: ${issues
        .slice(0, 3)
        .map((i) => i.message)
        .join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`,
    );
    this.name = 'WorkflowValidationError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Graph validation
// ---------------------------------------------------------------------------

/**
 * Validate a workflow graph without executing it.
 *
 * Checks: unknown node types, invalid node configuration, duplicate ids,
 * dangling edge references, unknown ports, duplicate connections to one
 * input port, port type incompatibility, missing required inputs, cycles.
 */
export function validateWorkflow(graph: WorkflowGraph): ValidationIssue[] {
  const { nodes, edges } = graph;
  const issues: ValidationIssue[] = [];
  const nodeById = new Map<string, FlowNode>();
  const seenNodeIds = new Set<string>();

  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      issues.push({ code: 'duplicate-node-id', message: `Duplicate node id "${node.id}".`, nodeId: node.id });
      continue;
    }
    seenNodeIds.add(node.id);
    nodeById.set(node.id, node);

    if (!isKnownNodeType(node.type)) {
      issues.push({
        code: 'unknown-node-type',
        message: `Node "${node.id}" has unknown type "${String(node.type)}".`,
        nodeId: node.id,
      });
      continue;
    }
    for (const err of validateNodeConfig(node)) {
      issues.push({
        code: 'invalid-node-config',
        message: `Node "${labelOf(node)}": ${err}.`,
        nodeId: node.id,
      });
    }
  }

  const seenEdgeIds = new Set<string>();
  const edgesByTargetInput = new Map<string, FlowEdge>();

  for (const edge of edges) {
    if (!edge.id || seenEdgeIds.has(edge.id)) {
      issues.push({
        code: 'duplicate-edge-id',
        message: `Duplicate or empty edge id "${edge.id}".`,
        edgeId: edge.id,
      });
      continue;
    }
    seenEdgeIds.add(edge.id);

    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source) {
      issues.push({
        code: 'unknown-edge-node',
        message: `Edge connects from unknown node "${edge.source}".`,
        edgeId: edge.id,
      });
      continue;
    }
    if (!target) {
      issues.push({
        code: 'unknown-edge-node',
        message: `Edge connects to unknown node "${edge.target}".`,
        edgeId: edge.id,
      });
      continue;
    }
    if (!isKnownNodeType(source.type) || !isKnownNodeType(target.type)) continue;

    const sourcePort = getPortDef(source, edge.sourceHandle, 'output');
    const targetPort = getPortDef(target, edge.targetHandle, 'input');
    if (!sourcePort) {
      issues.push({
        code: 'unknown-port',
        message: `Node "${labelOf(source)}" has no output port "${edge.sourceHandle}".`,
        nodeId: source.id,
        edgeId: edge.id,
      });
      continue;
    }
    if (!targetPort) {
      issues.push({
        code: 'unknown-port',
        message: `Node "${labelOf(target)}" has no input port "${edge.targetHandle}".`,
        nodeId: target.id,
        edgeId: edge.id,
      });
      continue;
    }
    if (!arePortsCompatible(sourcePort.type, targetPort.type)) {
      issues.push({
        code: 'incompatible-ports',
        message: `Cannot connect ${sourcePort.type} output "${sourcePort.label}" of "${labelOf(source)}" to ${targetPort.type} input "${targetPort.label}" of "${labelOf(target)}".`,
        nodeId: target.id,
        edgeId: edge.id,
      });
    }
    const key = `${edge.target}:${edge.targetHandle}`;
    if (edgesByTargetInput.has(key)) {
      issues.push({
        code: 'duplicate-input-connection',
        message: `Input "${targetPort.label}" of "${labelOf(target)}" already has a connection.`,
        nodeId: target.id,
        edgeId: edge.id,
      });
    } else {
      edgesByTargetInput.set(key, edge);
    }
  }

  // Required inputs must be connected.
  for (const node of nodes) {
    if (!isKnownNodeType(node.type)) continue;
    const def = getNodeDefinition(node.type);
    for (const port of def.inputs) {
      if (!port.required) continue;
      if (!edgesByTargetInput.has(`${node.id}:${port.id}`)) {
        issues.push({
          code: 'missing-required-input',
          message: `Node "${labelOf(node)}" is missing a connection on required input "${port.label}".`,
          nodeId: node.id,
        });
      }
    }
  }

  const cycle = findCycle(nodes, edges);
  if (cycle) {
    issues.push({
      code: 'cycle-detected',
      message: `Workflow contains a cycle: ${cycle.map((id) => `"${labelOf(nodeById.get(id) ?? { id } as FlowNode)}"`).join(' → ')}.`,
    });
  }

  // Dead ends: nodes that produce values nobody consumes. Warnings only —
  // they don't block execution. Output and Note nodes are natural sinks.
  const SINK_TYPES = new Set(['output', 'note']);
  const hasOutgoing = new Set(edges.map((e) => e.source));
  for (const node of nodes) {
    if (!isKnownNodeType(node.type)) continue;
    if (SINK_TYPES.has(node.type)) continue;
    const def = getNodeDefinition(node.type);
    if (def.outputs.length === 0) continue;
    if (!hasOutgoing.has(node.id)) {
      issues.push({
        code: 'dead-end',
        severity: 'warning',
        message: `Node "${labelOf(node)}" produces a value that nothing consumes.`,
        nodeId: node.id,
      });
    }
  }

  return issues;
}

function labelOf(node: FlowNode): string {
  return node.label?.trim() ? node.label : `${getNodeTitleSafe(node)} (${node.id.slice(0, 6)})`;
}

function getNodeTitleSafe(node: FlowNode): string {
  return isKnownNodeType(node.type) ? getNodeDefinition(node.type).title : String(node.type);
}

/** Throw if the workflow graph is invalid. */
export function assertValidWorkflow(graph: WorkflowGraph): void {
  const errors = validateWorkflow(graph).filter((i) => i.severity !== 'warning');
  if (errors.length > 0) {
    throw new WorkflowValidationError(errors);
  }
}

// ---------------------------------------------------------------------------
// Topological ordering + cycle detection
// ---------------------------------------------------------------------------

export type TopoResult = { order: string[] } | { order: null; cycle: string[] };

/**
 * Kahn's algorithm. Returns a valid execution order, or the nodes forming a
 * cycle when the graph is not a DAG.
 */
export function topologicalOrder(graph: WorkflowGraph): TopoResult {
  const { nodes, edges } = graph;
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) continue;
    // Ignore self-loops and duplicate edges for degree counting beyond 1.
    if (edge.source === edge.target) {
      const cycle = findCycle(nodes, edges);
      return { order: null, cycle: cycle ?? [edge.source] };
    }
    outgoing.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    // Sort for deterministic output regardless of insertion order.
    queue.sort();
    const id = queue.shift() as string;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (order.length !== nodes.length) {
    const cycle = findCycle(nodes, edges);
    return { order: null, cycle: cycle ?? [] };
  }
  return { order };
}

/** Depth-first search for a cycle; returns the node ids forming one, if any. */
export function findCycle(graph: WorkflowGraph): string[] | null;
export function findCycle(nodes: FlowNode[], edges: FlowEdge[]): string[] | null;
export function findCycle(
  graphOrNodes: WorkflowGraph | FlowNode[],
  edges?: FlowEdge[],
): string[] | null {
  const nodes = Array.isArray(graphOrNodes) ? graphOrNodes : graphOrNodes.nodes;
  const edgeList = Array.isArray(graphOrNodes) ? (edges ?? []) : graphOrNodes.edges;
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edgeList) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)?.push(edge.target);
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        return [...stack.slice(stack.indexOf(next)), next];
      }
      if (c === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };

  for (const node of nodes) {
    if ((color.get(node.id) ?? WHITE) === WHITE) {
      const found = visit(node.id);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Connection validation (used by the editor before creating an edge)
// ---------------------------------------------------------------------------

/**
 * Check whether a new connection is allowed. Does not mutate the graph.
 * `proposedEdge` carries source/sourceHandle/target/targetHandle (id ignored).
 */
export function canConnect(
  graph: WorkflowGraph,
  proposedEdge: { source: string; sourceHandle: string; target: string; targetHandle: string },
): ConnectCheck {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const source = nodeById.get(proposedEdge.source);
  const target = nodeById.get(proposedEdge.target);

  if (!source || !target) return { ok: false, reason: 'Unknown node.' };
  if (source.id === target.id) return { ok: false, reason: 'A node cannot connect to itself.' };
  if (!isKnownNodeType(source.type) || !isKnownNodeType(target.type)) {
    return { ok: false, reason: 'Unknown node type.' };
  }

  const sourcePort = getPortDef(source, proposedEdge.sourceHandle, 'output');
  const targetPort = getPortDef(target, proposedEdge.targetHandle, 'input');
  if (!sourcePort) return { ok: false, reason: `No output port "${proposedEdge.sourceHandle}".` };
  if (!targetPort) return { ok: false, reason: `No input port "${proposedEdge.targetHandle}".` };

  if (!arePortsCompatible(sourcePort.type, targetPort.type)) {
    return {
      ok: false,
      reason: `Type mismatch: cannot connect ${sourcePort.type} to ${targetPort.type}.`,
    };
  }

  const existing = graph.edges.some(
    (e) => e.target === target.id && e.targetHandle === targetPort.id,
  );
  if (existing) {
    return { ok: false, reason: `Input "${targetPort.label}" already has a connection.` };
  }

  const duplicate = graph.edges.some(
    (e) =>
      e.source === source.id &&
      e.sourceHandle === sourcePort.id &&
      e.target === target.id &&
      e.targetHandle === targetPort.id,
  );
  if (duplicate) return { ok: false, reason: 'These ports are already connected.' };

  if (wouldCreateCycle(graph, source.id, target.id)) {
    return { ok: false, reason: 'This connection would create a cycle.' };
  }

  return { ok: true };
}

/** Would an edge source→target create a cycle? I.e. is target already upstream of source? */
function wouldCreateCycle(graph: WorkflowGraph, sourceId: string, targetId: string): boolean {
  // A new edge source→target creates a cycle iff target can already reach source.
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);

  const visited = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Execution engine
// ---------------------------------------------------------------------------

let runCounter = 0;

function nextRunId(): string {
  runCounter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${runCounter}`;
}

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Execute a workflow graph.
 *
 * Semantics:
 * - Nodes run in topological order (a valid DAG is required).
 * - A node executes only when every required input has received a value.
 * - Condition nodes activate exactly one output branch; nodes on the
 *   inactive branch (and anything downstream that misses inputs) are
 *   marked `skipped`, not failed.
 * - A node that throws (e.g. division by zero) is marked `error`;
 *   independent branches keep running and downstream nodes are skipped.
 * - Execution can be aborted via `opts.signal`; remaining nodes are skipped.
 *
 * @throws {WorkflowValidationError} when the graph is invalid.
 */
export async function executeWorkflow(
  graph: WorkflowGraph,
  opts: ExecuteOptions = {},
): Promise<ExecutionResult> {
  assertValidWorkflow(graph);

  const topo = topologicalOrder(graph);
  if (topo.order === null) {
    // Unreachable after validation, but guard anyway.
    throw new WorkflowValidationError([
      { code: 'cycle-detected', message: 'Workflow contains a cycle.' },
    ]);
  }

  const runId = nextRunId();
  const log: LogEntry[] = [];
  let seq = 0;
  const addLog = (level: LogLevel, message: string, nodeId: string | null = null): void => {
    seq += 1;
    log.push({
      seq,
      timestamp: new Date().toISOString(),
      nodeId,
      level,
      message,
    });
  };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const results: Record<string, NodeRunResult> = {};
  const portValues = new Map<string, PortValue>();
  const activeEdges = new Set(graph.edges.map((e) => e.id));
  const edgesByTargetInput = new Map<string, FlowEdge>();
  for (const edge of graph.edges) {
    edgesByTargetInput.set(`${edge.target}:${edge.targetHandle}`, edge);
  }

  addLog('info', `Run started — ${graph.nodes.length} node(s), ${graph.edges.length} edge(s).`);

  // Internal controller: aborted by the caller's signal or by the run timeout.
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  let aborted = false;
  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      addLog('warn', `Run timed out after ${timeoutMs} ms.`);
      controller.abort();
    }, timeoutMs);
  }
  const runStartedAt = performance.now();

  for (const nodeId of topo.order) {
    if (controller.signal.aborted) {
      aborted = true;
      if (!timedOut) addLog('warn', 'Run aborted by user.');
      break;
    }

    const node = nodeById.get(nodeId);
    if (!node) continue;
    const def = getNodeDefinition(node.type);
    const nodeLabel = labelOf(node);

    // Gather inputs: required ones gate execution, optional ones are
    // included when a live edge provides a value.
    const inputs: Record<string, PortValue> = {};
    let ready = true;
    let skipReason: string | null = null;
    for (const port of def.inputs) {
      const edge = edgesByTargetInput.get(`${nodeId}:${port.id}`);
      const live = edge && activeEdges.has(edge.id);
      if (!port.required) {
        if (live) {
          const value = portValues.get(`${edge.source}:${edge.sourceHandle}`);
          if (value !== undefined) inputs[port.id] = value;
        }
        continue;
      }
      if (!live) {
        ready = false;
        skipReason = `input "${port.label}" is on an inactive branch`;
        break;
      }
      const value = portValues.get(`${edge.source}:${edge.sourceHandle}`);
      if (value === undefined) {
        ready = false;
        skipReason = `input "${port.label}" received no value (upstream node did not produce one)`;
        break;
      }
      inputs[port.id] = value;
    }

    if (!ready) {
      results[nodeId] = { status: 'skipped', outputs: {}, error: null, durationMs: 0 };
      addLog('info', `Skipped "${nodeLabel}" — ${skipReason}.`, nodeId);
      opts.onNodeUpdate?.(nodeId, results[nodeId]);
      continue;
    }

    opts.onNodeUpdate?.(nodeId, null);
    const startedAt = performance.now();
    try {
      const produced = await def.execute(inputs, node.data, {
        signal: controller.signal,
        nodeId,
        runId,
      });
      const durationMs = performance.now() - startedAt;
      for (const [portId, value] of Object.entries(produced.outputs)) {
        portValues.set(`${nodeId}:${portId}`, value);
      }
      // Branching: deactivate edges leaving through inactive outputs.
      if (produced.activeOutputs) {
        const active = new Set(produced.activeOutputs);
        for (const edge of graph.edges) {
          if (edge.source === nodeId && !active.has(edge.sourceHandle)) {
            activeEdges.delete(edge.id);
          }
        }
        addLog(
          'info',
          `"${nodeLabel}" routed through the "${produced.activeOutputs.join(', ')}" branch.`,
          nodeId,
        );
      }
      results[nodeId] = { status: 'success', outputs: produced.outputs, error: null, durationMs };
      const summary = Object.entries(produced.outputs)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`)
        .join(', ');
      addLog('info', `"${nodeLabel}" succeeded${summary ? ` — ${summary}` : ''}.`, nodeId);
    } catch (err) {
      const durationMs = performance.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      results[nodeId] = { status: 'error', outputs: {}, error: message, durationMs };
      addLog('error', `"${nodeLabel}" failed: ${message}`, nodeId);
    }
    opts.onNodeUpdate?.(nodeId, results[nodeId]);

    // Let the UI paint and allow abort between nodes.
    await yieldToEventLoop();
  }

  // Anything not visited (e.g. after abort) is skipped.
  for (const node of graph.nodes) {
    if (!results[node.id]) {
      results[node.id] = { status: 'skipped', outputs: {}, error: null, durationMs: 0 };
      opts.onNodeUpdate?.(node.id, results[node.id]);
    }
  }

  const errorCount = Object.values(results).filter((r) => r.status === 'error').length;
  const skippedCount = Object.values(results).filter((r) => r.status === 'skipped').length;
  const successCount = Object.values(results).filter((r) => r.status === 'success').length;
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  const totalDurationMs = performance.now() - runStartedAt;
  const outcome = aborted ? (timedOut ? 'timed out' : 'aborted') : 'finished';
  addLog(
    errorCount > 0 ? 'error' : 'info',
    `Run ${outcome} — ${successCount} succeeded, ${errorCount} failed, ${skippedCount} skipped (${Math.round(totalDurationMs)} ms).`,
  );

  return {
    runId,
    nodeResults: results,
    log,
    hasErrors: errorCount > 0,
    aborted,
    timedOut,
    totalDurationMs,
    edgeValues: Object.fromEntries(
      graph.edges.flatMap((edge) => {
        const value = portValues.get(`${edge.source}:${edge.sourceHandle}`);
        return value === undefined ? [] : [[edge.id, value] as const];
      }),
    ),
  };
}
