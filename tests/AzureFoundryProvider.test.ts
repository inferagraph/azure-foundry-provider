import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureFoundryProvider } from '../src/AzureFoundryProvider.js';

vi.mock('@azure-rest/ai-inference', () => {
  const mockPost = vi.fn().mockResolvedValue({
    status: '200',
    body: {
      choices: [{ message: { content: 'Test Azure response.' } }],
      usage: { prompt_tokens: 40, completion_tokens: 8 },
    },
  });

  const mockClient = vi.fn().mockReturnValue({
    path: vi.fn().mockReturnValue({ post: mockPost }),
  });

  return {
    default: mockClient,
    isUnexpected: vi.fn().mockReturnValue(false),
  };
});

vi.mock('@azure/core-auth', () => ({
  AzureKeyCredential: vi.fn(),
}));

describe('AzureFoundryProvider', () => {
  let provider: AzureFoundryProvider;

  beforeEach(() => {
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
  });

  it('should throw without apiKey or credential', () => {
    expect(() =>
      new AzureFoundryProvider({
        endpoint: 'https://test.inference.ai.azure.com',
      }),
    ).toThrow('Either apiKey or credential must be provided');
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
});
