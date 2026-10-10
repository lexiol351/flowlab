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

/**
 * Template mail-merge: build a personalized letter from two inputs.
 * Expected output: "Dear Ada Lovelace, your order #42 has shipped!"
 */
function mailMerge(): WorkflowV1 {
  return makeWorkflow(
    'example-mail-merge',
    'Mail Merge',
    [
      node('mm-name', 'textInput', 40, 80, { value: 'Ada Lovelace' }, 'Customer name'),
      node('mm-order', 'textInput', 40, 300, { value: '#42' }, 'Order id'),
      node(
        'mm-template',
        'template',
        340,
        170,
        { template: 'Dear {{a}}, your order {{b}} has shipped!' },
        'Letter',
      ),
      node('mm-out', 'output', 640, 170, {}, 'Letter text'),
    ],
    [
      edge('mme1', 'mm-name', 'value', 'mm-template', 'a'),
      edge('mme2', 'mm-order', 'value', 'mm-template', 'b'),
      edge('mme3', 'mm-template', 'out', 'mm-out', 'in'),
    ],
  );
}

/**
 * Three-way routing with the Switch node.
 * Change the input to "a", "b" or anything else and re-run.
 */
function switchboard(): WorkflowV1 {
  return makeWorkflow(
    'example-switchboard',
    'Switchboard',
    [
      node('sw-in', 'textInput', 40, 220, { value: 'b' }, 'Signal'),
      node(
        'sw-switch',
        'switch',
        320,
        220,
        { mode: 'text', case1Value: 'a', case2Value: 'b' },
        'Dispatcher',
      ),
      node('sw-o1', 'output', 620, 60, {}, 'Channel A'),
      node('sw-o2', 'output', 620, 220, {}, 'Channel B'),
      node('sw-o3', 'output', 620, 380, {}, 'Fallback'),
    ],
    [
      edge('swe1', 'sw-in', 'value', 'sw-switch', 'in'),
      edge('swe2', 'sw-switch', 'case1', 'sw-o1', 'in'),
      edge('swe3', 'sw-switch', 'case2', 'sw-o2', 'in'),
      edge('swe4', 'sw-switch', 'default', 'sw-o3', 'in'),
    ],
  );
}

/**
 * Live HTTP request: fetch a random piece of wisdom from the GitHub API.
 * Requires network access.
 */
function apiWisdom(): WorkflowV1 {
  return makeWorkflow(
    'example-api-wisdom',
    'API Wisdom',
    [
      node(
        'api-req',
        'httpRequest',
        40,
        120,
        { url: 'https://api.github.com/zen', method: 'GET', body: '' },
        'Fetch wisdom',
      ),
      node('api-note', 'note', 40, 340, { text: 'Needs network access. Try changing the URL!' }),
      node('api-status', 'output', 360, 40, {}, 'Status code'),
      node('api-body', 'output', 360, 200, {}, 'Response body'),
    ],
    [
      edge('apie1', 'api-req', 'status', 'api-status', 'in'),
      edge('apie2', 'api-req', 'body', 'api-body', 'in'),
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
  {
    id: 'example-mail-merge',
    name: 'Mail Merge',
    description: 'Build a personalized letter with the Template node.',
    build: mailMerge,
  },
  {
    id: 'example-switchboard',
    name: 'Switchboard',
    description: 'Route a value to one of three channels with the Switch node.',
    build: switchboard,
  },
  {
    id: 'example-api-wisdom',
    name: 'API Wisdom',
    description: 'Fetch live data with the HTTP Request node (needs network).',
    build: apiWisdom,
  },
];
