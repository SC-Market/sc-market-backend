/**
 * Build gate for the public API spec (run by `npm run build`, after
 * `npm run tsoa:public`). Fails the build when the generated
 * /api/public/v1 spec has an operation without `apiToken` security, with
 * scopes other than the catalog's, or that isn't a catalogued public
 * operation (an internal path leaking in). See
 * src/api/routes/public/v1/scope-catalog.ts.
 */
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { publicSpecProblems } from "../src/api/routes/public/v1/scope-catalog.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const specPath = join(root, "src/api/routes/public/v1/generated/swagger.json")
const spec = JSON.parse(readFileSync(specPath, "utf-8"))
const problems = publicSpecProblems(spec)

if (problems.length) {
  console.error("Public API spec check failed:")
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(
  `Public API spec OK: ${Object.keys(spec.paths ?? {}).length} paths, all token-scoped.`,
)
