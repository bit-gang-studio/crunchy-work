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

/**
 * The message a model actually gets when a tool throws.
 *
 * Drizzle wraps a driver error so `.message` is the whole failed SQL statement
 * with its parameters, and the fact that actually matters — "database is
 * locked" — survives only on `.cause`. Reporting `.message` alone gave the
 * model a wall of SQL and no idea the call was **retryable**, which is the
 * single most useful thing to know about a lock.
 */
/**
 * Arguments a tool does not have, which used to be dropped in silence.
 *
 * `update_card({ column: 'Done' })` is the mistake this exists for: the tool
 * says "Change a card", moving a card is a change, so a model tries it. The
 * call returned `Updated "…"`, the card did not move, and the agent then told
 * its user the card was done. A wrong answer delivered confidently is worse
 * than an error, and every schema already declares `additionalProperties:
 * false` — most clients just never enforce it on the way out.
 *
 * The reply names the arguments that *do* exist, so the retry is one turn.
 */
function unknownArgs(inputSchema: Record<string, unknown>, args: Args): string | null {
  const properties = (inputSchema.properties ?? {}) as Record<string, unknown>
  const allowed = Object.keys(properties)
  const extra = Object.keys(args).filter((key) => !allowed.includes(key))
  if (!extra.length) return null

  const plural = extra.length === 1 ? 'argument' : 'arguments'
  return (
    `Unknown ${plural}: ${extra.map((e) => `"${e}"`).join(', ')}. ` +
    `This tool takes: ${allowed.join(', ')}. ` +
    `Nothing was changed. To move a card between columns or reorder it, use move_card.`
  )
}

function describe(err: unknown): string {
  const error = err as { message?: string; cause?: unknown }
  const cause = error?.cause as { message?: string; code?: string } | undefined
  const causeText = cause?.message ?? ''

  if (/database is locked|SQLITE_BUSY/i.test(causeText)) {
    return 'The database was busy — another process is writing. Try the same call again.'
  }

  const message = error?.message ?? String(err)
  // A Drizzle failure leads with "Failed query:" and then dumps the statement.
  if (causeText && message.startsWith('Failed query')) return causeText
  return message
}

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
      const unknown = unknownArgs(tool.inputSchema, args)
      if (unknown) return ok(id, text(unknown, true))

      try {
        return ok(id, text(await tool.run(services, args)))
      } catch (err) {
        // Deliberately a successful response carrying an error: the model gets
        // the message, and resolution errors already say how to retry.
        return ok(id, text(describe(err), true))
      }
    }

    default:
      return fail(id, -32601, `Unknown method "${method}"`)
  }
}
