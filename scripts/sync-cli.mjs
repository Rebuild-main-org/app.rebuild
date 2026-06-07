// Copies the CLI sources into public/cli so they can be downloaded from the
// deployed site (the code isn't on GitHub). Runs as `prebuild`.
import { mkdirSync, copyFileSync, existsSync } from "node:fs"

const files = ["rebuild216.mjs", "mcp-rebuild.mjs", "package.json", "README.md"]
mkdirSync("public/cli", { recursive: true })
for (const f of files) {
  if (existsSync(`cli/${f}`)) copyFileSync(`cli/${f}`, `public/cli/${f}`)
}
console.log("synced cli/ → public/cli/")
