// JSDoc enforcement only. Style/formatting/linting stays with Biome.
// Scope tightened to exactly the symbols Phase 1 of TIB-2026-05-04 backfilled
// (morpho-sdk action builders + client + types/error.ts; evm-simulation
// simulate / screenAddresses / errors). Future phases widen the globs below.
// TypeDoc strict gate deferred — see Addenda in the TIB for the @param-syntax conflict.
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

// Scope: exactly what Phase 1 of TIB-2026-05-04 backfilled. Each future phase widens this list.
const TIER_1_GLOBS = [
  "packages/morpho-sdk/src/actions/**/*.ts",
  "packages/morpho-sdk/src/client/**/*.ts",
  "packages/morpho-sdk/src/types/error.ts",
  "packages/evm-simulation/src/simulate/simulate.ts",
  "packages/evm-simulation/src/screen-addresses/screen-addresses.ts",
  "packages/evm-simulation/src/errors.ts",
];

const TIER_1_IGNORES = [
  "**/*.test.ts",
  "**/*.spec.ts",
  "**/internal/**",
  "**/test-helpers/**",
];

export default tseslint.config(
  {
    ignores: [
      "**/lib/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/cache/**",
      "**/artifacts/**",
    ],
  },
  {
    files: TIER_1_GLOBS,
    ignores: TIER_1_IGNORES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
            "VariableDeclaration",
          ],
          checkConstructors: false,
          enableFixer: false,
        },
      ],
      "jsdoc/require-param": [
        "error",
        {
          contexts: ["any"],
          // Style guide (docs/jsdoc-style.md) requires leaf-field documentation
          // (`@param params.foo.bar`) and does NOT require the bare `@param params` root,
          // so we disable destructure-root enforcement.
          checkDestructured: false,
          checkDestructuredRoots: false,
          exemptedBy: ["internal"],
        },
      ],
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns": [
        "error",
        {
          checkGetters: false,
          forceRequireReturn: false,
          exemptedBy: ["internal"],
        },
      ],
      "jsdoc/require-returns-description": "error",
      "jsdoc/require-example": ["error", { exemptedBy: ["internal"] }],
      "jsdoc/check-tag-names": [
        "error",
        // `throws` is part of the §6 tag set; jsdoc plugin classifies it under @throws
        // which is recognized by default.
        { definedTags: ["internal"] },
      ],
      "jsdoc/no-undefined-types": "off", // TypeScript owns type checking.
      "jsdoc/require-param-type": "off", // No inline types per docs/jsdoc-style.md.
      "jsdoc/require-returns-type": "off",
    },
  },
);
