import type { MarketDataProvider } from './types';

interface RetryConfig {
  retries: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  retries: 2,
  baseDelayMs: 250,
};

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= finalConfig.retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === finalConfig.retries) break;
      const jitterMs = Math.floor(Math.random() * 100);
      const delayMs = finalConfig.baseDelayMs * (attempt + 1) + jitterMs;
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Operation failed after retries');
}

let defaultProvider: MarketDataProvider | null = null;

export function setDefaultMarketDataProvider(provider: MarketDataProvider): void {
  defaultProvider = provider;
}

export function getDefaultMarketDataProvider(): MarketDataProvider {
  if (!defaultProvider) {
    throw new Error('No default market data provider configured');
  }
  return defaultProvider;
}

