/**
 * AI Provider Factory — Provider-Agnostic Model Selection
 *
 * Configure via environment variables:
 *   AI_PROVIDER=anthropic|openai  (default: anthropic)
 *   AI_API_KEY=<provider-api-key> (required)
 *   AI_MODEL=...                  (optional override)
 *
 * Switching providers requires only env var changes — no code changes.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

const PROVIDER = process.env.AI_PROVIDER || 'anthropic';
const API_KEY = process.env.AI_API_KEY || '';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o',
};

/** Models users can choose from in the chat UI */
export const CHAT_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fast & efficient' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Most capable' },
] as const;

/**
 * Get a language model instance for the configured provider.
 * Optionally override the model ID.
 */
export function getModel(modelId?: string): LanguageModel {
  const id = modelId || process.env.AI_MODEL || DEFAULT_MODELS[PROVIDER] || 'claude-haiku-4-5-20251001';

  if (PROVIDER === 'openai') {
    const openai = createOpenAI({ apiKey: API_KEY });
    return openai(id);
  }

  // Default to Anthropic
  const anthropic = createAnthropic({ apiKey: API_KEY });
  return anthropic(id);
}

/** Check whether AI chat is configured (API key is set) */
export function isAIConfigured(): boolean {
  return API_KEY.length > 0;
}

/** Get the current provider name for display */
export function getProviderName(): string {
  return PROVIDER;
}
