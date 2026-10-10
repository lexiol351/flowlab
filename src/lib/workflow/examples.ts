import type { FlowEdge, FlowNode, NodeTypeId, WorkflowV1 } from './types.ts';

function node(
  id: string,
  type: NodeTypeId,
  x: number,
  y: number,
  data: Record<string, unknown>,
  label?: string,
): FlowNode {
  return { id, type, position: { x, y }, data, ...(label ? { label } : {}) };
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return { id, source, sourceHandle, target, targetHandle };
}

function makeWorkflow(
  id: string,
  name: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
): WorkflowV1 {
  const now = new Date().toISOString();
  return { version: 1, id, name, createdAt: now, updatedAt: now, nodes, edges };
}

/**
 * Text pipeline: uppercase a name, then merge it with a welcome message.
 * Expected output: "ADA LOVELACE, welcome to FlowLab!"
 */
function greetingStudio(): WorkflowV1 {
  return makeWorkflow(
    'example-greeting-studio',
    'Greeting Studio',
    [
      node('greet-name', 'textInput', 40, 80, { value: 'ada lovelace' }, 'Name'),
      node('greet-shout', 'textTransform', 320, 80, { operation: 'uppercase', text: '' }, 'Shout it'),
      node('greet-msg', 'textInput', 40, 300, { value: 'welcome to FlowLab!' }, 'Message'),
      node('greet-merge', 'mergeText', 600, 170, { separator: ', ' }, 'Combine'),
      node('greet-out', 'output', 880, 170, {}, 'Result'),
    ],
    [
      edge('ge1', 'greet-name', 'value', 'greet-shout', 'in'),
      edge('ge2', 'greet-shout', 'out', 'greet-merge', 'a'),
      edge('ge3', 'greet-msg', 'value', 'greet-merge', 'b'),
      edge('ge4', 'greet-merge', 'out', 'greet-out', 'in'),
    ],
  );
}

/**
 * Numeric pipeline: multiply a unit price by a quantity.
 * Expected output: 19.99 × 3 = 59.97 (floating point: 59.96999999999999).
 */
function priceCalculator(): WorkflowV1 {
  return makeWorkflow(
    'example-price-calculator',
    'Price Calculator',
    [
      node('price-unit', 'numberInput', 40, 80, { value: 19.99 }, 'Unit price'),
      node('price-qty', 'numberInput', 40, 300, { value: 3 }, 'Quantity'),
      node('price-math', 'mathTransform', 320, 170, { operation: 'multiply' }, 'Total'),
      node('price-out', 'output', 600, 170, {}, 'Total price'),
    ],
    [
      edge('pe1', 'price-unit', 'value', 'price-math', 'a'),
      edge('pe2', 'price-qty', 'value', 'price-math', 'b'),
      edge('pe3', 'price-math', 'out', 'price-out', 'in'),
    ],
  );
}

/**
 * Conditional routing: messages containing "urgent" take the priority path.
 * Try changing the input text and re-running to see the other branch.
 */
function smartRouter(): WorkflowV1 {
  return makeWorkflow(
    'example-smart-router',
    'Smart Router',
    [
      node('route-in', 'textInput', 40, 170, { value: 'urgent: server is down' }, 'Incoming message'),
      node(
        'route-cond',
        'condition',
        320,
        170,
        { mode: 'text', textOperator: 'contains', numberOperator: 'greaterThan', compareValue: 'urgent' },
        'Is it urgent?',
      ),
      node(
        'route-flag',
        'textTransform',
        600,
        40,
        { operation: 'prepend', text: '🚨 PRIORITY: ' },
        'Flag it',
      ),
      node('route-out-urgent', 'output', 880, 40, {}, 'Priority inbox'),
      node('route-out-normal', 'output', 880, 300, {}, 'Normal inbox'),
    ],
    [
      edge('re1', 'route-in', 'value', 'route-cond', 'in'),
      edge('re2', 'route-cond', 'true', 'route-flag', 'in'),
      edge('re3', 'route-flag', 'out', 'route-out-urgent', 'in'),
      edge('re4', 'route-cond', 'false', 'route-out-normal', 'in'),
    ],
  );
}

export interface ExampleWorkflow {
  id: string;
  name: string;
  description: string;
  build: () => WorkflowV1;
}

export const EXAMPLE_WORKFLOWS: ExampleWorkflow[] = [
  {
    id: 'example-greeting-studio',
    name: 'Greeting Studio',
    description: 'Uppercase a name and merge it with a welcome message.',
    build: greetingStudio,
  },
  {
    id: 'example-price-calculator',
    name: 'Price Calculator',
    description: 'Multiply a unit price by a quantity.',
    build: priceCalculator,
  },
  {
    id: 'example-smart-router',
    name: 'Smart Router',
    description: 'Route messages through a priority branch when they contain “urgent”.',
    build: smartRouter,
  },
];
