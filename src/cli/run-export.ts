import { resolve } from 'node:path'
import { openStore, resolveDataDir } from '../db/index.js'
import { createServices } from '../services/index.js'
import { parseArgs } from './args.js'
import { exportAll } from './export.js'

const options = parseArgs(process.argv.slice(2))
const store = openStore(resolveDataDir(options.data))

try {
  const target = resolve(options.target ?? 'crunchy-export')
  const result = await exportAll(createServices(store), target)
  process.stdout.write(
    `\n  Exported ${result.projects} project${result.projects === 1 ? '' : 's'}` +
      ` — ${result.cards} cards, ${result.docs} docs\n` +
      `  ${result.directory}\n\n`,
  )
} finally {
  store.close()
}
