import { describe, expect, it } from 'vitest';
import {
  createNode,
  describePortValue,
  getAllNodeDefinitions,
  getNodeDefinition,
  getPortDef,
  isKnownNodeType,
  validateNodeConfig,
} from './nodeRegistry.ts';
import { NODE_TYPES } from './types.ts';
import type { NodeTypeId } from './types.ts';

describe('node registry', () => {
  it('defines all fifteen node types', () => {
    expect(getAllNodeDefinitions()).toHaveLength(15);
    for (const type of NODE_TYPES) {
      expect(getNodeDefinition(type).type).toBe(type);
    }
  });

  it('recognizes known node types', () => {
    expect(isKnownNodeType('textInput')).toBe(true);
    expect(isKnownNodeType('teleport')).toBe(false);
    expect(isKnownNodeType('')).toBe(false);
  });

  it('creates nodes with default config', () => {
    for (const type of NODE_TYPES) {
      const node = createNode(type, { x: 5, y: 10 }, 'id-1');
      expect(node.id).toBe('id-1');
      expect(node.type).toBe(type);
      expect(node.position).toEqual({ x: 5, y: 10 });
      // Defaults must validate against the node's own schema.
      expect(validateNodeConfig(node)).toEqual([]);
    }
  });

  it('exposes input/output port definitions', () => {
    const math = createNode('mathTransform', { x: 0, y: 0 }, 'm');
    expect(getPortDef(math, 'a', 'input')?.type).toBe('number');
    expect(getPortDef(math, 'b', 'input')?.type).toBe('number');
    expect(getPortDef(math, 'out', 'output')?.type).toBe('number');
    expect(getPortDef(math, 'nope', 'input')).toBeUndefined();

    const cond = createNode('condition', { x: 0, y: 0 }, 'c');
    expect(getPortDef(cond, 'true', 'output')?.type).toBe('any');
    expect(getPortDef(cond, 'false', 'output')?.type).toBe('any');

    const input = createNode('textInput', { x: 0, y: 0 }, 'i');
    expect(getPortDef(input, 'value', 'output')?.type).toBe('string');
    expect(getNodeDefinition('textInput' as NodeTypeId).inputs).toEqual([]);

    const output = createNode('output', { x: 0, y: 0 }, 'o');
    expect(getNodeDefinition('output' as NodeTypeId).outputs).toEqual([]);
    expect(getPortDef(output, 'in', 'input')?.type).toBe('any');
  });

  it('validates node configs', () => {
    const good = createNode('mathTransform', { x: 0, y: 0 }, 'm');
    expect(validateNodeConfig(good)).toEqual([]);

    const bad = createNode('mathTransform', { x: 0, y: 0 }, 'm2');
    bad.data = { operation: 'frobnicate' };
    const errors = validateNodeConfig(bad);
    expect(errors.length).toBeGreaterThan(0);

    const badNumber = createNode('numberInput', { x: 0, y: 0 }, 'n');
    badNumber.data = { value: 'NaN' };
    expect(validateNodeConfig(badNumber).length).toBeGreaterThan(0);
  });

  it('summarizes every node config without crashing', () => {
    for (const def of getAllNodeDefinitions()) {
      const summary = def.summarize(def.defaultData());
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
      // Also with empty/unknown data (defensive for corrupted records).
      expect(typeof def.summarize({})).toBe('string');
    }
  });

  it('summarizes representative configs', () => {
    expect(getNodeDefinition('textInput').summarize({ value: 'hello' })).toContain('hello');
    expect(
      getNodeDefinition('textInput').summarize({ value: 'a'.repeat(100) }),
    ).toContain('…');
    expect(getNodeDefinition('numberInput').summarize({ value: 42 })).toContain('42');
    expect(
      getNodeDefinition('textTransform').summarize({ operation: 'append', text: '!' }),
    ).toContain('!');
    expect(getNodeDefinition('mathTransform').summarize({ operation: 'divide' })).toContain('÷');
    expect(
      getNodeDefinition('condition').summarize({ mode: 'number', numberOperator: 'lessThan', compareValue: '5' }),
    ).toContain('<');
    expect(
      getNodeDefinition('condition').summarize({ mode: 'text', textOperator: 'equals', compareValue: 'x' }),
    ).toContain('=');
    expect(getNodeDefinition('mergeText').summarize({ separator: '|' })).toContain('|');
    expect(getNodeDefinition('output').summarize({})).toBeTruthy();
  });

  it('describes port values for display', () => {
    expect(describePortValue('hi')).toEqual({ text: 'hi', type: 'string' });
    expect(describePortValue(42)).toEqual({ text: '42', type: 'number' });
    expect(describePortValue(undefined)).toEqual({ text: '—', type: 'empty' });
  });

  it('declares config fields with visibility rules', () => {
    const def = getNodeDefinition('textTransform');
    expect(def.configFields.length).toBeGreaterThan(0);
    const textField = def.configFields.find((f) => f.key === 'text');
    expect(textField?.visibleWhen?.({ operation: 'append' })).toBe(true);
    expect(textField?.visibleWhen?.({ operation: 'uppercase' })).toBe(false);

    const condDef = getNodeDefinition('condition');
    const textOp = condDef.configFields.find((f) => f.key === 'textOperator');
    expect(textOp?.visibleWhen?.({ mode: 'text' })).toBe(true);
    expect(textOp?.visibleWhen?.({ mode: 'number' })).toBe(false);
  });

  it('gives every definition a title, description, category and keywords', () => {
    for (const def of getAllNodeDefinitions()) {
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(['Input', 'Transform', 'Logic', 'Utility', 'Output']).toContain(def.category);
      expect(def.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe('new node types', () => {
  const ctx = { signal: new AbortController().signal, nodeId: 'n', runId: 'r' };

  it('switch routes to the matching case', async () => {
    const def = getNodeDefinition('switch');
    const data = { mode: 'text', case1Value: 'a', case2Value: 'b' };
    expect(await def.execute({ in: 'a' }, data, ctx)).toEqual({
      outputs: { case1: 'a' },
      activeOutputs: ['case1'],
    });
    expect(await def.execute({ in: 'b' }, data, ctx)).toEqual({
      outputs: { case2: 'b' },
      activeOutputs: ['case2'],
    });
    expect(await def.execute({ in: 'zzz' }, data, ctx)).toEqual({
      outputs: { default: 'zzz' },
      activeOutputs: ['default'],
    });
  });

  it('switch matches numbers numerically', async () => {
    const def = getNodeDefinition('switch');
    const data = { mode: 'number', case1Value: '42', case2Value: '7' };
    const r = await def.execute({ in: 42 }, data, ctx);
    expect(r.activeOutputs).toEqual(['case1']);
    const r2 = await def.execute({ in: '7' }, data, ctx);
    expect(r2.activeOutputs).toEqual(['case2']);
  });

  it('template interpolates placeholders', async () => {
    const def = getNodeDefinition('template');
    const r = await def.execute({ a: 'Ada', b: 'Lovelace' }, { template: '{{b}}, {{a}}!' }, ctx);
    expect(r.outputs['out']).toBe('Lovelace, Ada!');
    const r2 = await def.execute({ a: 'x' }, { template: 'hi {{a}}{{b}}' }, ctx);
    expect(r2.outputs['out']).toBe('hi x');
  });

  it('json parses and stringifies', async () => {
    const def = getNodeDefinition('json');
    const p = await def.execute({ in: '"hello"' }, { mode: 'parse' }, ctx);
    expect(p.outputs['out']).toBe('hello');
    const pn = await def.execute({ in: '42' }, { mode: 'parse' }, ctx);
    expect(pn.outputs['out']).toBe(42);
    await expect(def.execute({ in: 'nope' }, { mode: 'parse' }, ctx)).rejects.toThrow(/invalid json/i);
    const st = await def.execute({ in: 'x' }, { mode: 'stringify' }, ctx);
    expect(st.outputs['out']).toBe('"x"');
  });

  it('httpRequest performs a real fetch', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response('{"ok":true}', { status: 201 });
    }) as typeof fetch;
    try {
      const def = getNodeDefinition('httpRequest');
      const r = await def.execute(
        {},
        { url: 'https://example.com/api', method: 'POST', body: '{"a":1}' },
        ctx,
      );
      expect(r.outputs['status']).toBe(201);
      expect(r.outputs['body']).toBe('{"ok":true}');
      expect(calls[0].url).toBe('https://example.com/api');
      expect(calls[0].init.method).toBe('POST');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('httpRequest rejects non-http urls in config', () => {
    expect(() =>
      validateNodeConfig({ id: 'h', type: 'httpRequest', position: { x: 0, y: 0 }, data: { url: 'ftp://x', method: 'GET', body: '' } }),
    ).not.toEqual([]);
  });

  it('httpRequest refuses non-http(s) urls at runtime', async () => {
    const def = getNodeDefinition('httpRequest');
    await expect(
      def.execute({}, { url: 'ftp://example.com/x', method: 'GET', body: '' }, ctx),
    ).rejects.toThrow(/only http/i);
  });

  it('httpRequest reports aborts cleanly', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      const err = new DOMException('aborted', 'AbortError');
      return Promise.reject(err);
    }) as typeof fetch;
    try {
      const def = getNodeDefinition('httpRequest');
      await expect(
        def.execute({}, { url: 'https://example.com/', method: 'GET', body: '' }, ctx),
      ).rejects.toThrow(/aborted/i);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('httpRequest wraps network failures', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((_url: string) =>
      Promise.reject(new Error('boom'))) as typeof fetch;
    try {
      const def = getNodeDefinition('httpRequest');
      await expect(
        def.execute({}, { url: 'https://example.com/', method: 'GET', body: '' }, ctx),
      ).rejects.toThrow(/request failed/i);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('delay passes the value through after waiting', async () => {
    const def = getNodeDefinition('delay');
    const start = Date.now();
    const r = await def.execute({ in: 'v' }, { ms: 30 }, ctx);
    expect(r.outputs['out']).toBe('v');
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  it('delay respects abort', async () => {
    const def = getNodeDefinition('delay');
    const controller = new AbortController();
    const p = def.execute({ in: 'v' }, { ms: 5000 }, { ...ctx, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toThrow(/abort/i);
  });

  it('random produces integers in range', async () => {
    const def = getNodeDefinition('random');
    for (let i = 0; i < 50; i++) {
      const r = await def.execute({}, { min: 5, max: 10 }, ctx);
      const v = r.outputs['value'] as number;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
    await expect(def.execute({}, { min: 10, max: 5 }, ctx)).rejects.toThrow(/min.*max/i);
  });

  it('datetime formats the current time', async () => {
    const def = getNodeDefinition('datetime');
    const iso = await def.execute({}, { format: 'iso' }, ctx);
    expect(typeof iso.outputs['value']).toBe('string');
    expect(String(iso.outputs['value'])).toMatch(/T/);
    const ts = await def.execute({}, { format: 'timestamp' }, ctx);
    expect(typeof ts.outputs['value']).toBe('number');
    const date = await def.execute({}, { format: 'date' }, ctx);
    expect(String(date.outputs['value'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('note always succeeds with no outputs', async () => {
    const def = getNodeDefinition('note');
    expect(def.inputs).toEqual([]);
    expect(def.outputs).toEqual([]);
    expect(await def.execute({}, { text: 'hi' }, ctx)).toEqual({ outputs: {} });
  });
});
