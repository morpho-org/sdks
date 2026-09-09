# Generating API documentation

API Extractor and API Documenter generate the committed
[Markdown API reference](./api-markdown/README.md) from TypeScript declarations
and source JSDoc. Edit comments using the [JSDoc style guide](./jsdoc-style.md),
then regenerate the reference. Do not edit generated pages.

## Build locally

Use the repository's Node and pnpm versions, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm docs:build:markdown
```

`pnpm docs:build` is an alias for the same Markdown build. Both commands write
`docs/api-markdown/`; they no longer generate an HTML website. The generated
`README.md` and `index.md` provide the same package index. Old TypeDoc page paths
are replaced by API Documenter's filenames.

When changing public APIs or their JSDoc comments, regenerate the Markdown and
commit the resulting changes in the same PR.

## Pipeline and TypeScript compatibility

The [build script](../scripts/docs/build.mjs) runs these steps:

1. Read the seven package entry points from [tsconfig.docs.json](../tsconfig.docs.json).
2. Run the workspace's TypeScript 7 compiler separately for each package using
   its ESM build configuration and the docs compiler options. Emit declarations
   with comments into a temporary directory under `.api-docs/`. Each package's
   complete source build supplies the declaration subpaths imported by other
   packages, while keeping optional augmentations in separate compiler projects.
3. Adapt JSDoc comments in those temporary declarations to TSDoc conventions.
4. Run API Extractor with the shared [api-extractor.json](../api-extractor.json)
   configuration. Resolve workspace imports to the emitted declarations and
   external dependencies from their owning packages. Produce one `.api.json`
   model per documented package.
5. Run API Documenter over all seven models to generate linked Markdown, normalize
   line endings to LF, and replace `docs/api-markdown/` after successful generation.

API Extractor **bundles its own TypeScript 5.9.3 analysis compiler**. The workspace
continues to use TypeScript 7.0.2 for compilation and declaration emission. The
two tools communicate through `.d.ts` files; API Extractor does not load the
workspace's TypeScript compiler API. Future declaration syntax changes still
require checking compatibility with API Extractor's parser.

API Extractor 7.59.0 and API Documenter 7.30.13 are pinned root development
dependencies. `@babel/parser` is also a development dependency: it locates actual
documentation comments in declarations so the compatibility step cannot rewrite
comment-like text inside string literal types. These dependencies do not enter
published SDK packages.

The reference covers the root entry points of `morpho-sdk`, `midnight-sdk`,
`evm-simulation`, `blue-sdk`, `blue-sdk-viem`, `liquidity-sdk-viem`, and `morpho-ts`.
It does not independently document every package subpath or the JavaScript WDK
adapter. Symbols tagged `@internal` and members defined in internal directories,
test files, or generated GraphQL `api/sdk.ts` and `api/types.ts` are excluded.

## JSDoc compatibility

Source comments continue to follow the existing JSDoc guide. The
[compatibility step](../scripts/docs/comments.mjs) changes temporary declarations:

- Nested `@param params.field` descriptions become a **Parameter details** list
  in remarks. Simple parameters remain in parameter tables.
- `{ErrorClass}` in `@throws` becomes an inline code span. Error names and
  descriptions are retained.
- Legacy inline parameter/return types are removed in favor of declaration
  types. Optional/default parameter descriptions and repeated return descriptions
  are retained.
- `@default` becomes `@defaultValue`; warnings and overload descriptions become
  remarks. Local prose following legacy `@inheritdoc` is retained, but the bare
  tag does not copy documentation from a base member. Explicit TSDoc
  `{@inheritDoc ...}` references are passed through.
- Destructured parameters receive the documented input names in the declaration
  copy, preventing duplicate or untyped parameter rows. Parameter types, string
  literals, and fenced examples are preserved.

API Documenter's output uses HTML tables inside `.md` files. This is its standard
Markdown format; consumers must support embedded HTML to render those tables.

Missing release tags are allowed because this repository uses exports to define
the public API. Other extraction warnings, including unresolved documentation
links and references to unexported types, are recorded in `.api-docs/warnings.log`;
the build reports their count. API Documenter also reports unresolved links.
Fix comment issues in source. Compiler, declaration-parser, extraction, or renderer
errors fail the build and leave the previous reference intact. Failed-build
intermediates are retained under `.api-docs/` for diagnosis.

See the upstream guides for [API Extractor's compiler architecture](https://api-extractor.com/pages/setup/invoking/)
and [Markdown generation](https://api-extractor.com/pages/setup/generating_docs/).

## Make the reference available to Context7

The Markdown reference is committed so Context7 can read it from the repository.
Local generation does not update Context7 until the changes reach its indexed
branch.

1. Run `pnpm docs:build:markdown` and commit `docs/api-markdown/` with the API or
   comment changes.
2. Merge the PR into the branch Context7 indexes.
3. If a `context7.json` file limits included folders, include the generated
   reference directory alongside the consumer guides.
4. Refresh the library in Context7 and query a specific exported function or
   error class to verify retrieval from the generated reference.

Context7's repository crawler reads documentation formats such as Markdown.
Adding TypeScript source folders does not itself enable JSDoc extraction when
written documentation is present. See [Context7 indexing rules](https://context7.com/docs/adding-libraries)
and [library configuration](https://context7.com/docs/library-owners).
