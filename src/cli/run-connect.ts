import { connect, renderConnect, resolveLaunch } from './connect.js'

const dryRun = process.argv.includes('--dry-run')
const launch = resolveLaunch()
const serverName = 'crunchy'

const results = connect({ dryRun, launch, serverName })

process.stdout.write(
  `\n  Crunchy — connecting your agent clients${dryRun ? ' (dry run)' : ''}\n\n` +
    renderConnect(results, launch, serverName) +
    '\n\n  Restart any client you just connected.\n\n',
)

// A failure to write someone's config should be visible to a script, not just a human.
process.exit(results.some((r) => r.status === 'failed') ? 1 : 0)
