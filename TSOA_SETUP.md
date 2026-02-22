# TSOA Setup Documentation

## Overview

This document describes the TSOA (TypeScript OpenAPI Annotations) setup for the SC Market backend. TSOA enables automatic generation of OpenAPI specifications and Express routes from TypeScript decorators.

## Installation

TSOA and its dependencies have been installed:

```bash
npm install --save tsoa @types/express
```

## Configuration

### tsoa.json

The TSOA configuration file (`tsoa.json`) specifies:

- **Entry File**: `src/server.ts` - The main application entry point
- **Controller Path**: `src/api/controllers/**/*.controller.ts` - Where TSOA looks for controllers
- **Output Directory**: `src/api/generated` - Where generated files are placed
- **OpenAPI Version**: 3.1.0
- **ESM Support**: Enabled for ES module compatibility
- **Authentication Module**: `src/api/middleware/tsoa-auth.ts`
- **IoC Container**: `src/api/ioc.ts`

### TypeScript Configuration

The `tsconfig.json` has been updated to support TSOA:

- **experimentalDecorators**: Enabled for decorator support
- **emitDecoratorMetadata**: Enabled for metadata reflection
- **include**: Includes `src/**/*` to compile generated files
- **exclude**: Excludes `node_modules` and `dist`

### Build Scripts

The following npm scripts have been added to `package.json`:

- `tsoa:spec-and-routes`: Generates both OpenAPI spec and routes
- `tsoa:spec`: Generates only the OpenAPI specification
- `tsoa:routes`: Generates only the Express routes
- `build`: Updated to run TSOA generation before TypeScript compilation

## Generated Files

TSOA generates the following files in `src/api/generated/`:

- **swagger.json**: OpenAPI 3.1 specification
- **routes.ts**: Express route registration code

These files are:
- Automatically generated during build
- Excluded from git (via `.gitignore`)
- Compiled to `dist/api/generated/` during build

## Directory Structure

```
sc-market-backend/
├── src/
│   └── api/
│       ├── controllers/          # TSOA controllers (to be added during migration)
│       │   ├── .gitkeep
│       │   └── health.controller.ts  # Placeholder health check
│       ├── generated/            # TSOA generated files (git-ignored)
│       │   ├── .gitignore
│       │   ├── routes.ts         # Generated Express routes
│       │   └── swagger.json      # Generated OpenAPI spec
│       ├── middleware/
│       │   └── tsoa-auth.ts      # TSOA authentication handler (placeholder)
│       └── ioc.ts                # IoC container for dependency injection
├── tsoa.json                     # TSOA configuration
└── tsconfig.json                 # TypeScript configuration (updated)
```

## Usage

### Building the Project

```bash
npm run build
```

This will:
1. Generate OpenAPI spec and routes via TSOA
2. Compile TypeScript to JavaScript
3. Copy email templates to dist

### Development

During development, you can regenerate TSOA files separately:

```bash
# Generate both spec and routes
npm run tsoa:spec-and-routes

# Generate only spec
npm run tsoa:spec

# Generate only routes
npm run tsoa:routes
```

### Creating Controllers

Controllers should be placed in `src/api/controllers/` and follow this pattern:

```typescript
import { Controller, Get, Route, Tags } from "tsoa";

@Route("api/v1/resource")
@Tags("Resource")
export class ResourceController extends Controller {
  @Get()
  public async getResource(): Promise<ResourceResponse> {
    // Implementation
  }
}
```

## Next Steps

The following tasks are planned for the TSOA migration:

1. **Task 2**: Create base infrastructure (BaseController, auth handler, middleware adapters)
2. **Task 3**: Create type definitions for request/response models
3. **Task 5+**: Incrementally migrate existing routes to TSOA controllers

## Requirements Validated

This setup validates the following requirements from the TSOA migration spec:

- **Requirement 1.1**: TSOA installed and compatible with Express
- **Requirement 1.2**: OpenAPI 3.1 specification configured
- **Requirement 1.3**: TSOA integrated with TypeScript compilation
- **Requirement 1.4**: Routes can be registered with Express app (via generated routes.ts)
- **Requirement 1.5**: OpenAPI spec accessible for @scalar/express-api-reference

## Notes

- The health check controller is a placeholder to enable TSOA generation
- The authentication handler is a placeholder that will be implemented in Task 2.2
- The IoC container is minimal and will be enhanced as needed during migration
- All generated files are excluded from version control
