# Tool Helper Reference

> Refreshed on 2026-04-02
> Source: `packages/plugin/src/tool.ts`

<api_reference>

## Tool Definition

```typescript
import { z } from "zod"

export type ToolContext = {
  sessionID: string
  messageID: string
  agent: string
  directory: string
  worktree: string
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): void
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: { [key: string]: any }
  }): Promise<void>
}

export function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>
}) {
  return input
}
tool.schema = z

export type ToolDefinition = ReturnType<typeof tool>
```

## Usage Pattern

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async () => {
  return {
    tool: {
      myTool: tool({
        description: "What this tool does",
        args: {
          input: tool.schema.string().describe("Input parameter"),
          count: tool.schema.number().optional().describe("Optional count"),
        },
        async execute(args, context) {
          context.metadata({
            title: "Running myTool",
            metadata: { input: args.input },
          })

          return `Result from ${context.directory}: ${args.input}`
        },
      }),
    },
  }
}
```

</api_reference>

<zod_reference>

## Zod Schema Methods

`tool.schema` is Zod. Common methods:

| Method | Description |
|--------|-------------|
| `.string()` | String argument |
| `.number()` | Number argument |
| `.boolean()` | Boolean argument |
| `.array(schema)` | Array of items |
| `.object({ ... })` | Nested object |
| `.enum(["a", "b"])` | Enum values |
| `.optional()` | Make optional |
| `.default(val)` | Default value |
| `.describe("...")` | Add description for the model |

</zod_reference>

<tool_context>

## Tool Context Notes

- Use `context.directory` for the current session working directory.
- Use `context.worktree` for stable project-root-relative paths.
- Use `context.metadata()` to stream progress or attach rich metadata.
- Use `context.ask()` when the tool needs to trigger a permission workflow.

</tool_context>
