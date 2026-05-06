# @inferagraph/azure-foundry-provider

Azure AI Foundry provider plugin for [@inferagraph/core](https://github.com/inferagraph/core).

Supports any model in the Azure AI model catalog via the [Azure AI Inference SDK](https://www.npmjs.com/package/@azure-rest/ai-inference) (`@azure-rest/ai-inference`).

## Installation

```bash
pnpm add @inferagraph/azure-foundry-provider @inferagraph/core
```

## Usage

```typescript
import { AzureFoundryProvider } from '@inferagraph/azure-foundry-provider';

const provider = new AzureFoundryProvider({
  endpoint: 'https://your-endpoint.inference.ai.azure.com',
  apiKey: 'your-api-key',
  deploymentName: 'gpt-4o',  // optional, sent as `model` on the request
  maxTokens: 1024,           // optional, default 1024
});
```

### Configuration

| Option | Required | Description |
|---|---|---|
| `endpoint` | Yes | Azure AI Foundry endpoint URL |
| `apiKey` | One of `apiKey` / `credential` | Azure key for the deployment |
| `credential` | One of `apiKey` / `credential` | Any `@azure/core-auth` `TokenCredential` (e.g., `DefaultAzureCredential`) |
| `deploymentName` | No | Sent as `model` in the request body when set |
| `maxTokens` | No | Default `max_tokens` (1024) |

```ts
import { DefaultAzureCredential } from '@azure/identity';

new AzureFoundryProvider({
  endpoint: 'https://your-endpoint.inference.ai.azure.com',
  credential: new DefaultAzureCredential(),
});
```

## Capabilities

The provider implements `@inferagraph/core`'s `LLMProvider` contract:

| Method | Supported | Notes |
|---|---|---|
| `complete(prompt, opts?)` | Yes | Single-shot completion via `/chat/completions`. |
| `stream(prompt, opts?)` | Yes | Single-string streaming. Kept for back-compat — new consumers should prefer `streamMessages`. |
| `streamMessages(messages, opts?)` | Yes | Structured `[{role, content}]` streaming. `system` / `user` / `assistant` roles map 1:1 onto Foundry's OpenAI-compatible `messages` array, so system instructions stay separate from user input end-to-end. Honors `opts.signal` (AbortController), `opts.maxTokens`, `opts.temperature`, and `opts.tools`. |
| `embed(texts, opts?)` | **No** | The `@azure-rest/ai-inference` SDK targets chat-completion routes only; this provider has no native embedding endpoint, so `embed` is intentionally **omitted** (`'embed' in provider === false`). Mirrors the `@inferagraph/anthropic-provider` no-Voyage path. Hosts that need embeddings pair Foundry chat with a separate embedding-capable provider (for example `@inferagraph/openai-provider` configured with an `embeddingDeployment`). The structural absence lets `AIEngine` detect the missing capability and route embedding work elsewhere. |

```ts
import { AzureFoundryProvider } from '@inferagraph/azure-foundry-provider';

const provider = new AzureFoundryProvider({
  endpoint: 'https://your-endpoint.inference.ai.azure.com',
  apiKey: 'your-api-key',
});

for await (const event of provider.streamMessages([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hi.' },
])) {
  if (event.type === 'text') process.stdout.write(event.delta);
}
```

## License

MIT
