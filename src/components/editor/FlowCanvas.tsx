import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { JSX } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  getExampleWorkflows,
  useFlowStore,
} from '../../lib/store/useFlowStore.ts';
import { isKnownNodeType } from '../../lib/workflow/nodeRegistry.ts';
import { ADD_NODE_EVENT } from '../palette/NodePalette.tsx';
import { FlowNodeCard } from './FlowNodeCard.tsx';
import { DragHandleContext } from './DragHandleContext.tsx';

const nodeTypes: NodeTypes = { flowNode: FlowNodeCard };


function FlowCanvasInner(): JSX.Element {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const theme = useFlowStore((s) => s.theme);
  const edgeValues = useFlowStore((s) => s.edgeValues);

  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const onNodeDragStop = useFlowStore((s) => s.onNodeDragStop);
  const addNode = useFlowStore((s) => s.addNode);
  const loadExample = useFlowStore((s) => s.loadExample);
  const importWorkflow = useFlowStore((s) => s.importWorkflow);
  const pushToast = useFlowStore((s) => s.pushToast);

  // Edges carry their last transmitted value as a label after a run (#17).
  const edgesWithLabels = useMemo(
    () =>
      edges.map((edge) => {
        const value = edgeValues[edge.id];
        return value ? { ...edge, label: value } : edge;
      }),
    [edges, edgeValues],
  );

  // Track an in-progress connection drag to highlight compatible handles (#20).
  const [dragHandle, setDragHandle] = useState<{
    nodeId: string;
    handleId: string | null;
    kind: 'source' | 'target';
  } | null>(null);

  const examples = useMemo(() => getExampleWorkflows(), []);
  const reactFlow = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cascadeRef = useRef(0);

  /** Add a node at the given client (screen) coordinates. */
  const placeNode = useCallback(
    (type: string, clientX: number, clientY: number) => {
      if (!isKnownNodeType(type)) return;
      const position = reactFlow.screenToFlowPosition({ x: clientX, y: clientY });
      addNode(type, position);
    },
    [reactFlow, addNode],
  );

  // Click-to-add from the palette: place the node near the viewport center,
  // cascading slightly so repeated clicks do not stack nodes exactly.
  useEffect(() => {
    const onAddNode = (event: Event): void => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (!type) return;
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const step = cascadeRef.current % 6;
      cascadeRef.current += 1;
      placeNode(
        type,
        rect.left + rect.width / 2 + step * 28,
        rect.top + rect.height / 2 + step * 28,
      );
    };
    window.addEventListener(ADD_NODE_EVENT, onAddNode);
    return () => {
      window.removeEventListener(ADD_NODE_EVENT, onAddNode);
    };
  }, [placeNode]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      // Dropped workflow files import directly onto the canvas (#24).
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (/\.json$/i.test(file.name)) {
          void importWorkflow(file);
          return;
        }
        pushToast('error', 'Only .json workflow files can be dropped here.');
        return;
      }
      const type = event.dataTransfer.getData('application/flowlab-node-type');
      if (!type) return;
      placeNode(type, event.clientX, event.clientY);
    },
    [placeNode, importWorkflow, pushToast],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="canvas-wrapper" data-testid="flow-canvas" ref={wrapperRef}>
      <DragHandleContext.Provider value={dragHandle}>
      <ReactFlow
        nodes={nodes}
        edges={edgesWithLabels}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={(_event, params) =>
          setDragHandle({
            nodeId: params.nodeId ?? '',
            handleId: params.handleId ?? null,
            kind: params.handleType === 'source' ? 'source' : 'target',
          })
        }
        onConnectEnd={() => setDragHandle(null)}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={null}
        colorMode={theme === 'dark' ? 'dark' : 'light'}
      >
        <Background gap={16} />
        <MiniMap pannable zoomable className="flow-minimap" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      </DragHandleContext.Provider>

      {nodes.length === 0 && (
        <div className="empty-canvas" data-testid="empty-canvas">
          <div className="empty-canvas-card">
            <h2>Start building your workflow</h2>
            <p>
              Drag nodes from the palette onto the canvas, or load an example
              workflow to explore and run.
            </p>
            <div className="empty-canvas-examples">
              {examples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  className="btn"
                  data-testid={`load-example-${example.id}`}
                  onClick={() => {
                    void loadExample(example.id);
                  }}
                >
                  {example.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlowCanvas(): JSX.Element {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
