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
  it('defines all seven node types', () => {
    expect(getAllNodeDefinitions()).toHaveLength(7);
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
      expect(['Input', 'Transform', 'Logic', 'Output']).toContain(def.category);
      expect(def.keywords.length).toBeGreaterThan(0);
    }
  });
});
