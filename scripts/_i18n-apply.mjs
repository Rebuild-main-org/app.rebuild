// Temporary helper: apply exact French→English string replacements to a file.
//   node scripts/_i18n-apply.mjs <targetFile> <mapJson>
// mapJson = JSON array of [from, to] pairs, applied IN ORDER (list multi-word
// strings before the bare words they contain). Reports any unmatched `from`.
import { readFileSync, writeFileSync } from "node:fs"

const [, , target, mapPath] = process.argv
const pairs = JSON.parse(readFileSync(mapPath, "utf8"))
let src = readFileSync(target, "utf8")
const miss = []
for (const [from, to] of pairs) {
  if (src.includes(from)) src = src.split(from).join(to)
  else miss.push(from)
}
writeFileSync(target, src)
console.log(`applied ${pairs.length - miss.length}/${pairs.length} → ${target}`)
if (miss.length) {
  console.log("UNMATCHED (" + miss.length + "):")
  for (const m of miss) console.log("  · " + JSON.stringify(m))
}
