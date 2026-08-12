import { spawn } from 'node:child_process'

/**
 * Open a URL in the default browser.
 *
 * Hand-rolled rather than a dependency: it is one `spawn` per platform, and the
 * point of this product is that `npx crunchy-work` pulls down as little as
 * possible.
 *
 * Failure is silent by design. The URL is printed either way, so a machine with
 * no browser (a container, SSH, WSL without a bridge) gets a working install and
 * a link rather than a crash on the very first thing it does.
 */
export function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? // `start` is a cmd builtin, not an executable. The empty string is the
        // window title, which cmd otherwise steals the URL for.
        ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Ignored — see above.
  }
}
