import { createInterface } from 'node:readline'
import { openStore, resolveDataDir } from '../db/index.js'
import { createServices } from '../services/index.js'
import { handleRpc, type RpcRequest } from './jsonrpc.js'

/**
 * The stdio transport — `crunchy mcp`.
 *
 * This is the lowest-friction install we can offer: the agent talks straight to
 * the database file, so there is no server to start, no port, and no browser.
 * It only works because storage is SQLite (in WAL mode, so the web process and
 * this one can hold the file at once) — a client/server database could not do
 * this.
 *
 * Nothing but JSON-RPC may ever be written to stdout; diagnostics go to stderr
 * or they corrupt the stream.
 */
export async function startStdio(): Promise<void> {
  const store = openStore(resolveDataDir())
  const services = createServices(store)

  const rl = createInterface({ input: process.stdin })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let message: RpcRequest
    try {
      message = JSON.parse(trimmed)
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }) + '\n',
      )
      continue
    }

    try {
      const response = await handleRpc(services, message)
      if (response) process.stdout.write(JSON.stringify(response) + '\n')
    } catch (err) {
      process.stderr.write(`crunchy mcp: ${(err as Error).message}\n`)
      if (message.id !== undefined && message.id !== null) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: 'Internal error' },
          }) + '\n',
        )
      }
    }
  }

  store.close()
}

await startStdio()
