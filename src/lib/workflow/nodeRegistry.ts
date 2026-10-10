import { z } from 'zod';
import { NODE_TYPES } from './types.ts';
import type {
  FlowNode,
  NodeCategory,
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

export interface NodeExecuteResult {
  outputs: Record<string, PortValue>;
  /**
   * For branching nodes: the output ports that actually carry a value.
   * Defaults to all declared outputs.
   */
  activeOutputs?: string[];
}

/** Context passed to every node's execute function. */
export interface NodeExecuteContext {
  /** AbortSignal for the whole run — long-running nodes should respect it. */
  signal: AbortSignal;
  nodeId: string;
  runId: string;
}

export interface NodeDefinition {
  type: NodeTypeId;
  title: string;
  description: string;
  category: NodeCategory;
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
    ctx: NodeExecuteContext,
  ) => NodeExecuteResult | Promise<NodeExecuteResult>;
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
// New node types (v2 feature set)
// ---------------------------------------------------------------------------

const switchDef: NodeDefinition = {
  type: 'switch',
  title: 'Switch',
  description: 'Route the input to one of two cases or a default output.',
  category: 'Logic',
  keywords: ['switch', 'route', 'branch', 'case', 'match', 'multiple'],
  inputs: [{ id: 'in', label: 'in', type: 'any', required: true }],
  outputs: [
    { id: 'case1', label: 'case 1', type: 'any', required: false },
    { id: 'case2', label: 'case 2', type: 'any', required: false },
    { id: 'default', label: 'default', type: 'any', required: false },
  ],
  defaultData: () => ({ mode: 'text', case1Value: '', case2Value: '' }),
  configFields: [
    {
      key: 'mode',
      label: 'Match mode',
      kind: 'select',
      options: [
        { value: 'text', label: 'Text (equals)' },
        { value: 'number', label: 'Number (equals)' },
      ],
    },
    { key: 'case1Value', label: 'Case 1 matches', kind: 'text', placeholder: 'first value' },
    { key: 'case2Value', label: 'Case 2 matches', kind: 'text', placeholder: 'second value' },
  ],
  configSchema: z.object({
    mode: z.enum(['text', 'number']).default('text'),
    case1Value: z.string().default(''),
    case2Value: z.string().default(''),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) =>
    `match ${JSON.stringify(data['case1Value'] ?? '')} / ${JSON.stringify(data['case2Value'] ?? '')}`,
  execute: (inputs, data) => {
    const config = asConfig(
      z.object({ mode: z.enum(['text', 'number']), case1Value: z.string(), case2Value: z.string() }),
      data,
      'Switch',
    );
    const value = inputs['in'];
    if (value === undefined) throw new NodeExecutionError('Switch received no input value.');
    const matches = (expected: string): boolean => {
      if (config.mode === 'number') {
        const num = typeof value === 'number' ? value : Number(value);
        const exp = Number(expected);
        return !Number.isNaN(num) && !Number.isNaN(exp) && num === exp;
      }
      return String(value) === expected;
    };
    const branch = matches(config.case1Value)
      ? 'case1'
      : matches(config.case2Value)
        ? 'case2'
        : 'default';
    return { outputs: { [branch]: value }, activeOutputs: [branch] };
  },
};

const templateDef: NodeDefinition = {
  type: 'template',
  title: 'Template',
  description: 'Build text from a template with {{a}} and {{b}} placeholders.',
  category: 'Transform',
  keywords: ['template', 'interpolate', 'format', 'string', 'mail', 'merge'],
  inputs: [
    { id: 'a', label: 'a', type: 'string', required: true },
    { id: 'b', label: 'b', type: 'string', required: false },
  ],
  outputs: [{ id: 'out', label: 'out', type: 'string', required: false }],
  defaultData: () => ({ template: 'Hello, {{a}}!' }),
  configFields: [
    {
      key: 'template',
      label: 'Template',
      kind: 'textarea',
      placeholder: 'Hello, {{a}}!',
      helpText: 'Use {{a}} and {{b}} as placeholders.',
    },
  ],
  configSchema: z.object({
    template: z.string().default('Hello, {{a}}!'),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => `template ${JSON.stringify(String(data['template'] ?? '').slice(0, 32))}`,
  execute: (inputs, data) => {
    const config = asConfig(z.object({ template: z.string() }), data, 'Template');
    const a = requireString(inputs['a'], 'a');
    const b = inputs['b'] === undefined ? '' : requireString(inputs['b'], 'b');
    const out = config.template.replaceAll('{{a}}', a).replaceAll('{{b}}', b);
    return { outputs: { out } };
  },
};

const jsonDef: NodeDefinition = {
  type: 'json',
  title: 'JSON',
  description: 'Parse a JSON string or stringify a value.',
  category: 'Transform',
  keywords: ['json', 'parse', 'stringify', 'object', 'serialize'],
  inputs: [{ id: 'in', label: 'in', type: 'any', required: true }],
  outputs: [{ id: 'out', label: 'out', type: 'any', required: false }],
  defaultData: () => ({ mode: 'parse' }),
  configFields: [
    {
      key: 'mode',
      label: 'Mode',
      kind: 'select',
      options: [
        { value: 'parse', label: 'Parse (text → value)' },
        { value: 'stringify', label: 'Stringify (value → text)' },
      ],
    },
  ],
  configSchema: z.object({
    mode: z.enum(['parse', 'stringify']).default('parse'),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => (data['mode'] === 'stringify' ? 'stringify value' : 'parse JSON'),
  execute: async (inputs, data) => {
    const config = asConfig(z.object({ mode: z.enum(['parse', 'stringify']) }), data, 'JSON');
    const value = inputs['in'];
    if (value === undefined) throw new NodeExecutionError('JSON received no input value.');
    if (config.mode === 'stringify') {
      return { outputs: { out: JSON.stringify(value) } };
    }
    if (typeof value !== 'string') {
      throw new NodeExecutionError(`Cannot parse JSON from ${describeValue(value)}.`);
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== 'string' && typeof parsed !== 'number') {
        throw new NodeExecutionError('Parsed JSON must be a text or numeric value.');
      }
      return { outputs: { out: parsed } };
    } catch (err) {
      if (err instanceof NodeExecutionError) throw err;
      throw new NodeExecutionError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

const httpRequestDef: NodeDefinition = {
  type: 'httpRequest',
  title: 'HTTP Request',
  description: 'Fetch a URL and output the status code and body.',
  category: 'Utility',
  keywords: ['http', 'request', 'fetch', 'api', 'web', 'get', 'post', 'url'],
  inputs: [],
  outputs: [
    { id: 'status', label: 'status', type: 'number', required: false },
    { id: 'body', label: 'body', type: 'string', required: false },
  ],
  defaultData: () => ({ url: 'https://api.github.com/zen', method: 'GET', body: '' }),
  configFields: [
    { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://…' },
    {
      key: 'method',
      label: 'Method',
      kind: 'select',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'DELETE', label: 'DELETE' },
      ],
    },
    {
      key: 'body',
      label: 'Request body',
      kind: 'textarea',
      placeholder: '{"key": "value"}',
      helpText: 'Sent with POST and PUT requests.',
      visibleWhen: (data) => data['method'] === 'POST' || data['method'] === 'PUT',
    },
  ],
  configSchema: z.object({
    url: z.string().url('URL must be a valid http(s) address.'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
    body: z.string().default(''),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => `${String(data['method'] ?? 'GET')} ${String(data['url'] ?? '').slice(0, 40)}`,
  execute: async (_inputs, data, ctx) => {
    const config = asConfig(
      z.object({
        url: z.string().url(),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        body: z.string(),
      }),
      data,
      'HTTP Request',
    );
    if (!/^https?:\/\//i.test(config.url)) {
      throw new NodeExecutionError('Only http(s) URLs are allowed.');
    }
    let response: Response;
    try {
      response = await fetch(config.url, {
        method: config.method,
        body: config.method === 'POST' || config.method === 'PUT' ? config.body : undefined,
        signal: ctx.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new NodeExecutionError('HTTP request was aborted.');
      }
      throw new NodeExecutionError(
        `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const body = await response.text();
    return { outputs: { status: response.status, body } };
  },
};

const delayDef: NodeDefinition = {
  type: 'delay',
  title: 'Delay',
  description: 'Wait for a duration, then pass the value through.',
  category: 'Utility',
  keywords: ['delay', 'wait', 'sleep', 'pause', 'timer'],
  inputs: [{ id: 'in', label: 'in', type: 'any', required: true }],
  outputs: [{ id: 'out', label: 'out', type: 'any', required: false }],
  defaultData: () => ({ ms: 1000 }),
  configFields: [
    {
      key: 'ms',
      label: 'Delay (ms)',
      kind: 'number',
      placeholder: '1000',
      helpText: '0 – 60000 milliseconds.',
    },
  ],
  configSchema: z.object({
    ms: z.number().int().min(0).max(60000).default(1000),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => `wait ${String(data['ms'] ?? 1000)} ms`,
  execute: async (inputs, data, ctx) => {
    const config = asConfig(z.object({ ms: z.number().int().min(0).max(60000) }), data, 'Delay');
    const value = inputs['in'];
    if (value === undefined) throw new NodeExecutionError('Delay received no input value.');
    if (config.ms > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          ctx.signal.removeEventListener('abort', onAbort);
          resolve();
        }, config.ms);
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(new NodeExecutionError('Delay was aborted.'));
        };
        ctx.signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    return { outputs: { out: value } };
  },
};

const randomDef: NodeDefinition = {
  type: 'random',
  title: 'Random',
  description: 'Produce a random integer in a range.',
  category: 'Utility',
  keywords: ['random', 'number', 'dice', 'integer', 'range'],
  inputs: [],
  outputs: [{ id: 'value', label: 'value', type: 'number', required: false }],
  defaultData: () => ({ min: 1, max: 100 }),
  configFields: [
    { key: 'min', label: 'Min (inclusive)', kind: 'number' },
    { key: 'max', label: 'Max (inclusive)', kind: 'number' },
  ],
  configSchema: z.object({
    min: z.number().int().default(1),
    max: z.number().int().default(100),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => `random ${String(data['min'] ?? 1)}…${String(data['max'] ?? 100)}`,
  execute: async (_inputs, data) => {
    const config = asConfig(
      z.object({ min: z.number().int(), max: z.number().int() }),
      data,
      'Random',
    );
    if (config.min > config.max) {
      throw new NodeExecutionError(`Min (${config.min}) must not exceed max (${config.max}).`);
    }
    const value = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
    return { outputs: { value } };
  },
};

const datetimeDef: NodeDefinition = {
  type: 'datetime',
  title: 'Date & Time',
  description: 'Produce the current date/time in a chosen format.',
  category: 'Utility',
  keywords: ['date', 'time', 'now', 'timestamp', 'clock', 'datetime'],
  inputs: [],
  outputs: [{ id: 'value', label: 'value', type: 'any', required: false }],
  defaultData: () => ({ format: 'iso' }),
  configFields: [
    {
      key: 'format',
      label: 'Format',
      kind: 'select',
      options: [
        { value: 'iso', label: 'ISO 8601' },
        { value: 'timestamp', label: 'Unix timestamp (ms)' },
        { value: 'date', label: 'Date (YYYY-MM-DD)' },
        { value: 'time', label: 'Time (HH:MM:SS)' },
      ],
    },
  ],
  configSchema: z.object({
    format: z.enum(['iso', 'timestamp', 'date', 'time']).default('iso'),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => `now (${String(data['format'] ?? 'iso')})`,
  execute: (_inputs, data) => {
    const config = asConfig(
      z.object({ format: z.enum(['iso', 'timestamp', 'date', 'time']) }),
      data,
      'Date & Time',
    );
    const now = new Date();
    switch (config.format) {
      case 'timestamp':
        return { outputs: { value: now.getTime() } };
      case 'date':
        return { outputs: { value: now.toISOString().slice(0, 10) } };
      case 'time':
        return { outputs: { value: now.toISOString().slice(11, 19) } };
      default:
        return { outputs: { value: now.toISOString() } };
    }
  },
};

const noteDef: NodeDefinition = {
  type: 'note',
  title: 'Note',
  description: 'An annotation on the canvas. Never executes.',
  category: 'Utility',
  keywords: ['note', 'comment', 'annotation', 'text', 'memo', 'sticky'],
  inputs: [],
  outputs: [],
  defaultData: () => ({ text: 'Double-click the label to edit…' }),
  configFields: [
    {
      key: 'text',
      label: 'Note text',
      kind: 'textarea',
      placeholder: 'Write an annotation…',
    },
  ],
  configSchema: z.object({
    text: z.string().default(''),
  }) as unknown as z.ZodType<Record<string, unknown>>,
  summarize: (data) => String(data['text'] ?? '').slice(0, 48),
  execute: () => ({ outputs: {} }),
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
  switch: switchDef,
  mergeText: mergeTextDef,
  template: templateDef,
  json: jsonDef,
  httpRequest: httpRequestDef,
  delay: delayDef,
  random: randomDef,
  datetime: datetimeDef,
  note: noteDef,
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
