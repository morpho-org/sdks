# Generating API documentation

API references are generated from the TypeScript declarations and JSDoc comments
reachable from the package entry points in [`typedoc.json`](../typedoc.json).
Edit the source comments using the [JSDoc style guide](./jsdoc-style.md), then
regenerate the reference. Do not edit generated pages.

## Current compatibility

The repository uses TypeScript 7.0.2 for all tooling. TypeDoc 0.28.20 currently
does not support its compiler API, so both documentation generation commands
fail at startup. Support is tracked in
[TypeDoc #3098](https://github.com/TypeStrong/typedoc/issues/3098).

The committed Markdown is a snapshot previously generated with TypeDoc 0.28.20
and TypeScript 6.0.3. It is committed for Context7, but regeneration requires
a TypeDoc release compatible with TypeScript 7.

## Build locally

Once a compatible TypeDoc release is installed, use the repository's Node and
pnpm versions and run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm docs:build
pnpm docs:build:markdown
```

- `pnpm docs:build` writes a browsable HTML reference to `docs/api/index.html`.
- `pnpm docs:build:markdown` writes the committed [Markdown API reference](./api-markdown/README.md)
  to `docs/api-markdown/`.

When changing public APIs or their JSDoc comments, regenerate the Markdown and
commit the resulting `docs/api-markdown/` changes in the same PR.

Both commands use the same entry points and JSDoc. TypeDoc includes signatures,
parameter and return descriptions, examples, and documented errors. Symbols
marked `@internal` are excluded. The entry-point list currently covers seven
TypeScript SDK packages; it does not document every separate package subpath or
the JavaScript WDK adapter.

Generation type-checks the documented entry points and their imports. The docs
TypeScript project avoids loading unrelated tests and optional augmentations
together. Existing TypeDoc warnings about missing comments or unresolved links
are reported without failing the build; fix them in the source comments.

## Toolchain

TypeDoc and `typedoc-plugin-markdown` are development dependencies in the root
[`package.json`](../package.json). The root scripts invoke `typedoc` directly
using the workspace's TypeScript catalog. The
[`tsconfig.docs.json`](../tsconfig.docs.json) configuration selects the documented
entry points and inherits the repository's compiler settings.

## Make the reference available to Context7

The Markdown reference under `docs/api-markdown/` is committed so Context7 can
read it from the repository. The HTML output under `docs/api/` stays gitignored.
Generating files locally does not update Context7 until the changes reach the
branch it indexes.

For the existing Git repository index:

1. Run `pnpm docs:build:markdown` and commit the generated Markdown with the
   implementation or comment changes.
2. Merge the PR into the branch Context7 indexes.
3. If a `context7.json` file limits included folders, include the generated
   reference directory alongside the consumer guides.
4. Refresh the library in Context7 and query a specific exported function or
   error class to verify retrieval from the generated reference.

Alternatively, publish the HTML reference as a documentation website and add
that website as a Context7 source.

Context7's repository crawler reads documentation formats such as Markdown. Its
configuration controls which folders it scans, but adding TypeScript source
folders does not enable JSDoc extraction when written documentation is present.
See [Context7 indexing rules](https://context7.com/docs/adding-libraries) and
[library configuration](https://context7.com/docs/library-owners).

The Markdown renderer's setup is documented in the
[TypeDoc Markdown quick start](https://typedoc-plugin-markdown.org/docs/quick-start).
