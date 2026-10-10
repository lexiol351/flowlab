import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import { canConnect } from '../../lib/workflow/engine.ts';
import { getNodeDefinition } from '../../lib/workflow/nodeRegistry.ts';
import { appGraphToWorkflowGraph } from '../../lib/workflow/reactflow.ts';
import '../panels/panels.css';

function ConnectDialogForm({ onClose }: { onClose: () => void }): JSX.Element {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onConnect = useFlowStore((s) => s.onConnect);

  const [sourceNodeId, setSourceNodeId] = useState('');
  const [sourcePortId, setSourcePortId] = useState('');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [targetPortId, setTargetPortId] = useState('');

  const sourceNodes = useMemo(
    () => nodes.filter((n) => getNodeDefinition(n.data.nodeType).outputs.length > 0),
    [nodes],
  );
  const targetNodes = useMemo(
    () =>
      nodes.filter(
        (n) => n.id !== sourceNodeId && getNodeDefinition(n.data.nodeType).inputs.length > 0,
      ),
    [nodes, sourceNodeId],
  );

  const sourceNode = sourceNodes.find((n) => n.id === sourceNodeId) ?? null;
  const targetNode = targetNodes.find((n) => n.id === targetNodeId) ?? null;
  const sourcePorts = sourceNode ? getNodeDefinition(sourceNode.data.nodeType).outputs : [];
  const targetPorts = targetNode ? getNodeDefinition(targetNode.data.nodeType).inputs : [];

  const check = useMemo(() => {
    if (!sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return null;
    return canConnect(appGraphToWorkflowGraph(nodes, edges), {
      source: sourceNodeId,
      sourceHandle: sourcePortId,
      target: targetNodeId,
      targetHandle: targetPortId,
    });
  }, [sourceNodeId, sourcePortId, targetNodeId, targetPortId, nodes, edges]);

  const handleSourceNodeChange = (id: string): void => {
    setSourceNodeId(id);
    const node = nodes.find((n) => n.id === id);
    const firstPort = node ? getNodeDefinition(node.data.nodeType).outputs[0] : undefined;
    setSourcePortId(firstPort?.id ?? '');
    if (id !== '' && id === targetNodeId) {
      setTargetNodeId('');
      setTargetPortId('');
    }
  };

  const handleTargetNodeChange = (id: string): void => {
    setTargetNodeId(id);
    const node = nodes.find((n) => n.id === id);
    const firstPort = node ? getNodeDefinition(node.data.nodeType).inputs[0] : undefined;
    setTargetPortId(firstPort?.id ?? '');
  };

  const nodeLabel = (nodeId: string): string => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return nodeId;
    const def = getNodeDefinition(node.data.nodeType);
    return `${def.title} (${node.data.label || node.id})`;
  };

  const validationClass = check
    ? check.ok
      ? 'fl-validation fl-validation-ok'
      : 'fl-validation fl-validation-error'
    : 'fl-validation fl-validation-idle';
  const validationText = check
    ? (check.ok ? 'Ready to connect.' : (check.reason ?? 'Connection not allowed.'))
    : 'Select a source, ports, and target to validate the connection.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fl-connect-title"
      data-testid="connect-dialog"
      className="fl-dialog"
    >
      <div className="fl-dialog-header">
        <h2 id="fl-connect-title" className="fl-dialog-title">
          Connect nodes
        </h2>
        <button
          type="button"
          className="fl-btn fl-btn-ghost fl-btn-sm"
          aria-label="Close connect dialog"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="fl-dialog-body">
        <div className="fl-form-grid">
          <div className="fl-field">
            <label htmlFor="fl-connect-source-node" className="fl-field-label">
              Source node
            </label>
            <select
              id="fl-connect-source-node"
              data-testid="connect-source-node"
              className="fl-select"
              value={sourceNodeId}
              onChange={(e) => handleSourceNodeChange(e.target.value)}
            >
              <option value="">Select source node…</option>
              {sourceNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {nodeLabel(n.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="fl-field">
            <label htmlFor="fl-connect-source-port" className="fl-field-label">
              Source port
            </label>
            <select
              id="fl-connect-source-port"
              data-testid="connect-source-port"
              className="fl-select"
              value={sourcePortId}
              disabled={!sourceNode}
              onChange={(e) => setSourcePortId(e.target.value)}
            >
              <option value="">Select port…</option>
              {sourcePorts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.type})
                </option>
              ))}
            </select>
          </div>
          <div className="fl-field">
            <label htmlFor="fl-connect-target-node" className="fl-field-label">
              Target node
            </label>
            <select
              id="fl-connect-target-node"
              data-testid="connect-target-node"
              className="fl-select"
              value={targetNodeId}
              onChange={(e) => handleTargetNodeChange(e.target.value)}
            >
              <option value="">Select target node…</option>
              {targetNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {nodeLabel(n.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="fl-field">
            <label htmlFor="fl-connect-target-port" className="fl-field-label">
              Target port
            </label>
            <select
              id="fl-connect-target-port"
              data-testid="connect-target-port"
              className="fl-select"
              value={targetPortId}
              disabled={!targetNode}
              onChange={(e) => setTargetPortId(e.target.value)}
            >
              <option value="">Select port…</option>
              {targetPorts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          data-testid="connect-validation"
          role="status"
          aria-live="polite"
          className={validationClass}
        >
          {validationText}
        </div>
      </div>
      <div className="fl-dialog-actions">
        <button type="button" className="fl-btn fl-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="fl-btn fl-btn-primary"
          data-testid="connect-confirm"
          disabled={!check?.ok}
          onClick={() => {
            onConnect({
              source: sourceNodeId,
              sourceHandle: sourcePortId,
              target: targetNodeId,
              targetHandle: targetPortId,
            });
            onClose();
          }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

/**
 * Keyboard-friendly way to create connections without mouse dragging.
 * Validates the proposed connection live with the engine's canConnect.
 */
export function ConnectDialog(): JSX.Element | null {
  const open = useFlowStore((s) => s.connectDialogOpen);
  const setOpen = useFlowStore((s) => s.setConnectDialogOpen);

  // Remount the form on every open so the selects reset.
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const close = (): void => setOpen(false);

  return (
    <div
      className="fl-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <ConnectDialogForm key={session} onClose={close} />
    </div>
  );
}
