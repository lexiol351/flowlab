import type { JSX } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { arePortsCompatible, getNodeDefinition } from '../../lib/workflow/nodeRegistry.ts';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import type { AppNode } from '../../lib/workflow/reactflow.ts';
import type { PortDef, PortValue } from '../../lib/workflow/types.ts';
import { CATEGORY_COLORS } from '../palette/NodePalette.tsx';
import { useDragHandle } from './DragHandleContext.tsx';

function formatPortValue(value: PortValue): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** CSS class for a handle while a connection is being dragged. */
function handleDragClass(
  drag: ReturnType<typeof useDragHandle>,
  nodeId: string,
  nodes: AppNode[],
  port: PortDef,
  kind: 'source' | 'target',
): string {
  if (!drag || !drag.handleId) return '';
  if (drag.kind === kind) return '';
  if (drag.nodeId === nodeId) return '';
  const sourceNode = nodes.find((n) => n.id === drag.nodeId);
  if (!sourceNode) return '';
  const sourceDef = getNodeDefinition(sourceNode.data.nodeType);
  const sourcePorts = drag.kind === 'source' ? sourceDef.outputs : sourceDef.inputs;
  const sourcePort = sourcePorts.find((p) => p.id === drag.handleId);
  if (!sourcePort) return '';
  const compatible =
    kind === 'target'
      ? arePortsCompatible(sourcePort.type, port.type)
      : arePortsCompatible(port.type, sourcePort.type);
  return compatible ? 'port-handle-compatible' : 'port-handle-incompatible';
}

export function FlowNodeCard({ id, data, selected }: NodeProps<AppNode>): JSX.Element {
  const def = getNodeDefinition(data.nodeType);
  const status = useFlowStore((s) => s.nodeStatuses[id] ?? 'idle');
  const outputs = useFlowStore((s) => s.nodeOutputs[id]);
  const validationIssues = useFlowStore((s) => s.validationIssues);
  const validationWarnings = useFlowStore((s) => s.validationWarnings);
  const nodes = useFlowStore((s) => s.nodes);
  const drag = useDragHandle();

  const nodeIssues = validationIssues.filter((issue) => issue.nodeId === id);
  const nodeWarnings = validationWarnings.filter((issue) => issue.nodeId === id);
  const outputEntries = outputs ? Object.entries(outputs) : [];

  const className = [
    'flow-node',
    `flow-node-cat-${def.category}`,
    `node-status-${status}`,
    selected ? 'is-selected' : '',
    nodeIssues.length > 0 ? 'has-errors' : '',
    nodeWarnings.length > 0 ? 'has-warnings' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      data-testid="flow-node"
      data-node-id={id}
      data-node-type={data.nodeType}
      data-category={def.category}
      style={{ ['--cat-color' as string]: CATEGORY_COLORS[def.category] ?? '#64748b' }}
      aria-label={`${def.title} node`}
    >
      <div className="node-header">
        <span className="node-title">{def.title}</span>
        <span
          className="node-status"
          data-testid="node-status"
          data-status={status}
          title={`Execution status: ${status}`}
        >
          <span className="node-status-dot" aria-hidden="true" />
          <span className="sr-only">{status}</span>
        </span>
      </div>

      {data.label ? <div className="node-custom-label">{data.label}</div> : null}

      <div className="node-summary" data-testid="node-summary">
        {def.summarize(data.config)}
      </div>

      {nodeIssues.length > 0 && (
        <div
          className="node-errors"
          data-testid="node-error"
          role="alert"
          title={nodeIssues.map((issue) => issue.message).join('\n')}
        >
          <span className="node-error-icon" aria-hidden="true">
            !
          </span>
          <span className="sr-only">
            Validation errors: {nodeIssues.map((issue) => issue.message).join(' ')}
          </span>
        </div>
      )}

      {nodeWarnings.length > 0 && nodeIssues.length === 0 && (
        <div
          className="node-warnings"
          data-testid="node-warning"
          title={nodeWarnings.map((issue) => issue.message).join('\n')}
        >
          <span className="node-warning-icon" aria-hidden="true">
            ⚠
          </span>
          <span className="sr-only">
            Warnings: {nodeWarnings.map((issue) => issue.message).join(' ')}
          </span>
        </div>
      )}

      <div className="node-ports">
        {def.inputs.map((port) => (
          <div key={port.id} className="port-row port-row-in">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              className={`port-handle ${handleDragClass(drag, id, nodes, port, 'target')}`}
              data-testid="port-handle"
              data-port-id={port.id}
              data-port-kind="target"
              aria-label={`${port.label} input port`}
              title={`${port.label} (${port.type})${port.required ? ' — required' : ''}`}
            />
            <span className="port-label">
              {port.label}
              {port.required && (
                <span className="port-required" title="Required input">
                  *
                </span>
              )}
            </span>
            <span className="port-type">{port.type}</span>
          </div>
        ))}
        {def.outputs.map((port) => (
          <div key={port.id} className="port-row port-row-out">
            <span className="port-type">{port.type}</span>
            <span className="port-label">{port.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              className={`port-handle ${handleDragClass(drag, id, nodes, port, 'source')}`}
              data-testid="port-handle"
              data-port-id={port.id}
              data-port-kind="source"
              aria-label={`${port.label} output port`}
              title={`${port.label} (${port.type})`}
            />
          </div>
        ))}
      </div>

      {outputEntries.length > 0 && (
        <div className="node-outputs">
          {outputEntries.map(([portId, value]) => (
            <div key={portId} className="node-output" data-testid="node-output">
              {portId}: {formatPortValue(value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
