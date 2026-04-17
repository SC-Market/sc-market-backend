/**
 * Fix OpenAPI spec paths to include /api/v2 prefix
 * This ensures RTK Query codegen can properly filter V2 endpoints
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const specPath = join(process.cwd(), 'src/api/routes/v2/generated/swagger.json');
const spec = JSON.parse(readFileSync(specPath, 'utf-8'));

// Get the base path from servers
const basePath = spec.servers?.[0]?.url || '/api/v2';

// Create new paths object with prefixed paths
const newPaths: Record<string, any> = {};
for (const [path, methods] of Object.entries(spec.paths)) {
  const fullPath = `${basePath}${path}`;
  newPaths[fullPath] = methods;
}

// Update the spec
spec.paths = newPaths;

// Remove servers since paths now include full URLs
delete spec.servers;

// Write back
writeFileSync(specPath, JSON.stringify(spec, null, '\t'));

console.log('✅ Fixed OpenAPI spec paths to include /api/v2 prefix');
console.log(`   Updated ${Object.keys(newPaths).length} paths`);
