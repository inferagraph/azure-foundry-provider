import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureFoundryProvider } from '../src/AzureFoundryProvider.js';

const mockPost = vi.fn();
const mockIsUnexpected = vi.fn();

vi.mock('@azure-rest/ai-inference', () => {
  const mockClient = vi.fn().mockReturnValue({
    path: vi.fn().mockReturnValue({ post: (...args: unknown[]) => mockPost(...args) }),
  });

  return {
    default: mockClient,
    isUnexpected: (...args: unknown[]) => mockIsUnexpected(...args),
  };
});

vi.mock('@azure/core-auth', () => ({
  AzureKeyCredential: vi.fn(),
}));

describe('AzureFoundryProvider', () => {
  let provider: AzureFoundryProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUnexpected.mockReturnValue(false);
    mockPost.mockResolvedValue({
      status: '200',
      body: {
        choices: [{ message: { content: 'Test Azure response.' } }],
        usage: { prompt_tokens: 40, completion_tokens: 8 },
      },
    });
    provider = new AzureFoundryProvider({
      endpoint: 'https://test.inference.ai.azure.com',
      apiKey: 'test-key',
    });
  });

  it('should have name azure-foundry', () => {
    expect(provider.name).toBe('azure-foundry');
  });

  it('should be configured', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should complete a prompt', async () => {
    const result = await provider.complete('Who is Adam?');
    expect(result).toBe('Test Azure response.');
  });

  it('should pass maxTokens from options when provided', async () => {
    await provider.complete('test', { maxTokens: 512 });
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ max_tokens: 512 }),
      }),
    );
  });

  it('should throw without apiKey or credential', () => {
    expect(() =>
      new AzureFoundryProvider({
        endpoint: 'https://test.inference.ai.azure.com',
      }),
    ).toThrow('Either apiKey or credential must be provided');
  });

  it('should accept credential instead of apiKey', () => {
    const custom = new AzureFoundryProvider({
      endpoint: 'https://test.inference.ai.azure.com',
      credential: { getToken: vi.fn() } as any,
    });
    expect(custom.name).toBe('azure-foundry');
  });

  it('should accept deployment name', () => {
    const custom = new AzureFoundryProvider({
      endpoint: 'https://test.inference.ai.azure.com',
      apiKey: 'test-key',
      deploymentName: 'my-deployment',
      maxTokens: 2048,
    });
    expect(custom.name).toBe('azure-foundry');
  });

  it('should throw on unexpected response', async () => {
    mockIsUnexpected.mockReturnValueOnce(true);
    mockPost.mockResolvedValueOnce({ status: '400', body: {} });

    await expect(provider.complete('test')).rejects.toThrow(
      'Azure AI Foundry request failed: 400',
    );
  });

  it('should handle empty choices', async () => {
    mockPost.mockResolvedValueOnce({
      status: '200',
      body: {
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      },
    });

    const result = await provider.complete('test');
    expect(result).toBe('');
  });

  it('should return empty string when message has no content', async () => {
    mockPost.mockResolvedValueOnce({
      status: '200',
      body: {
        choices: [{ message: {} }],
      },
    });

    const result = await provider.complete('test');
    expect(result).toBe('');
  });

  it('should include model in body when deploymentName is set', async () => {
    const custom = new AzureFoundryProvider({
      endpoint: 'https://test.inference.ai.azure.com',
      apiKey: 'test-key',
      deploymentName: 'my-model',
    });

    await custom.complete('test');

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ model: 'my-model' }),
      }),
    );
  });

  it('should pass temperature when provided', async () => {
    await provider.complete('test', { temperature: 0.3 });
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ temperature: 0.3 }),
      }),
    );
  });

  describe('stream', () => {
    it('should yield text deltas and done for async iterable response', async () => {
      const asyncBody = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Hello' } }] };
          yield { choices: [{ delta: { content: ' world' } }] };
        },
      };

      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncBody,
      });

      const chunks = [];
      for await (const chunk of provider.stream('Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', delta: 'Hello' },
        { type: 'text', delta: ' world' },
        { type: 'done', reason: 'stop' },
      ]);
    });

    it('should skip chunks with no content in async iterable', async () => {
      const asyncBody = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: {} }] };
          yield { choices: [{ delta: { content: 'data' } }] };
          yield { choices: [] };
        },
      };

      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncBody,
      });

      const chunks = [];
      for await (const chunk of provider.stream('Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', delta: 'data' },
        { type: 'done', reason: 'stop' },
      ]);
    });

    it('should fall back to non-streaming body when not async iterable', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: {
          choices: [{ message: { content: 'non-stream response' } }],
        },
      });

      const chunks = [];
      for await (const chunk of provider.stream('Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', delta: 'non-stream response' },
        { type: 'done', reason: 'stop' },
      ]);
    });

    it('should handle non-streaming body with no content', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: {
          choices: [{ message: {} }],
        },
      });

      const chunks = [];
      for await (const chunk of provider.stream('Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ type: 'done', reason: 'stop' }]);
    });

    it('should handle non-streaming body with empty choices', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: {
          choices: [],
        },
      });

      const chunks = [];
      for await (const chunk of provider.stream('Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ type: 'done', reason: 'stop' }]);
    });

    it('should throw on unexpected response in stream', async () => {
      mockIsUnexpected.mockReturnValueOnce(true);
      mockPost.mockResolvedValueOnce({ status: '500', body: {} });

      await expect(async () => {
        for await (const _chunk of provider.stream('Hi')) {
          // consume
        }
      }).rejects.toThrow('Azure AI Foundry request failed: 500');
    });

    it('should propagate network errors via throw', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      await expect(async () => {
        for await (const _chunk of provider.stream('Hi')) {
          // consume
        }
      }).rejects.toThrow('Network error');
    });

    it('should propagate non-Error rejections via throw', async () => {
      mockPost.mockRejectedValueOnce('something went wrong');

      await expect(async () => {
        for await (const _chunk of provider.stream('Hi')) {
          // consume
        }
      }).rejects.toBe('something went wrong');
    });

    it('should include model in stream body when deploymentName is set', async () => {
      const custom = new AzureFoundryProvider({
        endpoint: 'https://test.inference.ai.azure.com',
        apiKey: 'test-key',
        deploymentName: 'my-model',
      });

      mockPost.mockResolvedValueOnce({
        status: '200',
        body: { choices: [] },
      });

      for await (const _chunk of custom.stream('Hi')) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ model: 'my-model', stream: true }),
        }),
      );
    });

    it('should use options maxTokens over default in stream', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: { choices: [] },
      });

      for await (const _chunk of provider.stream('Hi', { maxTokens: 256 })) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ max_tokens: 256 }),
        }),
      );
    });

    it('should mark done with aborted reason when signal fires mid-stream', async () => {
      const controller = new AbortController();
      const asyncBody = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'first' } }] };
          controller.abort();
          yield { choices: [{ delta: { content: 'second' } }] };
        },
      };

      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncBody,
      });

      const chunks = [];
      for await (const chunk of provider.stream('Hi', { signal: controller.signal })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', delta: 'first' },
        { type: 'done', reason: 'aborted' },
      ]);
    });
  });

  // The Azure AI Foundry chat-completions endpoint is OpenAI-compatible:
  // request body has a top-level `messages: [{role, content}]` array where
  // `role` is one of 'system' | 'user' | 'assistant'. LLMRole maps 1:1 to
  // the SDK role names — no translation needed. Each LLMMessage becomes
  // one entry in the `messages` array, in the supplied order.
  describe('streamMessages', () => {
    function asyncIterableBody(deltas: string[]) {
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const delta of deltas) {
            yield { choices: [{ delta: { content: delta } }] };
          }
        },
      };
    }

    it('forwards every message verbatim', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['ok']),
      });

      for await (const _chunk of provider.streamMessages([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ])) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            messages: [
              { role: 'system', content: 'sys' },
              { role: 'user', content: 'usr' },
            ],
          }),
        }),
      );
    });

    it('preserves the system role separately from user content', async () => {
      // Foundry chat-completions is OpenAI-style: system instructions live
      // in their own message entry with role:'system', NOT glued onto the
      // user message. This asserts that contract.
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['ok']),
      });

      for await (const _chunk of provider.streamMessages([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hi.' },
      ])) {
        // consume
      }

      const call = mockPost.mock.calls[0]?.[0] as { body: { messages: unknown[] } };
      expect(call.body.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hi.' },
      ]);
      // Explicitly: the user-role entry must NOT contain the system text.
      const userEntry = (call.body.messages as Array<{ role: string; content: string }>)[1];
      expect(userEntry.content).toBe('Hi.');
      expect(userEntry.content).not.toContain('helpful assistant');
    });

    it('preserves multiple turns (user/assistant interleaved)', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['ok']),
      });

      const turns = [
        { role: 'system' as const, content: 'sys' },
        { role: 'user' as const, content: 'q1' },
        { role: 'assistant' as const, content: 'a1' },
        { role: 'user' as const, content: 'q2' },
      ];

      for await (const _chunk of provider.streamMessages(turns)) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ messages: turns }),
        }),
      );
    });

    it('forwards the tools option', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['ok']),
      });

      const tools = [
        {
          name: 'search_nodes',
          description: 'Search the graph',
          parameters: { type: 'object', properties: {} },
        },
      ];

      for await (const _chunk of provider.streamMessages(
        [{ role: 'user', content: 'find adam' }],
        { tools },
      )) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ tools }),
        }),
      );
    });

    it('honors AbortSignal', async () => {
      const controller = new AbortController();
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: {
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: 'first' } }] };
            controller.abort();
            yield { choices: [{ delta: { content: 'second' } }] };
          },
        },
      });

      const chunks = [];
      for await (const chunk of provider.streamMessages(
        [{ role: 'user', content: 'go' }],
        { signal: controller.signal },
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', delta: 'first' },
        { type: 'done', reason: 'aborted' },
      ]);
    });

    it('yields the same chunk shape as stream()', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['Hello', ' world']),
      });
      const streamChunks = [];
      for await (const chunk of provider.stream('Hi')) {
        streamChunks.push(chunk);
      }

      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['Hello', ' world']),
      });
      const messagesChunks = [];
      for await (const chunk of provider.streamMessages([
        { role: 'user', content: 'Hi' },
      ])) {
        messagesChunks.push(chunk);
      }

      expect(messagesChunks).toEqual(streamChunks);
    });

    it('stream() still works (back-compat)', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: asyncIterableBody(['back', '-compat']),
      });

      const chunks = [];
      for await (const chunk of provider.stream('legacy')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', delta: 'back' },
        { type: 'text', delta: '-compat' },
        { type: 'done', reason: 'stop' },
      ]);
      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            messages: [{ role: 'user', content: 'legacy' }],
            stream: true,
          }),
        }),
      );
    });
  });
});
