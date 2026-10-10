import { z } from 'zod';
import { NODE_TYPES } from './types.ts';
import type {
  FlowNode,
  NodeTypeId,
  PortDataType,
  PortDef,
  PortValue,
  WorkflowGraph,
} from './types.ts';

/** Error thrown by a node's execute function for invalid operations. */
export class NodeExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NodeExecutionError';
  }
}

export type ConfigFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'checkbox';

export interface ConfigFieldOption {
  value: string;
  label: string;
}

export interface ConfigFieldDef {
  key: string;
  label: string;
  kind: ConfigFieldKind;
  options?: ConfigFieldOption[];
  placeholder?: string;
  helpText?: string;
  /** Hide the field unless the predicate holds for the current config. */
  visibleWhen?: (data: Record<string, unknown>) => boolean;
}

export interface NodeExecuteResult {
  outputs: Record<string, PortValue>;
  /**
   * For branching nodes: the output ports that actually carry a value.
   * Defaults to all declared outputs.
   */
  activeOutputs?: string[];
}

export interface NodeDefinition {
  type: NodeTypeId;
  title: string;
  description: string;
  category: 'Input' | 'Transform' | 'Logic' | 'Output';
  /** Search keywords for the node palette. */
  keywords: string[];
  inputs: PortDef[];
  outputs: PortDef[];
  defaultData: () => Record<string, unknown>;
  /** Field descriptors used by the generic properties panel. */
  configFields: ConfigFieldDef[];
  /** Runtime validation of the node's `data`. */
  configSchema: z.ZodType<Record<string, unknown>>;
  /** One-line summary of the configuration shown on the node card. */
  summarize: (data: Record<string, unknown>) => string;
  execute: (
    inputs: Record<string, PortValue>,
    config: Record<string, unknown>,
  ) => NodeExecuteResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(value: PortValue | undefined, portLabel: string): string {
  if (typeof value !== 'string') {
    throw new NodeExecutionError(
      `Expected a text value on input "${portLabel}" but received ${describeValue(value)}.`,
    );
  }
  return value;
}

function requireNumber(value: PortValue | undefined, portLabel: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new NodeExecutionError(
      `Expected a numeric value on input "${portLabel}" but received ${describeValue(value)}.`,
    );
  }
  return value;
}

function describeValue(value: PortValue | undefined): string {
  if (value === undefined) return 'nothing';
  return typeof value === 'string' ? `text "${value}"` : `number ${value}`;
}

