import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'

/**
 * Live updates, proven the hard way.
 *
 * The easy version of this test writes through the same server the browser is
 * talking to, which an in-process event bus would satisfy. That is not the case
 * the product depends on: the agent that makes a board interesting is usually
 * talking to `crunchy mcp`, a **separate process** writing straight to the same
 * SQLite file. So this spec spawns exactly that, drives it over real JSON-RPC on
 * stdio, and asserts the card turns up on an already-open board with no reload.
 *
 * If this passes, the demo the whole product is built around actually works.
 */

/** Drive a one-shot stdio MCP session and resolve when it exits. */
function callMcpTool(name: string, args: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/crunchy.js', 'mcp'], {
      env: { ...process.env, CRUNCHY_DATA: '.crunchy-e2e' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (c: Buffer) => (out += c.toString()))
    child.on('error', reject)
    child.on('close', () => {
      const failed = out.includes('"isError":true')
      failed ? reject(new Error(`Tool reported an error: ${out}`)) : resolve()
    })

    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) +
        '\n' +
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name, arguments: args },
        }) +
        '\n',
    )
    child.stdin.end()
  })
}

test('a card written by a separate MCP process appears on an open board', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
  await page.getByLabel('Project name').fill('Live board')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByTestId('project-tile').filter({ hasText: 'Live board' }).click()

  await expect(page.locator('[data-testid="column"]').first()).toBeVisible()
  await expect(page.getByTestId('card')).toHaveCount(0)

  // Nothing touches the browser from here — a different process writes the card.
  await callMcpTool('add_card', {
    project: 'Live board',
    column: 'To Do',
    title: 'Written by the agent',
  })

  // No reload, no click: it simply arrives.
  await expect(page.getByTestId('card').filter({ hasText: 'Written by the agent' })).toBeVisible({
    timeout: 10_000,
  })

  // And a second write lands too, so this is a live stream and not a one-off.
  await callMcpTool('add_card', {
    project: 'Live board',
    column: 'In Progress',
    title: 'And another',
  })
  await expect(page.getByTestId('card').filter({ hasText: 'And another' })).toBeVisible({
    timeout: 10_000,
  })
})

test('the projects list picks up a project created elsewhere', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('project-tile').filter({ hasText: 'Appeared' })).toHaveCount(0)

  await callMcpTool('create_project', { name: 'Appeared', cards: ['From nowhere'] })

  await expect(page.getByTestId('project-tile').filter({ hasText: 'Appeared' })).toBeVisible({
    timeout: 10_000,
  })
})
