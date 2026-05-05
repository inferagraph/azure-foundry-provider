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

## License

MIT