function asConfig<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  data: Record<string, unknown>,
  nodeTitle: string,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new NodeExecutionError(
      `Invalid configuration for "${nodeTitle}": ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

const textInputDef: NodeDefinition = {
  type: 'textInput',
  title: 'Text Input',
  description: 'Produces a configurable text value.',
  category: 'Input',
  keywords: ['text', 'string', 'input', 'constant', 'value'],
  inputs: [],
  outputs: [{ id: 'value', label: 'value', type: 'string', required: false }],
  defaultData: () => ({ value: 'Hello, FlowLab!' }),
  configFields: [
    {
      key: 'value',
      label: 'Text value',
      kind: 'textarea',
      placeholder: 'Enter text…',
    },
  ],
  configSchema: z.object({ value: z.string() }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => {
    const v = typeof data['value'] === 'string' ? data['value'] : '';
    return v.length > 28 ? `"${v.slice(0, 28)}…"` : `"${v}"`;
  },
  execute: (_inputs, data) => {
    const config = asConfig(
      z.object({ value: z.string() }),
      data,
      'Text Input',
    );
    return { outputs: { value: config.value } };
  },
};

const numberInputDef: NodeDefinition = {
  type: 'numberInput',
  title: 'Number Input',
  description: 'Produces a configurable numeric value.',
  category: 'Input',
  keywords: ['number', 'numeric', 'input', 'constant', 'value'],
  inputs: [],
  outputs: [{ id: 'value', label: 'value', type: 'number', required: false }],
  defaultData: () => ({ value: 42 }),
  configFields: [
    { key: 'value', label: 'Number value', kind: 'number', placeholder: '0' },
  ],
  configSchema: z.object({ value: z.number() }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => `= ${typeof data['value'] === 'number' ? data['value'] : '?'}`,
  execute: (_inputs, data) => {
    const config = asConfig(z.object({ value: z.number() }), data, 'Number Input');
    if (Number.isNaN(config.value)) {
      throw new NodeExecutionError('Number Input value is not a valid number.');
    }
    return { outputs: { value: config.value } };
  },
};

const TEXT_OPERATIONS = ['uppercase', 'lowercase', 'trim', 'append', 'prepend'] as const;
type TextOperation = (typeof TEXT_OPERATIONS)[number];

const textTransformDef: NodeDefinition = {
  type: 'textTransform',
  title: 'Text Transform',
  description: 'Uppercase, lowercase, trim, append or prepend text.',
  category: 'Transform',
  keywords: ['text', 'string', 'uppercase', 'lowercase', 'trim', 'append', 'prepend', 'transform'],
  inputs: [{ id: 'in', label: 'in', type: 'string', required: true }],
  outputs: [{ id: 'out', label: 'out', type: 'string', required: false }],
  defaultData: () => ({ operation: 'uppercase', text: '' }),
  configFields: [
    {
      key: 'operation',
      label: 'Operation',
      kind: 'select',
      options: [
        { value: 'uppercase', label: 'UPPERCASE' },
        { value: 'lowercase', label: 'lowercase' },
        { value: 'trim', label: 'Trim whitespace' },
        { value: 'append', label: 'Append text' },
        { value: 'prepend', label: 'Prepend text' },
      ],
    },
    {
      key: 'text',
      label: 'Text to append / prepend',
      kind: 'text',
      placeholder: '…',
      visibleWhen: (data) => data['operation'] === 'append' || data['operation'] === 'prepend',
    },
  ],
  configSchema: z.object({
    operation: z.enum(TEXT_OPERATIONS),
    text: z.string().optional().default(''),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => {
    const op = typeof data['operation'] === 'string' ? data['operation'] : '?';
    const extra =
      (op === 'append' || op === 'prepend') && typeof data['text'] === 'string'
        ? ` "${data['text']}"`
        : '';
    return `${op}${extra}`;
  },
  execute: (inputs, data) => {
    const config = asConfig(
      z.object({ operation: z.enum(TEXT_OPERATIONS), text: z.string().default('') }),
      data,
      'Text Transform',
    );
    const value = requireString(inputs['in'], 'in');
    const op: TextOperation = config.operation;
    let result: string;
    switch (op) {
      case 'uppercase':
        result = value.toUpperCase();
        break;
      case 'lowercase':
        result = value.toLowerCase();
        break;
      case 'trim':
        result = value.trim();
        break;
      case 'append':
        result = value + config.text;
        break;
      case 'prepend':
        result = config.text + value;
        break;
    }
    return { outputs: { out: result } };
  },
};

const MATH_OPERATIONS = ['add', 'multiply', 'divide'] as const;
type MathOperation = (typeof MATH_OPERATIONS)[number];

const mathTransformDef: NodeDefinition = {
  type: 'mathTransform',
  title: 'Math Transform',
  description: 'Add, multiply or divide two numbers.',
  category: 'Transform',
  keywords: ['math', 'number', 'add', 'multiply', 'divide', 'calculation', 'arithmetic'],
  inputs: [
    { id: 'a', label: 'a', type: 'number', required: true },
    { id: 'b', label: 'b', type: 'number', required: true },
  ],
  outputs: [{ id: 'out', label: 'out', type: 'number', required: false }],
  defaultData: () => ({ operation: 'add' }),
  configFields: [
    {
      key: 'operation',
      label: 'Operation',
      kind: 'select',
      options: [
        { value: 'add', label: 'a + b (add)' },
        { value: 'multiply', label: 'a × b (multiply)' },
        { value: 'divide', label: 'a ÷ b (divide)' },
      ],
    },
  ],
  configSchema: z.object({
    operation: z.enum(MATH_OPERATIONS),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => {
    const op = data['operation'];
    return op === 'add' ? 'a + b' : op === 'multiply' ? 'a × b' : op === 'divide' ? 'a ÷ b' : '?';
  },
  execute: (inputs, data) => {
    const config = asConfig(
      z.object({ operation: z.enum(MATH_OPERATIONS) }),
      data,
      'Math Transform',
    );
    const a = requireNumber(inputs['a'], 'a');
    const b = requireNumber(inputs['b'], 'b');
    const op: MathOperation = config.operation;
    let result: number;
    switch (op) {
      case 'add':
        result = a + b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          throw new NodeExecutionError('Division by zero is not allowed.');
        }
        result = a / b;
        break;
    }
    return { outputs: { out: result } };
  },
};

const conditionDef: NodeDefinition = {
  type: 'condition',
  title: 'Condition',
  description: 'Route the input value through the TRUE or FALSE output.',
  category: 'Logic',
  keywords: ['condition', 'if', 'branch', 'compare', 'equals', 'contains', 'greater', 'less', 'route'],
  inputs: [{ id: 'in', label: 'in', type: 'any', required: true }],
  outputs: [
    { id: 'true', label: 'true', type: 'any', required: false },
    { id: 'false', label: 'false', type: 'any', required: false },
  ],
  defaultData: () => ({
    mode: 'text',
    textOperator: 'contains',
    numberOperator: 'greaterThan',
    compareValue: '',
  }),
  configFields: [
    {
      key: 'mode',
      label: 'Compare as',
      kind: 'select',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'number', label: 'Number' },
      ],
    },
    {
      key: 'textOperator',
      label: 'Text operator',
      kind: 'select',
      options: [
        { value: 'equals', label: 'equals' },
        { value: 'contains', label: 'contains' },
      ],
      visibleWhen: (data) => data['mode'] === 'text',
    },
    {
      key: 'numberOperator',
      label: 'Number operator',
      kind: 'select',
      options: [
        { value: 'greaterThan', label: 'greater than (>)' },
        { value: 'lessThan', label: 'less than (<)' },
      ],
      visibleWhen: (data) => data['mode'] === 'number',
    },
    {
      key: 'compareValue',
      label: 'Compare value',
      kind: 'text',
      placeholder: 'Value to compare against…',
      helpText: 'In number mode this must be a valid number.',
    },
  ],
  configSchema: z.object({
    mode: z.enum(['text', 'number']),
    textOperator: z.enum(['equals', 'contains']).default('contains'),
    numberOperator: z.enum(['greaterThan', 'lessThan']).default('greaterThan'),
    compareValue: z.string().default(''),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => {
    if (data['mode'] === 'number') {
      const op = data['numberOperator'] === 'lessThan' ? '<' : '>';
      return `in ${op} ${String(data['compareValue'] ?? '')}`;
    }
    const op = data['textOperator'] === 'equals' ? '=' : '∋';
    return `in ${op} "${String(data['compareValue'] ?? '')}"`;
  },
  execute: (inputs, data) => {
    const config = asConfig(
      z.object({
        mode: z.enum(['text', 'number']),
        textOperator: z.enum(['equals', 'contains']),
        numberOperator: z.enum(['greaterThan', 'lessThan']),
        compareValue: z.string(),
      }),
      data,
      'Condition',
    );
    const value = inputs['in'];
    if (value === undefined) {
      throw new NodeExecutionError('Condition received no input value.');
    }
    let passed: boolean;
    if (config.mode === 'text') {
      const text = String(value);
      passed =
        config.textOperator === 'equals'
          ? text === config.compareValue
          : text.includes(config.compareValue);
    } else {
      const num = requireNumber(value, 'in');
      const compare = Number(config.compareValue);
      if (config.compareValue.trim() === '' || Number.isNaN(compare)) {
        throw new NodeExecutionError(
          `Compare value "${config.compareValue}" is not a valid number.`,
        );
      }
      passed = config.numberOperator === 'greaterThan' ? num > compare : num < compare;
    }
    const branch = passed ? 'true' : 'false';
    return { outputs: { [branch]: value }, activeOutputs: [branch] };
  },
};

const mergeTextDef: NodeDefinition = {
  type: 'mergeText',
  title: 'Merge Text',
  description: 'Concatenate two text inputs with a separator.',
  category: 'Transform',
  keywords: ['merge', 'join', 'concat', 'combine', 'text', 'string', 'separator'],
  inputs: [
    { id: 'a', label: 'a', type: 'string', required: true },
    { id: 'b', label: 'b', type: 'string', required: true },
  ],
  outputs: [{ id: 'out', label: 'out', type: 'string', required: false }],
  defaultData: () => ({ separator: ' ' }),
  configFields: [
    {
      key: 'separator',
      label: 'Separator',
      kind: 'text',
      placeholder: ' ',
      helpText: 'Inserted between the two texts.',
    },
  ],
  configSchema: z.object({
    separator: z.string().default(' '),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) =>
    `a + ${JSON.stringify(typeof data['separator'] === 'string' ? data['separator'] : ' ')} + b`,
  execute: (inputs, data) => {
    const config = asConfig(z.object({ separator: z.string() }), data, 'Merge Text');
    const a = requireString(inputs['a'], 'a');
    const b = requireString(inputs['b'], 'b');
    return { outputs: { out: `${a}${config.separator}${b}` } };
  },
};

const outputDef: NodeDefinition = {
  type: 'output',
  title: 'Output',
  description: 'Display the received value and its type.',
  category: 'Output',
  keywords: ['output', 'result', 'display', 'show', 'print', 'sink'],
  inputs: [{ id: 'in', label: 'in', type: 'any', required: true }],
  outputs: [],
  defaultData: () => ({}),
  configFields: [],
  configSchema: z.object({}).passthrough() as unknown as z.ZodType<Record<string, unknown>>,
  summarize: () => 'displays value',
  execute: (inputs) => {
    const value = inputs['in'];
    if (value === undefined) {
      throw new NodeExecutionError('Output received no input value.');
    }
    // Echo the received value so the UI (and tests) can display it.
    return { outputs: { in: value } };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const DEFINITIONS: Record<NodeTypeId, NodeDefinition> = {
  textInput: textInputDef,
  numberInput: numberInputDef,
  textTransform: textTransformDef,
  mathTransform: mathTransformDef,
  condition: conditionDef,
  mergeText: mergeTextDef,
  output: outputDef,
};

export function getNodeDefinition(type: NodeTypeId): NodeDefinition {
  return DEFINITIONS[type];
}

export function getAllNodeDefinitions(): NodeDefinition[] {
  return Object.values(DEFINITIONS);
}

export function isKnownNodeType(type: string): type is NodeTypeId {
  return (NODE_TYPES as readonly string[]).includes(type);
}

/** Create a fresh node instance with default configuration. */
export function createNode(
  type: NodeTypeId,
  position: { x: number; y: number },
  id: string,
): FlowNode {
  return {
    id,
    type,
    position: { ...position },
    data: getNodeDefinition(type).defaultData(),
  };
}

/**
 * Two ports are compatible when their data types match, or when either
 * side is `any` (the universal type).
 */
export function arePortsCompatible(sourceType: PortDataType, targetType: PortDataType): boolean {
  return sourceType === targetType || sourceType === 'any' || targetType === 'any';
}

export function getPortDef(
  node: FlowNode,
  handleId: string,
  kind: 'input' | 'output',
): PortDef | undefined {
  const def = DEFINITIONS[node.type];
  const ports = kind === 'input' ? def.inputs : def.outputs;
  return ports.find((p) => p.id === handleId);
}

/** Human-readable type label for a port value, used by the Output node UI. */
export function describePortValue(value: PortValue | undefined): { text: string; type: string } {
  if (value === undefined) return { text: '—', type: 'empty' };
  if (typeof value === 'string') return { text: value, type: 'string' };
  return { text: String(value), type: 'number' };
}

/** Validate a node's stored configuration against its schema. Returns error messages. */
export function validateNodeConfig(node: FlowNode): string[] {
  const def = DEFINITIONS[node.type];
  const parsed = def.configSchema.safeParse(node.data);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export type { WorkflowGraph };
export type { FlowNode };
