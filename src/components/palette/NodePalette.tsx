import { useMemo, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { JSX } from 'react';
import { getAllNodeDefinitions } from '../../lib/workflow/nodeRegistry.ts';
import type { NodeDefinition } from '../../lib/workflow/nodeRegistry.ts';
import { NODE_CATEGORIES } from '../../lib/workflow/types.ts';
import type { NodeTypeId } from '../../lib/workflow/types.ts';

/** Window event used to add a node from the palette to the canvas. */
export const ADD_NODE_EVENT = 'flowlab:add-node';

/** Ask the canvas to add a node of the given type at the viewport center. */
export function dispatchAddNode(type: NodeTypeId): void {
  window.dispatchEvent(new CustomEvent(ADD_NODE_EVENT, { detail: { type } }));
}

/** Accent color per category, shared with node cards via CSS. */
export const CATEGORY_COLORS: Record<string, string> = {
  Input: '#3b82f6',
  Transform: '#8b5cf6',
  Logic: '#f59e0b',
  Utility: '#14b8a6',
  Output: '#22c55e',
};

function PaletteItem({ def }: { def: NodeDefinition }): JSX.Element {
  const onDragStart = (event: DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.setData('application/flowlab-node-type', def.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dispatchAddNode(def.type);
    }
  };

  return (
    <div
      className="palette-item"
      data-testid="palette-item"
      data-node-type={def.type}
      data-category={def.category}
      style={{ ['--cat-color' as string]: CATEGORY_COLORS[def.category] }}
      role="button"
      tabIndex={0}
      aria-label={`Add ${def.title} node`}
      title={`${def.title} — ${def.description}`}
      draggable
      onDragStart={onDragStart}
      onClick={() => dispatchAddNode(def.type)}
      onKeyDown={onKeyDown}
    >
      <div className="palette-item-title">{def.title}</div>
      <div className="palette-item-desc">{def.description}</div>
    </div>
  );
}

interface NodePaletteProps {
  open: boolean;
}

export function NodePalette({ open }: NodePaletteProps): JSX.Element {
  const [query, setQuery] = useState('');
  const definitions = useMemo(() => getAllNodeDefinitions(), []);

  const normalized = query.trim().toLowerCase();
  const filtered =
    normalized === ''
      ? definitions
      : definitions.filter((def) =>
          [def.title, def.description, def.category, ...def.keywords].some((text) =>
            text.toLowerCase().includes(normalized),
          ),
        );

  return (
    <aside
      className={`palette${open ? ' open' : ''}`}
      aria-label="Node palette"
      data-testid="node-palette"
    >
      <div className="palette-header">
        <div className="palette-title">Nodes</div>
        <input
          type="search"
          className="input"
          data-testid="palette-search"
          aria-label="Search nodes"
          placeholder="Search nodes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="palette-items">
        {filtered.length === 0 && (
          <p className="palette-empty">No nodes match your search.</p>
        )}
        {NODE_CATEGORIES.map((category) => {
          const items = filtered.filter((def) => def.category === category);
          if (items.length === 0) return null;
          return (
            <section
              key={category}
              className="palette-category"
              aria-label={`${category} nodes`}
              data-testid={`palette-category-${category}`}
            >
              <h3 className="palette-category-title">{category}</h3>
              {items.map((def) => (
                <PaletteItem key={def.type} def={def} />
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
