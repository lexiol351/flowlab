import type { JSX } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getNodeDefinition } from '../../lib/workflow/nodeRegistry.ts';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import type { AppNode } from '../../lib/workflow/reactflow.ts';
import type { PortValue } from '../../lib/workflow/types.ts';

function formatPortValue(value: PortValue): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export function FlowNodeCard({ id, data, selected }: NodeProps<AppNode>): JSX.Element {
  const def = getNodeDefinition(data.nodeType);
  const status = useFlowStore((s) => s.nodeStatuses[id] ?? 'idle');
  const outputs = useFlowStore((s) => s.nodeOutputs[id]);
  const validationIssues = useFlowStore((s) => s.validationIssues);

  const nodeIssues = validationIssues.filter((issue) => issue.nodeId === id);
  const outputEntries = outputs ? Object.entries(outputs) : [];

  const className = [
    'flow-node',
    `flow-node-cat-${def.category}`,
    `node-status-${status}`,
    selected ? 'is-selected' : '',
    nodeIssues.length > 0 ? 'has-errors' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      data-testid="flow-node"
      data-node-id={id}
      data-node-type={data.nodeType}
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

      <div className="node-ports">
        {def.inputs.map((port) => (
          <div key={port.id} className="port-row port-row-in">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              className="port-handle"
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
              className="port-handle"
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
