import type { TokenCredential } from '@azure/core-auth';

export interface AzureFoundryProviderConfig {
  endpoint: string;
  apiKey?: string;
  credential?: TokenCredential;
  deploymentName?: string;
  maxTokens?: number;
}
