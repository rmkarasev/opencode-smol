# Plugin Hooks Reference

> Refreshed on 2026-04-02
> Source: `packages/plugin/src/index.ts`

<api_reference>

## Plugin Function Signature

```typescript
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>
  project: Project
  directory: string
  worktree: string
  serverUrl: URL
  $: BunShell
}

export type PluginOptions = Record<string, unknown>

export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
```

## Hooks Interface

```typescript
export interface Hooks {
  event?: (input: { event: Event }) => Promise<void>
  config?: (input: Config) => Promise<void>
  tool?: {
    [key: string]: ToolDefinition
  }
  auth?: AuthHook
  provider?: ProviderHook
  "chat.message"?: (
    input: {
      sessionID: string
      agent?: string
      model?: { providerID: string; modelID: string }
      messageID?: string
      variant?: string
    },
    output: { message: UserMessage; parts: Part[] },
  ) => Promise<void>
  "chat.params"?: (
    input: { sessionID: string; agent: string; model: Model; provider: ProviderContext; message: UserMessage },
    output: { temperature: number; topP: number; topK: number; options: Record<string, any> },
  ) => Promise<void>
  "chat.headers"?: (
    input: { sessionID: string; agent: string; model: Model; provider: ProviderContext; message: UserMessage },
    output: { headers: Record<string, string> },
  ) => Promise<void>
  "permission.ask"?: (input: Permission, output: { status: "ask" | "deny" | "allow" }) => Promise<void>
  "command.execute.before"?: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Part[] },
  ) => Promise<void>
  "tool.execute.before"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any },
  ) => Promise<void>
  "shell.env"?: (
    input: { cwd: string; sessionID?: string; callID?: string },
    output: { env: Record<string, string> },
  ) => Promise<void>
  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: { title: string; output: string; metadata: any },
  ) => Promise<void>
  "experimental.chat.messages.transform"?: (
    input: {},
    output: {
      messages: {
        info: Message
        parts: Part[]
      }[]
    },
  ) => Promise<void>
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string; model: Model },
    output: { system: string[] },
  ) => Promise<void>
  "experimental.session.compacting"?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => Promise<void>
  "experimental.text.complete"?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ) => Promise<void>
  "tool.definition"?: (input: { toolID: string }, output: { description: string; parameters: any }) => Promise<void>
}
```

</api_reference>

<hook_categories>

## Hook Categories

### Event Hook
- `event`: Receives all events, use `event.type` to discriminate.

### Tool Hooks
- `tool`: Register custom tools.
- `tool.definition`: Modify the tool definition shown to the model.

### Chat Hooks
- `chat.message`: Intercept/modify user messages before processing.
- `chat.params`: Modify LLM parameters.
- `chat.headers`: Inject provider request headers.

### Permission / Command Hooks
- `permission.ask`: Override permission decisions.
- `command.execute.before`: Transform slash-command arguments before execution.

### Tool Execution / Shell Hooks
- `tool.execute.before`: Intercept before a tool runs and mutate args.
- `tool.execute.after`: Post-process tool output and metadata.
- `shell.env`: Inject environment variables into shell execution.

### Config / Auth / Provider Hooks
- `config`: Modify configuration on load.
- `auth`: Custom provider authentication.
- `provider`: Extend providers/models.

### Experimental Hooks
- `experimental.chat.messages.transform`
- `experimental.chat.system.transform`
- `experimental.session.compacting`
- `experimental.text.complete`

</hook_categories>

<auth_hook_types>

## Auth Hook Notes

- Prompt entries now support `when?: { key, op, value }`.
- Older `condition?: (inputs) => boolean` remains a deprecated compatibility surface.
- The canonical result type is `AuthOAuthResult`.

</auth_hook_types>
