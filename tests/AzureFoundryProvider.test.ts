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

  it('should complete a request', async () => {
    const result = await provider.complete({
      messages: [{ role: 'user', content: 'Who is Adam?' }],
    });
    expect(result.content).toBe('Test Azure response.');
    expect(result.usage?.inputTokens).toBe(40);
    expect(result.usage?.outputTokens).toBe(8);
  });

  it('should pass maxTokens from request when provided', async () => {
    await provider.complete({
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 512,
    });
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

    await expect(
      provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow('Azure AI Foundry request failed: 400');
  });

  it('should handle empty choices', async () => {
    mockPost.mockResolvedValueOnce({
      status: '200',
      body: {
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      },
    });

    const result = await provider.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.content).toBe('');
  });

  it('should return undefined usage when response has no usage', async () => {
    mockPost.mockResolvedValueOnce({
      status: '200',
      body: {
        choices: [{ message: { content: 'hi' } }],
      },
    });

    const result = await provider.complete({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.content).toBe('hi');
    expect(result.usage).toBeUndefined();
  });

  it('should include model in body when deploymentName is set', async () => {
    const custom = new AzureFoundryProvider({
      endpoint: 'https://test.inference.ai.azure.com',
      apiKey: 'test-key',
      deploymentName: 'my-model',
    });

    await custom.complete({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ model: 'my-model' }),
      }),
    );
  });

  describe('stream', () => {
    it('should yield text chunks and done for async iterable response', async () => {
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
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', content: 'Hello' },
        { type: 'text', content: ' world' },
        { type: 'done', content: '' },
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
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', content: 'data' },
        { type: 'done', content: '' },
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
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', content: 'non-stream response' },
        { type: 'done', content: '' },
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
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'done', content: '' },
      ]);
    });

    it('should handle non-streaming body with empty choices', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: {
          choices: [],
        },
      });

      const chunks = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'done', content: '' },
      ]);
    });

    it('should yield error chunk on unexpected response in stream', async () => {
      mockIsUnexpected.mockReturnValueOnce(true);
      mockPost.mockResolvedValueOnce({ status: '500', body: {} });

      const chunks = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'error', content: 'Azure AI Foundry request failed: 500' },
      ]);
    });

    it('should yield error chunk on network failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      const chunks = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'error', content: 'Network error' },
      ]);
    });

    it('should yield error chunk with stringified non-Error', async () => {
      mockPost.mockRejectedValueOnce('something went wrong');

      const chunks = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'error', content: 'something went wrong' },
      ]);
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

      for await (const _chunk of custom.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ model: 'my-model', stream: true }),
        }),
      );
    });

    it('should use request maxTokens over default in stream', async () => {
      mockPost.mockResolvedValueOnce({
        status: '200',
        body: { choices: [] },
      });

      for await (const _chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 256,
      })) {
        // consume
      }

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ max_tokens: 256 }),
        }),
      );
    });
  });
});
