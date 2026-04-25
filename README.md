# @inferagraph/azure-foundry-provider

Azure AI Foundry provider plugin for [@inferagraph/core](https://github.com/inferagraph/core).

Supports any model in the Azure AI model catalog via the Azure AI Inference SDK.

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
});
```

## License

MIT
