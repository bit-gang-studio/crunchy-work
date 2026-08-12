import type { Services } from '../services/index.js'
import type { Args } from './args.js'
import { toolsByName, tools } from './tools.js'

/**
 * A hand-rolled, stateless MCP server. No SDK — the protocol surface we need is
 * four methods, and a dependency-free implementation is one less thing between
 * `npx` and a working install.
 *
 * Stateless matters: the same handler serves a stdio process and an HTTP
 * request without either holding a session.
 */

const PROTOCOL_VERSION = '2025-06-18'

export interface RpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export interface RpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

function ok(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function fail(id: string | number | null, code: number, message: string): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

/** Text result. `isError` lets a model see what went wrong and retry, rather than the call failing at the protocol level. */
function text(body: string, isError = false) {
  return { content: [{ type: 'text', text: body }], isError }
}

/**
 * Handle one message. Returns null for notifications, which take no response.
 */
export async function handleRpc(
  services: Services,
  message: RpcRequest,
): Promise<RpcResponse | null> {
  const id = message.id ?? null
  const method = message.method ?? ''

  // Notifications have no id and expect nothing back.
  if (message.id === undefined || message.id === null) {
    if (method.startsWith('notifications/')) return null
  }

  switch (method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion
      return ok(id, {
        // Echo a version the client asked for when it looks valid; clients are
        // stricter about mismatch than about being ahead of us.
        protocolVersion: typeof requested === 'string' ? requested : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'crunchy', version: '0.0.0' },
      })
    }

    case 'ping':
      return ok(id, {})

    case 'tools/list':
      return ok(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })

    case 'tools/call': {
      const name = String(message.params?.name ?? '')
      const tool = toolsByName.get(name)
      if (!tool) return ok(id, text(`No tool called "${name}".`, true))

      const args = (message.params?.arguments ?? {}) as Args
      try {
        return ok(id, text(await tool.run(services, args)))
      } catch (err) {
        // Deliberately a successful response carrying an error: the model gets
        // the message, and resolution errors already say how to retry.
        return ok(id, text((err as Error).message, true))
      }
    }

    default:
      return fail(id, -32601, `Unknown method "${method}"`)
  }
}
