import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import type { AzureKeyCredential } from '@azure/core-auth';
import type {
  CompleteOptions,
  LLMProvider,
  LLMStreamEvent,
  StreamOptions,
} from '@inferagraph/core';
import type { AzureFoundryProviderConfig } from './types.js';

const DEFAULT_MAX_TOKENS = 1024;

interface AzureChatMessage {
  role: 'user';
  content: string;
}

interface StreamingChoiceDelta {
  delta?: { content?: string };
}

interface NonStreamingChoice {
  message?: { content?: string };
}

export class AzureFoundryProvider implements LLMProvider {
  readonly name = 'azure-foundry';
  private readonly client: ReturnType<typeof ModelClient>;
  private readonly deploymentName: string | undefined;
  private readonly maxTokens: number;

  constructor(config: AzureFoundryProviderConfig) {
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

  async complete(prompt: string, opts?: CompleteOptions): Promise<string> {
    const messages: AzureChatMessage[] = [{ role: 'user', content: prompt }];

    const response = await this.client.path('/chat/completions').post({
      body: {
        messages,
        max_tokens: opts?.maxTokens ?? this.maxTokens,
        ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(this.deploymentName ? { model: this.deploymentName } : {}),
      },
    });

    if (isUnexpected(response)) {
      throw new Error(`Azure AI Foundry request failed: ${response.status}`);
    }

    const choice = (response.body.choices as NonStreamingChoice[] | undefined)?.[0];
    return choice?.message?.content ?? '';
  }

  stream(prompt: string, opts?: StreamOptions): AsyncIterable<LLMStreamEvent> {
    return azureFoundryStream(
      this.client,
      this.deploymentName,
      this.maxTokens,
      prompt,
      opts,
    );
  }

  isConfigured(): boolean {
    return true;
  }
}

async function* azureFoundryStream(
  client: ReturnType<typeof ModelClient>,
  deploymentName: string | undefined,
  defaultMaxTokens: number,
  prompt: string,
  opts: StreamOptions = {},
): AsyncIterable<LLMStreamEvent> {
  const messages: AzureChatMessage[] = [{ role: 'user', content: prompt }];

  const body: Record<string, unknown> = {
    messages,
    max_tokens: opts.maxTokens ?? defaultMaxTokens,
    stream: true,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(deploymentName ? { model: deploymentName } : {}),
  };

  // Note: errors are propagated by throwing rather than yielding a synthetic
  // `error` event — `LLMStreamEvent` has no `error` variant in the new core
  // contract. AIEngine.chat catches throws and surfaces them as host-visible
  // chat errors. A final `{type: 'done'}` is still emitted on the success
  // path so consumers can release resources deterministically.
  // The Azure REST SDK overloads `path()` per-route; passing a `stream: true`
  // body forces a runtime cast since the route's typed body doesn't expose
  // `stream`. The SDK accepts the field at the wire level.
  const response = await client.path('/chat/completions').post({ body } as never);

  if (isUnexpected(response)) {
    throw new Error(`Azure AI Foundry request failed: ${response.status}`);
  }

  const result = response.body as
    | (AsyncIterable<{ choices?: StreamingChoiceDelta[] }> & {
        choices?: NonStreamingChoice[];
      })
    | { choices?: NonStreamingChoice[] };

  let finishReason: 'stop' | 'length' | 'aborted' = 'stop';

  if (Symbol.asyncIterator in result) {
    const iterable = result as AsyncIterable<{ choices?: StreamingChoiceDelta[] }>;
    for await (const chunk of iterable) {
      if (opts.signal?.aborted) {
        finishReason = 'aborted';
        break;
      }
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield { type: 'text', delta: content };
      }
    }
  } else {
    const choice = (result as { choices?: NonStreamingChoice[] }).choices?.[0];
    if (choice?.message?.content) {
      yield { type: 'text', delta: choice.message.content };
    }
  }

  yield { type: 'done', reason: finishReason };
}
