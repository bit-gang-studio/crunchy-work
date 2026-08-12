import { join } from 'node:path'

/**
 * Where each agent client keeps its MCP configuration.
 *
 * This is the whole reason `crunchy connect` exists. Every client stores this
 * in a different file, in a different place, under a different key — and the
 * normal experience is "here is a JSON blob, go find your settings file". That
 * is the single biggest step where people give up, so we do it for them.
 *
 * Kept as data rather than code so a client's path can be corrected without
 * touching the logic, and so tests can drive every platform from one machine.
 */

export type Platform = 'win32' | 'darwin' | 'linux'

export interface ClientDef {
  id: string
  label: string
  /** Most clients use `mcpServers`; VS Code uses `servers`. */
  key: 'mcpServers' | 'servers'
  /** Absolute config path, or null when this client isn't available on the platform. */
  path(home: string, platform: Platform, env: NodeJS.ProcessEnv): string | null
}

export const CLIENTS: ClientDef[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    key: 'mcpServers',
    path: (home) => join(home, '.claude.json'),
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    key: 'mcpServers',
    path: (home, platform, env) => {
      if (platform === 'win32') {
        const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
        return join(appData, 'Claude', 'claude_desktop_config.json')
      }
      if (platform === 'darwin') {
        return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      }
      return join(home, '.config', 'Claude', 'claude_desktop_config.json')
    },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    key: 'mcpServers',
    path: (home) => join(home, '.cursor', 'mcp.json'),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    key: 'mcpServers',
    path: (home) => join(home, '.codeium', 'windsurf', 'mcp_config.json'),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    // VS Code is the odd one out: `servers`, not `mcpServers`.
    key: 'servers',
    path: (home, platform, env) => {
      if (platform === 'win32') {
        const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
        return join(appData, 'Code', 'User', 'mcp.json')
      }
      if (platform === 'darwin') {
        return join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
      }
      return join(home, '.config', 'Code', 'User', 'mcp.json')
    },
  },
]
