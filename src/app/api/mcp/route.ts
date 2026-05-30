/**
 * MCP HTTP Endpoint
 *
 * Handles MCP protocol requests via Streamable HTTP transport.
 * Auth: Bearer API key → userId scoping.
 * Stateless mode — each request creates a fresh transport.
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMCPServer } from '@/lib/mcp/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { mcpRateLimiter } from '@/lib/mcp/rate-limit';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'mcp-route' });

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate
  const auth = await authenticateMcpRequest(request);
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Rate limit
  const limit = mcpRateLimiter.check(auth.userId);
  if (!limit.success) {
    return new Response(JSON.stringify({ error: 'Rate limited' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil(limit.resetMs / 1000).toString(),
      },
    });
  }

  // 3. Create MCP server with userId context
  const server = createMCPServer(auth.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return response;
  } catch (err) {
    log.error({ err, userId: auth.userId }, 'MCP request failed');
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  // Auth required for session cleanup too
  const auth = await authenticateMcpRequest(request);
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stateless mode — no sessions to clean up
  return new Response(null, { status: 204 });
}
