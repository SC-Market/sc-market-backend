#!/bin/bash

# Generate V2 API Client
# This script generates the OpenAPI spec from TSOA controllers and then
# generates the TypeScript client for the frontend.

set -e

echo "========================================="
echo "Market V2 API Client Generation"
echo "========================================="
echo ""

# Step 1: Generate OpenAPI spec from TSOA controllers
echo "Step 1: Generating OpenAPI spec from TSOA controllers..."
cd "$(dirname "$0")/.."
npm run tsoa:generate

if [ ! -f "src/api/routes/v2/generated/swagger.json" ]; then
  echo "❌ Error: OpenAPI spec not generated at src/api/routes/v2/generated/swagger.json"
  exit 1
fi

echo "✅ OpenAPI spec generated successfully"
echo ""

# Step 1.5: Copy to frontend first, THEN fix paths on the copy only
echo "Step 2: Copying OpenAPI spec to frontend..."
FRONTEND_DIR="../sc-market-frontend"

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "❌ Error: Frontend directory not found at $FRONTEND_DIR"
  exit 1
fi

mkdir -p "$FRONTEND_DIR/spec"
cp src/api/routes/v2/generated/swagger.json "$FRONTEND_DIR/spec/sc-market-v2.openapi.json"

echo "✅ OpenAPI spec copied to frontend"
echo ""

# Step 2.5: Add /api/v2 prefix to paths on the FRONTEND copy only.
# The frontend's generatedApiV2 uses fetchBaseQuery with baseUrl containing /api/v2,
# but RTK Query treats absolute paths (starting with /) as origin-relative,
# bypassing baseUrl. So generated URLs must include the /api/v2 prefix.
# The backend's swagger.json stays clean (no prefix) — TSOA regenerates it each build.
echo "Step 2.5: Fixing OpenAPI paths on frontend copy..."
node -e "
const fs = require('fs');
const spec = JSON.parse(fs.readFileSync('$FRONTEND_DIR/spec/sc-market-v2.openapi.json', 'utf-8'));
const basePath = '/api/v2';
const newPaths = {};
let alreadyPrefixed = false;
for (const [path, methods] of Object.entries(spec.paths)) {
  if (path.startsWith(basePath)) { alreadyPrefixed = true; break; }
  newPaths[basePath + path] = methods;
}
if (alreadyPrefixed) {
  console.log('Paths already prefixed — skipping');
} else {
  spec.paths = newPaths;
  delete spec.servers;
  fs.writeFileSync('$FRONTEND_DIR/spec/sc-market-v2.openapi.json', JSON.stringify(spec, null, '\t'));
  console.log('Updated ' + Object.keys(newPaths).length + ' paths');
}
"

echo "✅ Frontend paths fixed"
echo ""

# Step 3: Generate TypeScript client in frontend
echo "Step 3: Generating TypeScript client in frontend..."
cd "$FRONTEND_DIR"

# Check if the v2 spec should be merged with v1 or kept separate
# For now, we'll keep it separate to maintain parallel architecture
npm run codegen:api

echo "✅ TypeScript client generated successfully"
echo ""

echo "========================================="
echo "✅ Client generation complete!"
echo "========================================="
echo ""
echo "Generated files:"
echo "  - Backend: src/api/routes/v2/generated/swagger.json"
echo "  - Backend: src/api/routes/v2/generated/routes.ts"
echo "  - Frontend: spec/sc-market-v2.openapi.json"
echo "  - Frontend: src/store/api/market-v2.ts"
echo ""
echo "Next steps:"
echo "  1. Review the generated OpenAPI spec"
echo "  2. Test the generated client in frontend components"
echo "  3. Commit the generated files"
