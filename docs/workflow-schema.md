# FlowLab Workflow JSON Schema

Workflows are portable JSON documents. The `version` field selects the schema;
FlowLab migrates older versions on import (see `src/lib/workflow/migrations.ts`).

Current version: **1**

## Version 1

```jsonc
{
  "version": 1,
  "id": "wf-a1b2c3d4",            // unique workflow id
  "name": "My workflow",
  "createdAt": "2026-10-10T10:00:00.000Z",  // ISO 8601
  "updatedAt": "2026-10-10T10:30:00.000Z",  // ISO 8601
  "nodes": [
    {
      "id": "node-1a2b3c4d",
      "type": "textInput",        // one of the node types below
      "position": { "x": 40, "y": 80 },
      "label": "Name",            // optional user label
      "data": { "value": "ada" }  // node-type-specific config
    }
  ],
  "edges": [
    {
      "id": "edge-5e6f7a8b",
      "source": "node-1a2b3c4d",
      "sourceHandle": "value",    // output port id on the source node
      "target": "node-9c8d7e6f",
      "targetHandle": "in"        // input port id on the target node
    }
  ]
}
```

Constraints enforced on import:

- `id` values are unique within their collection.
- `type` is a known node type; `data` validates against that type's schema.
- `sourceHandle`/`targetHandle` name real output/input ports.
- Port data types are compatible (`string`↔`string`, `number`↔`number`,
  `any`↔anything).
- Every required input port has exactly one incoming edge.
- The graph is acyclic.

## Node types, ports, and configuration

Port types: `string`, `number`, `any` (`any` connects to anything).

| Type            | Inputs                              | Outputs              | Config (`data`)                                                                 |
|-----------------|-------------------------------------|----------------------|---------------------------------------------------------------------------------|
| `textInput`     | —                                   | `value: string`      | `{ value: string }`                                                             |
| `numberInput`   | —                                   | `value: number`      | `{ value: number }`                                                             |
| `textTransform` | `in: string`                        | `out: string`        | `{ operation: "uppercase" \| "lowercase" \| "trim" \| "append" \| "prepend", text?: string }` |
| `mathTransform` | `a: number`, `b: number`            | `out: number`        | `{ operation: "add" \| "multiply" \| "divide" }`                                 |
| `condition`     | `in: any`                           | `true: any`, `false: any` | `{ mode: "text" \| "number", textOperator: "equals" \| "contains", numberOperator: "greaterThan" \| "lessThan", compareValue: string }` |
| `mergeText`     | `a: string`, `b: string`            | `out: string`        | `{ separator: string }`                                                         |
| `output`        | `in: any`                           | —                    | `{}`                                                                            |

Notes:

- `condition` routes the original input value through exactly one of `true` /
  `false`. In `number` mode the input must be numeric and `compareValue` must
  parse as a number.
- `mathTransform` with `operation: "divide"` and `b = 0` fails the node with
  a "division by zero" error; other branches keep running.
- `mergeText` executes only after both `a` and `b` have values.

## Version 0 (legacy)

The original beta format, still accepted on import and migrated to v1:

- Nodes stored config under `params` instead of `data`, and had no `label`.
- Edges had no `id` (ids are generated during migration).
- No `createdAt` / `updatedAt` (set to migration time).

```jsonc
{
  "version": 0,
  "id": "wf-old",
  "name": "Legacy",
  "nodes": [{ "id": "n1", "type": "textInput",
               "position": { "x": 0, "y": 0 },
               "params": { "value": "hi" } }],
  "edges": [{ "source": "n1", "sourceHandle": "value",
               "target": "n2", "targetHandle": "in" }]
}
```

Unknown future versions are rejected with a clear error.
