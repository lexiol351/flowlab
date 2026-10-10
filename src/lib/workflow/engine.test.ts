import { describe, expect, it } from 'vitest';
import {
  WorkflowValidationError,
  assertValidWorkflow,
  canConnect,
  executeWorkflow,
  findCycle,
  topologicalOrder,
  validateWorkflow,
} from './engine.ts';
import { arePortsCompatible, getNodeDefinition } from './nodeRegistry.ts';
import type { FlowEdge, FlowNode, NodeTypeId, WorkflowGraph } from './types.ts';

let idCounter = 0;
function nid(prefix = 'n'): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

function node(
  type: NodeTypeId,
  data: Record<string, unknown> = {},
  id = nid(),
): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return { id: nid('e'), source, sourceHandle, target, targetHandle };
}

function graph(nodes: FlowNode[], edges: FlowEdge[]): WorkflowGraph {
  return { nodes, edges };
}

/** textInput(value) -> output */
function simpleTextFlow(value = 'hello'): { g: WorkflowGraph; out: FlowNode } {
  const input = node('textInput', { value });
  const out = node('output', {});
  return { g: graph([input, out], [edge(input.id, 'value', out.id, 'in')]), out };
}

describe('port type compatibility', () => {
  it('matches equal types', () => {
    expect(arePortsCompatible('string', 'string')).toBe(true);
    expect(arePortsCompatible('number', 'number')).toBe(true);
  });

  it('treats any as compatible with everything', () => {
    expect(arePortsCompatible('any', 'string')).toBe(true);
    expect(arePortsCompatible('number', 'any')).toBe(true);
    expect(arePortsCompatible('any', 'any')).toBe(true);
  });

  it('rejects mismatched concrete types', () => {
    expect(arePortsCompatible('string', 'number')).toBe(false);
    expect(arePortsCompatible('number', 'string')).toBe(false);
  });
});

describe('graph validation', () => {
  it('accepts a valid simple graph', () => {
    const { g } = simpleTextFlow();
    expect(validateWorkflow(g)).toEqual([]);
  });

  it('accepts an empty graph', () => {
    expect(validateWorkflow(graph([], []))).toEqual([]);
  });

  it('flags unknown node types', () => {
    const bad = node('textInput', {});
    (bad as { type: string }).type = 'teleport';
    const issues = validateWorkflow(graph([bad], []));
    expect(issues.some((i) => i.code === 'unknown-node-type')).toBe(true);
  });

  it('flags invalid node configuration', () => {
    const bad = node('numberInput', { value: 'not-a-number' });
    const issues = validateWorkflow(graph([bad], []));
    expect(issues.some((i) => i.code === 'invalid-node-config')).toBe(true);
  });

  it('flags missing required inputs', () => {
    const t = node('textTransform', { operation: 'uppercase', text: '' });
    const issues = validateWorkflow(graph([t], []));
    expect(issues.some((i) => i.code === 'missing-required-input')).toBe(true);
  });

  it('flags incompatible port connections', () => {
    const num = node('numberInput', { value: 5 });
    const t = node('textTransform', { operation: 'uppercase', text: '' });
    const g = graph([num, t], [edge(num.id, 'value', t.id, 'in')]);
    expect(validateWorkflow(g).some((i) => i.code === 'incompatible-ports')).toBe(true);
  });

  it('flags duplicate connections to one input port', () => {
    const a = node('textInput', { value: 'a' });
    const b = node('textInput', { value: 'b' });
    const out = node('output', {});
    const g = graph(
      [a, b, out],
      [edge(a.id, 'value', out.id, 'in'), edge(b.id, 'value', out.id, 'in')],
    );
    expect(validateWorkflow(g).some((i) => i.code === 'duplicate-input-connection')).toBe(true);
  });

  it('flags edges referencing unknown nodes', () => {
    const a = node('textInput', { value: 'a' });
    const g = graph([a], [edge(a.id, 'value', 'ghost', 'in')]);
    expect(validateWorkflow(g).some((i) => i.code === 'unknown-edge-node')).toBe(true);
  });

  it('flags edges referencing unknown ports', () => {
    const a = node('textInput', { value: 'a' });
    const out = node('output', {});
    const g = graph([a, out], [edge(a.id, 'nope', out.id, 'in')]);
    expect(validateWorkflow(g).some((i) => i.code === 'unknown-port')).toBe(true);
  });

  it('flags duplicate node ids', () => {
    const a = node('textInput', { value: 'a' }, 'same');
    const b = node('textInput', { value: 'b' }, 'same');
    expect(validateWorkflow(graph([a, b], [])).some((i) => i.code === 'duplicate-node-id')).toBe(
      true,
    );
  });

  it('detects cycles', () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const g = graph(
      [a, b],
      [edge(a.id, 'out', b.id, 'in'), edge(b.id, 'out', a.id, 'in')],
    );
    expect(validateWorkflow(g).some((i) => i.code === 'cycle-detected')).toBe(true);
  });

  it('detects self loops as cycles', () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const g = graph([a], [edge(a.id, 'out', a.id, 'in')]);
    expect(validateWorkflow(g).some((i) => i.code === 'cycle-detected')).toBe(true);
  });
});

