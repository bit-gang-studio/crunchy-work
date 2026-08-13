import { connect, renderConnect, resolveLaunch } from './connect.js'
import { parseArgs } from './args.js'

const options = parseArgs(process.argv.slice(2))
const dryRun = options.dryRun
// Carry the data directory through, so a client is wired to the board you are
// actually looking at rather than the default one.
const launch = resolveLaunch(options.data)
const serverName = 'crunchy'

const results = connect({ dryRun, launch, serverName })

process.stdout.write(
  `\n  Crunchy — connecting your agent clients${dryRun ? ' (dry run)' : ''}\n\n` +
    renderConnect(results, launch, serverName) +
    '\n\n  Restart any client you just connected.\n\n',
)

// A failure to write someone's config should be visible to a script, not just a human.
process.exit(results.some((r) => r.status === 'failed') ? 1 : 0)
