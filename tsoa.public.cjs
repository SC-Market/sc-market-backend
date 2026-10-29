// TSOA config of the public API spec (/api/public/v1): `npm run tsoa:public`.
//
// A .cjs file, not JSON, for one reason: the public controllers reuse the
// site's v2 controllers, and TSOA picks up every @Route class in the program,
// so the v2 ones must be ignored. TSOA matches `ignore` globs against absolute
// paths without minimatch's `dot` option, so a leading-globstar pattern misses
// checkouts under a dot-directory; an absolute path built here always
// matches. scripts/check-public-spec.ts then fails the build if anything but
// the catalogued public operations ends up in the spec.
const { join } = require("node:path")

module.exports = {
  entryFile: "src/server.ts",
  noImplicitAdditionalProperties: "throw-on-extras",
  controllerPathGlobs: ["src/api/routes/public/v1/controllers/*Controller.ts"],
  ignore: ["**/node_modules/**", join(__dirname, "src/api/routes/v2/**")],
  spec: {
    outputDirectory: "src/api/routes/public/v1/generated",
    specVersion: 3,
    name: "SC Market Public API",
    description:
      "The SC Market public API for shop and order tooling. Every operation needs an API token (Authorization: Bearer scmp_…) with the scope it lists. Create tokens in your SC Market account settings under API tokens.",
    version: "1.0.0",
    basePath: "/api/public/v1",
    schemes: ["https"],
    consumes: ["application/json"],
    produces: ["application/json"],
    securityDefinitions: {
      apiToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "scmp_live_…",
        description:
          "A public API token from SC Market account settings → API tokens. Legacy scm_ tokens are refused.",
      },
    },
  },
  routes: {
    routesDir: "src/api/routes/public/v1/generated",
    middleware: "express",
    authenticationModule: "src/api/routes/public/v1/auth.ts",
    esm: true,
  },
}
