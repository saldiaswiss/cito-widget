//copies the two plain-js files that are shipped unbundled (no Vite step, see AGENTS.md:
//assistant.js stays ES5, func.js is frozen) into dist/, next to the built widget.js,
//so the platform clients vendor everything from one directory. Runs as `postbuild`.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = ['assistant/assistant.js', 'dropdown/func.js']

mkdirSync(join(root, 'dist'), { recursive: true })
for (const rel of files) {
  const target = join(root, 'dist', rel.split('/').pop())
  copyFileSync(join(root, rel), target)
  console.log(`copied ${rel} -> dist/${rel.split('/').pop()}`)
}
