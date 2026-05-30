/**
 * MCP Authentication
 *
 * Extracts API key from Authorization header and validates it.
 * Returns the userId associated with the key, or null if invalid.
 */

import { validateApiKey } from '@/lib/services/api-keys';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'mcp-auth' });

export interface McpAuthResult {
  userId: string;
}

/**
 * Authenticate an MCP request by extracting and validating the API key.
 * Expects `Authorization: Bearer ajt_...` header.
 */
export async function authenticateMcpRequest(
  request: Request,
): Promise<McpAuthResult | null> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    log.debug('MCP request missing Authorization header');
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    log.debug('MCP request has non-Bearer Authorization header');
    return null;
  }

  const key = authHeader.slice(7);
  if (!key) {
    log.debug('MCP request has empty Bearer token');
    return null;
  }

  const result = await validateApiKey(key);
  if (!result) {
    log.warn('MCP request with invalid API key');
    return null;
  }

  return { userId: result.userId };
}
