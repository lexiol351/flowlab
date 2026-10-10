import { useState } from 'react';
import type { JSX } from 'react';
import { getNodeDefinition } from '../../lib/workflow/nodeRegistry.ts';
import type { ConfigFieldDef } from '../../lib/workflow/nodeRegistry.ts';
import type { AppNode } from '../../lib/workflow/reactflow.ts';
import { useFlowStore } from '../../lib/store/useFlowStore.ts';
import './panels.css';

const STATUS_BADGE_CLASS: Record<string, string> = {
  idle: 'fl-badge fl-badge-idle',
  running: 'fl-badge fl-badge-running',
  success: 'fl-badge fl-badge-success',
  error: 'fl-badge fl-badge-error',
  skipped: 'fl-badge fl-badge-skipped',
};

function formatOutputValue(value: string | number): string {
  return JSON.stringify(value);
}

function ConfigField({
  node,
  field,
}: {
  node: AppNode;
  field: ConfigFieldDef;
}): JSX.Element {
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const value = node.data.config[field.key];
  const inputId = `fl-config-${node.id}-${field.key}`;
  const patch = (next: unknown): void => {
    updateNodeConfig(node.id, { [field.key]: next });
  };

  let control: JSX.Element;
  switch (field.kind) {
    case 'textarea':
      control = (
        <textarea
          id={inputId}
          aria-label={field.label}
          className="fl-textarea"
          rows={3}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => patch(e.target.value)}
        />
      );
      break;
    case 'number':
      control = (
        <input
          id={inputId}
          aria-label={field.label}
          type="number"
          className="fl-input"
          placeholder={field.placeholder}
          value={typeof value === 'number' && !Number.isNaN(value) ? value : 0}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            patch(Number.isNaN(next) ? 0 : next);
          }}
        />
      );
      break;
    case 'select':
      control = (
        <select
          id={inputId}
          aria-label={field.label}
          className="fl-select"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => patch(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      control = (
        <div className="fl-checkrow">
          <input
            id={inputId}
            aria-label={field.label}
            type="checkbox"
            className="fl-checkbox"
            checked={value === true}
            onChange={(e) => patch(e.target.checked)}
          />
          <label htmlFor={inputId} className="fl-field-label">
            {field.label}
          </label>
        </div>
      );
      break;
    case 'text':
    default:
      control = (
        <input
          id={inputId}
          aria-label={field.label}
          type="text"
          className="fl-input"
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => patch(e.target.value)}
        />
      );
      break;
  }

  return (
    <div className="fl-field" data-testid="config-field" data-field-key={field.key}>
      {field.kind !== 'checkbox' && (
        <label htmlFor={inputId} className="fl-field-label">
          {field.label}
        </label>
      )}
      {control}
      {field.helpText && <span className="fl-field-hint">{field.helpText}</span>}
    </div>
  );
}

function NodePropertiesForm({ node }: { node: AppNode }): JSX.Element {
  const setNodeLabel = useFlowStore((s) => s.setNodeLabel);
  const deleteNodes = useFlowStore((s) => s.deleteNodes);
  const nodeStatuses = useFlowStore((s) => s.nodeStatuses);
  const nodeOutputs = useFlowStore((s) => s.nodeOutputs);
  const executionLog = useFlowStore((s) => s.executionLog);
  const validationIssues = useFlowStore((s) => s.validationIssues);
  const validationWarnings = useFlowStore((s) => s.validationWarnings);

  // Local draft committed on blur/Enter so typing does not spam history.
  const [labelDraft, setLabelDraft] = useState(node.data.label ?? '');

  const def = getNodeDefinition(node.data.nodeType);
  const visibleFields = def.configFields.filter(
    (f) => !f.visibleWhen || f.visibleWhen(node.data.config ?? {}),
  );
  const status = nodeStatuses[node.id];
  const lastError = [...executionLog]
    .reverse()
    .find((entry) => entry.nodeId === node.id && entry.level === 'error');
  const outputs = nodeOutputs[node.id];
  const nodeIssues = validationIssues.filter((issue) => issue.nodeId === node.id);
  const nodeWarnings = validationWarnings.filter((issue) => issue.nodeId === node.id);

  const commitLabel = (): void => {
    if (labelDraft !== (node.data.label ?? '')) {
      setNodeLabel(node.id, labelDraft);
    }
  };

  return (
    <div className="fl-panel-body">
      <div>
        <h3 className="fl-panel-title">{def.title}</h3>
        <p className="fl-field-hint">{def.description}</p>
      </div>

      <div className="fl-field">
        <label htmlFor={`fl-label-${node.id}`} className="fl-field-label">
          Node label
        </label>
        <input
          id={`fl-label-${node.id}`}
          data-testid="node-label-input"
          aria-label="Node label"
          type="text"
          className="fl-input"
          placeholder={def.title}
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </div>

      {visibleFields.length > 0 && (
        <section aria-label="Configuration">
          <h4 className="fl-section-title">Configuration</h4>
          {visibleFields.map((field) => (
            <ConfigField key={field.key} node={node} field={field} />
          ))}
        </section>
      )}

      <hr className="fl-divider" />

      <section aria-label="Status">
        <h4 className="fl-section-title">Status</h4>
        {status ? (
          <span className={STATUS_BADGE_CLASS[status] ?? 'fl-badge fl-badge-idle'}>{status}</span>
        ) : (
          <span className="fl-field-hint">Not run yet</span>
        )}
        {lastError && <p className="fl-error-item">{lastError.message}</p>}
      </section>

      {outputs && Object.keys(outputs).length > 0 && (
        <section aria-label="Last outputs" data-testid="node-last-outputs">
          <h4 className="fl-section-title">Last outputs</h4>
          <div className="fl-kv-list">
            {Object.entries(outputs).map(([port, value]) => (
              <div key={port} className="fl-kv-row">
                <span className="fl-kv-key">{port}</span>
                <span className="fl-kv-value">
                  {formatOutputValue(value)}{' '}
                  <span className="fl-kv-type">({typeof value})</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {nodeIssues.length > 0 && (
        <section aria-label="Validation issues">
          <h4 className="fl-section-title">Validation issues</h4>
          <ul className="fl-error-list">
            {nodeIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="fl-error-item">
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {nodeWarnings.length > 0 && (
        <section aria-label="Validation warnings">
          <h4 className="fl-section-title">Warnings</h4>
          <ul className="fl-warning-list">
            {nodeWarnings.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="fl-warning-item">
                ⚠ {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <hr className="fl-divider" />

      <button
        type="button"
        className="fl-btn fl-btn-danger"
        data-testid="delete-node-button"
        onClick={() => deleteNodes([node.id])}
      >
        Delete node
      </button>
    </div>
  );
}

export function PropertiesPanel(): JSX.Element {
  const nodes = useFlowStore((s) => s.nodes);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const node = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="fl-panel" data-testid="properties-panel">
      <div className="fl-panel-header">
        <h2 className="fl-panel-title">Properties</h2>
      </div>
      {node ? (
        <NodePropertiesForm key={node.id} node={node} />
      ) : (
        <div className="fl-empty" data-testid="empty-selection">
          <p>Select a node to edit its properties.</p>
        </div>
      )}
    </div>
  );
}