describe('topological ordering', () => {
  it('orders dependencies before dependents', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const b = node('textTransform', { operation: 'uppercase', text: '' }, 'b');
    const c = node('output', {}, 'c');
    const g = graph(
      [c, a, b],
      [edge(a.id, 'value', b.id, 'in'), edge(b.id, 'out', c.id, 'in')],
    );
    const result = topologicalOrder(g);
    expect(result.order).toEqual(['a', 'b', 'c']);
  });

  it('handles diamond graphs', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const b = node('textTransform', { operation: 'uppercase', text: '' }, 'b');
    const c = node('textTransform', { operation: 'lowercase', text: '' }, 'c');
    const m = node('mergeText', { separator: '|' }, 'm');
    const g = graph(
      [a, b, c, m],
      [
        edge(a.id, 'value', b.id, 'in'),
        edge(a.id, 'value', c.id, 'in'),
        edge(b.id, 'out', m.id, 'a'),
        edge(c.id, 'out', m.id, 'b'),
      ],
    );
    const result = topologicalOrder(g);
    expect(result.order).not.toBeNull();
    const order = result.order as string[];
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('m'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('m'));
  });

  it('ignores edges referencing unknown nodes', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const g = graph([a], [edge(a.id, 'value', 'ghost', 'in')]);
    const result = topologicalOrder(g);
    expect(result.order).toEqual(['a']);
  });

  it('reports the cycle when the graph is cyclic', () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const g = graph(
      [a, b],
      [edge(a.id, 'out', b.id, 'in'), edge(b.id, 'out', a.id, 'in')],
    );
    const result = topologicalOrder(g);
    expect(result.order).toBeNull();
    if (result.order === null) {
      expect(result.cycle.length).toBeGreaterThan(0);
    }
  });
});

