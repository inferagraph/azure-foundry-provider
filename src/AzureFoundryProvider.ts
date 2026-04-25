import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import type { AzureKeyCredential } from '@azure/core-auth';
import { LLMProvider } from '@inferagraph/core';
import type { LLMCompletionRequest, LLMCompletionResponse } from '@inferagraph/core';
import type { AzureFoundryProviderConfig } from './types.js';

const DEFAULT_MAX_TOKENS = 1024;

export class AzureFoundryProvider extends LLMProvider {
  readonly name = 'azure-foundry';
  private readonly client: ReturnType<typeof ModelClient>;
  private readonly deploymentName: string | undefined;
  private readonly maxTokens: number;

  constructor(config: AzureFoundryProviderConfig) {
    super();

    if (config.apiKey) {
      this.client = ModelClient(config.endpoint, { key: config.apiKey } as AzureKeyCredential);
    } else if (config.credential) {
      this.client = ModelClient(config.endpoint, config.credential);
    } else {
      throw new Error('Either apiKey or credential must be provided');
    }

    this.deploymentName = config.deploymentName;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.client.path('/chat/completions').post({
      body: {
        messages,
        max_tokens: request.maxTokens ?? this.maxTokens,
        ...(this.deploymentName ? { model: this.deploymentName } : {}),
      },
    });

    if (isUnexpected(response)) {
      throw new Error(`Azure AI Foundry request failed: ${response.status}`);
    }

    const choice = response.body.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      usage: response.body.usage
        ? {
            inputTokens: response.body.usage.prompt_tokens,
            outputTokens: response.body.usage.completion_tokens,
          }
        : undefined,
    };
  }

  isConfigured(): boolean {
    return true;
  }
}