describe('findCycle', () => {
  it('returns null for acyclic graphs', () => {
    const { g } = simpleTextFlow();
    expect(findCycle(g)).toBeNull();
  });

  it('returns the nodes forming a cycle', () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const c = node('textTransform', { operation: 'trim', text: '' }, 'c');
    const g = graph(
      [a, b, c],
      [edge(a.id, 'out', b.id, 'in'), edge(b.id, 'out', c.id, 'in'), edge(c.id, 'out', a.id, 'in')],
    );
    const cycle = findCycle(g);
    expect(cycle).not.toBeNull();
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('canConnect', () => {
  it('allows compatible connections', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const b = node('output', {}, 'b');
    const g = graph([a, b], []);
    expect(
      canConnect(g, { source: 'a', sourceHandle: 'value', target: 'b', targetHandle: 'in' }).ok,
    ).toBe(true);
  });

  it('rejects type mismatches with a reason', () => {
    const a = node('numberInput', { value: 1 }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const g = graph([a, b], []);
    const check = canConnect(g, {
      source: 'a',
      sourceHandle: 'value',
      target: 'b',
      targetHandle: 'in',
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/mismatch/i);
  });

  it('rejects self connections', () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const g = graph([a], []);
    const check = canConnect(g, {
      source: 'a',
      sourceHandle: 'out',
      target: 'a',
      targetHandle: 'in',
    });
    expect(check.ok).toBe(false);
  });

  it('rejects a second edge into the same input port', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const b = node('textInput', { value: 'y' }, 'b');
    const c = node('output', {}, 'c');
    const g = graph([a, b, c], [edge(a.id, 'value', c.id, 'in')]);
    const check = canConnect(g, {
      source: 'b',
      sourceHandle: 'value',
      target: 'c',
      targetHandle: 'in',
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/already has a connection/i);
  });

  it('rejects connections that would create a cycle', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const c = node('output', {}, 'c');
    const g = graph(
      [a, b, c],
      [edge(a.id, 'value', b.id, 'in'), edge(b.id, 'out', c.id, 'in')],
    );
    // c has no outputs; use a longer chain: b -> a would cycle a -> b -> a
    const check = canConnect(g, {
      source: 'b',
      sourceHandle: 'out',
      target: 'a',
      targetHandle: 'value',
    });
    // 'a' (textInput) has no input ports at all
    expect(check.ok).toBe(false);
  });

  it('rejects an edge that closes a cycle between transforms', () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const g = graph([a, b], [edge(a.id, 'out', b.id, 'in')]);
    const check = canConnect(g, {
      source: 'b',
      sourceHandle: 'out',
      target: 'a',
      targetHandle: 'in',
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/cycle/i);
  });

  it('rejects unknown ports', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const b = node('output', {}, 'b');
    const g = graph([a, b], []);
    expect(
      canConnect(g, { source: 'a', sourceHandle: 'nope', target: 'b', targetHandle: 'in' }).ok,
    ).toBe(false);
  });

  it('rejects connections involving unknown node types', () => {
    const bad = {
      ...node('textInput', { value: 'x' }, 'bad'),
      type: 'teleport',
    } as unknown as FlowNode;
    const b = node('output', {}, 'b');
    const g = graph([bad, b], []);
    const check = canConnect(g, {
      source: 'bad',
      sourceHandle: 'value',
      target: 'b',
      targetHandle: 'in',
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/unknown node type/i);
  });

  it('rejects connections to unknown nodes', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const g = graph([a], []);
    expect(
      canConnect(g, { source: 'a', sourceHandle: 'value', target: 'ghost', targetHandle: 'in' }).ok,
    ).toBe(false);
  });
});

describe('node operations', () => {
  async function runValue(type: NodeTypeId, data: Record<string, unknown>, inputValue?: string | number) {
    const inputNode = inputValue !== undefined ? node(typeof inputValue === 'string' ? 'textInput' : 'numberInput', { value: inputValue }) : null;
    const target = node(type, data);
    const out = node('output', {});
    const nodes = inputNode ? [inputNode, target, out] : [target, out];
    const def = getNodeDefinition(type);
    const edges: FlowEdge[] = [];
    if (inputNode) {
      const inPort = def.inputs[0].id;
      edges.push(edge(inputNode.id, 'value', target.id, inPort));
      // second input for two-input nodes
      if (def.inputs[1] && typeof inputValue === 'number') {
        const second = node('numberInput', { value: 0 });
        nodes.push(second);
        edges.push(edge(second.id, 'value', target.id, def.inputs[1].id));
      }
      if (def.inputs[1] && typeof inputValue === 'string') {
        const second = node('textInput', { value: '' });
        nodes.push(second);
        edges.push(edge(second.id, 'value', target.id, def.inputs[1].id));
      }
    }
    edges.push(edge(target.id, def.outputs[0]?.id ?? 'out', out.id, 'in'));
    const result = await executeWorkflow(graph(nodes, edges));
    return result.nodeResults[target.id];
  }

  it('textInput produces its configured string', async () => {
    const { g, out } = simpleTextFlow('hello world');
    const result = await executeWorkflow(g);
    expect(result.nodeResults[out.id]?.status).toBe('success');
    expect(result.hasErrors).toBe(false);
  });

  it('textTransform uppercases', async () => {
    const r = await runValue('textTransform', { operation: 'uppercase', text: '' }, 'hello');
    expect(r?.status).toBe('success');
    expect(r?.outputs['out']).toBe('HELLO');
  });

  it('textTransform lowercases', async () => {
    const r = await runValue('textTransform', { operation: 'lowercase', text: '' }, 'HeLLo');
    expect(r?.outputs['out']).toBe('hello');
  });

  it('textTransform trims whitespace', async () => {
    const r = await runValue('textTransform', { operation: 'trim', text: '' }, '  hi  ');
    expect(r?.outputs['out']).toBe('hi');
  });

  it('textTransform appends and prepends', async () => {
    const appended = await runValue('textTransform', { operation: 'append', text: '!' }, 'hi');
    expect(appended?.outputs['out']).toBe('hi!');
    const prepended = await runValue('textTransform', { operation: 'prepend', text: '>> ' }, 'hi');
    expect(prepended?.outputs['out']).toBe('>> hi');
  });

  it('mathTransform adds, multiplies and divides', async () => {
    const build = async (operation: string, a: number, b: number) => {
      const na = node('numberInput', { value: a });
      const nb = node('numberInput', { value: b });
      const math = node('mathTransform', { operation });
      const out = node('output', {});
      const g = graph(
        [na, nb, math, out],
        [
          edge(na.id, 'value', math.id, 'a'),
          edge(nb.id, 'value', math.id, 'b'),
          edge(math.id, 'out', out.id, 'in'),
        ],
      );
      const result = await executeWorkflow(g);
      return result.nodeResults[math.id];
    };
    expect((await build('add', 2, 3))?.outputs['out']).toBe(5);
    expect((await build('multiply', 2, 3))?.outputs['out']).toBe(6);
    expect((await build('divide', 7, 2))?.outputs['out']).toBe(3.5);
  });

  it('mathTransform rejects division by zero without crashing', async () => {
    const na = node('numberInput', { value: 7 });
    const nb = node('numberInput', { value: 0 });
    const math = node('mathTransform', { operation: 'divide' });
    const other = node('textInput', { value: 'independent' });
    const out = node('output', {});
    const g = graph(
      [na, nb, math, other, out],
      [
        edge(na.id, 'value', math.id, 'a'),
        edge(nb.id, 'value', math.id, 'b'),
        edge(other.id, 'value', out.id, 'in'),
      ],
    );
    const result = await executeWorkflow(g);
    expect(result.nodeResults[math.id]?.status).toBe('error');
    expect(result.nodeResults[math.id]?.error).toMatch(/zero/i);
    expect(result.hasErrors).toBe(true);
    // Independent branch still succeeds.
    expect(result.nodeResults[other.id]?.status).toBe('success');
    expect(result.nodeResults[out.id]?.status).toBe('success');
  });

  it('mergeText concatenates with the separator', async () => {
    const a = node('textInput', { value: 'foo' });
    const b = node('textInput', { value: 'bar' });
    const merge = node('mergeText', { separator: ' - ' });
    const out = node('output', {});
    const g = graph(
      [a, b, merge, out],
      [
        edge(a.id, 'value', merge.id, 'a'),
        edge(b.id, 'value', merge.id, 'b'),
        edge(merge.id, 'out', out.id, 'in'),
      ],
    );
    const result = await executeWorkflow(g);
    expect(result.nodeResults[merge.id]?.outputs['out']).toBe('foo - bar');
  });
});

describe('conditional branching', () => {
  function branchGraph(inputValue: string) {
    const input = node('textInput', { value: inputValue });
    const cond = node('condition', {
      mode: 'text',
      textOperator: 'contains',
      numberOperator: 'greaterThan',
      compareValue: 'urgent',
    });
    const outTrue = node('output', {});
    const outFalse = node('output', {});
    const g = graph(
      [input, cond, outTrue, outFalse],
      [
        edge(input.id, 'value', cond.id, 'in'),
        edge(cond.id, 'true', outTrue.id, 'in'),
        edge(cond.id, 'false', outFalse.id, 'in'),
      ],
    );
    return { g, cond, outTrue, outFalse };
  }

  it('routes through the TRUE branch when the condition passes', async () => {
    const { g, outTrue, outFalse } = branchGraph('urgent: fix now');
    const result = await executeWorkflow(g);
    expect(result.nodeResults[outTrue.id]?.status).toBe('success');
    expect(result.nodeResults[outFalse.id]?.status).toBe('skipped');
    expect(result.hasErrors).toBe(false);
  });

  it('routes through the FALSE branch when the condition fails', async () => {
    const { g, outTrue, outFalse } = branchGraph('all calm here');
    const result = await executeWorkflow(g);
    expect(result.nodeResults[outFalse.id]?.status).toBe('success');
    expect(result.nodeResults[outTrue.id]?.status).toBe('skipped');
  });

  it('compares numbers with greater-than / less-than', async () => {
    const build = (value: number, operator: string, compareValue: string) => {
      const input = node('numberInput', { value });
      const cond = node('condition', {
        mode: 'number',
        textOperator: 'contains',
        numberOperator: operator,
        compareValue,
      });
      const outTrue = node('output', {});
      const outFalse = node('output', {});
      return {
        g: graph(
          [input, cond, outTrue, outFalse],
          [
            edge(input.id, 'value', cond.id, 'in'),
            edge(cond.id, 'true', outTrue.id, 'in'),
            edge(cond.id, 'false', outFalse.id, 'in'),
          ],
        ),
        outTrue,
        outFalse,
      };
    };
    const gt = build(10, 'greaterThan', '5');
    const r1 = await executeWorkflow(gt.g);
    expect(r1.nodeResults[gt.outTrue.id]?.status).toBe('success');

    const lt = build(3, 'lessThan', '5');
    const r2 = await executeWorkflow(lt.g);
    expect(r2.nodeResults[lt.outTrue.id]?.status).toBe('success');

    const fail = build(3, 'greaterThan', '5');
    const r3 = await executeWorkflow(fail.g);
    expect(r3.nodeResults[fail.outFalse.id]?.status).toBe('success');
  });

  it('compares text with equals', async () => {
    const input = node('textInput', { value: 'yes' });
    const cond = node('condition', {
      mode: 'text',
      textOperator: 'equals',
      numberOperator: 'greaterThan',
      compareValue: 'yes',
    });
    const outTrue = node('output', {});
    const g = graph(
      [input, cond, outTrue],
      [edge(input.id, 'value', cond.id, 'in'), edge(cond.id, 'true', outTrue.id, 'in')],
    );
    const result = await executeWorkflow(g);
    expect(result.nodeResults[outTrue.id]?.status).toBe('success');
  });

  it('errors on non-numeric input in number mode', async () => {
    const input = node('textInput', { value: 'abc' });
    const cond = node('condition', {
      mode: 'number',
      textOperator: 'contains',
      numberOperator: 'greaterThan',
      compareValue: '5',
    });
    const g = graph([input, cond], [edge(input.id, 'value', cond.id, 'in')]);
    const result = await executeWorkflow(g);
    expect(result.nodeResults[cond.id]?.status).toBe('error');
    expect(result.hasErrors).toBe(true);
  });

  it('errors on an invalid numeric compare value', async () => {
    const input = node('numberInput', { value: 10 });
    const cond = node('condition', {
      mode: 'number',
      textOperator: 'contains',
      numberOperator: 'greaterThan',
      compareValue: 'not-a-number',
    });
    const g = graph([input, cond], [edge(input.id, 'value', cond.id, 'in')]);
    const result = await executeWorkflow(g);
    expect(result.nodeResults[cond.id]?.status).toBe('error');
  });

  it('passes the original value through the taken branch', async () => {
    const { g, cond } = branchGraph('urgent: fix now');
    const result = await executeWorkflow(g);
    expect(result.nodeResults[cond.id]?.outputs['true']).toBe('urgent: fix now');
    expect(result.nodeResults[cond.id]?.outputs['false']).toBeUndefined();
  });
});

describe('execution engine', () => {
  it('refuses to execute an invalid graph', async () => {
    const t = node('textTransform', { operation: 'uppercase', text: '' });
    await expect(executeWorkflow(graph([t], []))).rejects.toBeInstanceOf(
      WorkflowValidationError,
    );
  });

  it('refuses to execute a cyclic graph', async () => {
    const a = node('textTransform', { operation: 'trim', text: '' }, 'a');
    const b = node('textTransform', { operation: 'trim', text: '' }, 'b');
    const g = graph(
      [a, b],
      [edge(a.id, 'out', b.id, 'in'), edge(b.id, 'out', a.id, 'in')],
    );
    await expect(executeWorkflow(g)).rejects.toBeInstanceOf(WorkflowValidationError);
  });

  it('executes multiple independent input nodes', async () => {
    const a = node('textInput', { value: 'x' });
    const b = node('numberInput', { value: 7 });
    const outA = node('output', {});
    const outB = node('output', {});
    const g = graph(
      [a, b, outA, outB],
      [edge(a.id, 'value', outA.id, 'in'), edge(b.id, 'value', outB.id, 'in')],
    );
    const result = await executeWorkflow(g);
    expect(result.hasErrors).toBe(false);
    expect(result.nodeResults[outA.id]?.status).toBe('success');
    expect(result.nodeResults[outB.id]?.status).toBe('success');
  });

  it('produces an ordered execution log', async () => {
    const { g } = simpleTextFlow('hi');
    const result = await executeWorkflow(g);
    expect(result.log.length).toBeGreaterThan(0);
    const seqs = result.log.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(result.log[0].message).toMatch(/run started/i);
    expect(result.log[result.log.length - 1].message).toMatch(/run finished/i);
  });

  it('tracks per-node status and outputs', async () => {
    const { g } = simpleTextFlow('hi');
    const result = await executeWorkflow(g);
    for (const n of g.nodes) {
      expect(result.nodeResults[n.id]?.status).toBe('success');
    }
  });

  it('supports aborting a run', async () => {
    const { g } = simpleTextFlow('hi');
    const controller = new AbortController();
    controller.abort();
    const result = await executeWorkflow(g, { signal: controller.signal });
    expect(result.aborted).toBe(true);
  });

  it('reports progress via onNodeUpdate', async () => {
    const { g } = simpleTextFlow('hi');
    const seen: string[] = [];
    await executeWorkflow(g, {
      onNodeUpdate: (nodeId, result) => {
        if (result) seen.push(`${nodeId}:${result.status}`);
      },
    });
    expect(seen.length).toBe(g.nodes.length);
    expect(seen.every((s) => s.endsWith(':success'))).toBe(true);
  });

  it('marks downstream nodes skipped when a node errors', async () => {
    const na = node('numberInput', { value: 1 });
    const nb = node('numberInput', { value: 0 });
    const math = node('mathTransform', { operation: 'divide' });
    const out = node('output', {});
    const g = graph(
      [na, nb, math, out],
      [
        edge(na.id, 'value', math.id, 'a'),
        edge(nb.id, 'value', math.id, 'b'),
        edge(math.id, 'out', out.id, 'in'),
      ],
    );
    const result = await executeWorkflow(g);
    expect(result.nodeResults[math.id]?.status).toBe('error');
    expect(result.nodeResults[out.id]?.status).toBe('skipped');
  });

  it('assertValidWorkflow throws with issues listed', () => {
    const t = node('textTransform', { operation: 'uppercase', text: '' });
    try {
      assertValidWorkflow(graph([t], []));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowValidationError);
      expect((err as WorkflowValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe('execution timeout', () => {
  it('aborts runs that exceed timeoutMs', async () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const d = node('delay', { ms: 5000 }, 'd');
    const o = node('output', {}, 'o');
    const g = graph(
      [a, d, o],
      [edge(a.id, 'value', d.id, 'in'), edge(d.id, 'out', o.id, 'in')],
    );
    const result = await executeWorkflow(g, { timeoutMs: 120 });
    expect(result.timedOut).toBe(true);
    expect(result.aborted).toBe(true);
    expect(result.log.some((e) => e.message.includes('timed out'))).toBe(true);
    expect(result.nodeResults['o']?.status).toBe('skipped');
  });

  it('does not time out fast runs', async () => {
    const { g } = simpleTextFlow();
    const result = await executeWorkflow(g, { timeoutMs: 5000 });
    expect(result.timedOut).toBe(false);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.edgeValues).toBeDefined();
  });

  it('timeoutMs: 0 disables the timeout', async () => {
    const { g } = simpleTextFlow();
    const result = await executeWorkflow(g, { timeoutMs: 0 });
    expect(result.timedOut).toBe(false);
  });
});

describe('dead-end warnings', () => {
  it('warns about nodes whose outputs go nowhere', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const t = node('textTransform', { operation: 'uppercase' }, 't');
    const g = graph([a, t], [edge(a.id, 'value', t.id, 'in')]);
    const issues = validateWorkflow(g);
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('dead-end');
    expect(warnings[0].nodeId).toBe('t');
    // Warnings don't block execution.
    expect(issues.filter((i) => i.severity !== 'warning')).toEqual([]);
  });

  it('does not warn for output and note sinks', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const o = node('output', {}, 'o');
    const n = node('note', { text: 'hi' }, 'n');
    const g = graph([a, o, n], [edge(a.id, 'value', o.id, 'in')]);
    expect(validateWorkflow(g).filter((i) => i.severity === 'warning')).toEqual([]);
  });

  it('assertValidWorkflow ignores warnings', () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const t = node('textTransform', { operation: 'uppercase' }, 't');
    const g = graph([a, t], [edge(a.id, 'value', t.id, 'in')]);
    expect(() => assertValidWorkflow(g)).not.toThrow();
  });
});

describe('async node execution', () => {
  it('awaits async execute functions', async () => {
    const a = node('textInput', { value: 'x' }, 'a');
    const d = node('delay', { ms: 5 }, 'd');
    const o = node('output', {}, 'o');
    const g = graph(
      [a, d, o],
      [edge(a.id, 'value', d.id, 'in'), edge(d.id, 'out', o.id, 'in')],
    );
    const result = await executeWorkflow(g);
    expect(result.nodeResults['d']?.status).toBe('success');
    expect(result.nodeResults['d']?.outputs['out']).toBe('x');
  });

  it('records edge values for taken edges', async () => {
    const { g } = simpleTextFlow();
    const result = await executeWorkflow(g);
    const values = Object.values(result.edgeValues);
    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain('hello');
  });

  it('switch routes through exactly one branch', async () => {
    const inp = node('textInput', { value: 'b' }, 'inp');
    const sw = node('switch', { mode: 'text', case1Value: 'a', case2Value: 'b' }, 'sw');
    const o1 = node('output', {}, 'o1');
    const o2 = node('output', {}, 'o2');
    const g = graph(
      [inp, sw, o1, o2],
      [
        edge(inp.id, 'value', sw.id, 'in'),
        edge(sw.id, 'case1', o1.id, 'in'),
        edge(sw.id, 'case2', o2.id, 'in'),
      ],
    );
    const result = await executeWorkflow(g);
    expect(result.nodeResults['o1']?.status).toBe('skipped');
    expect(result.nodeResults['o2']?.status).toBe('success');
    expect(result.nodeResults['o2']?.outputs['in']).toBe('b');
  });
});
