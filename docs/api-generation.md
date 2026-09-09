# Generating API documentation

API references are generated from the TypeScript declarations and JSDoc comments
reachable from the package entry points in [`typedoc.json`](../typedoc.json).
Edit the source comments using the [JSDoc style guide](./jsdoc-style.md), then
regenerate the reference. Do not edit generated pages.

## Build locally

Use the repository's Node and pnpm versions, then run from the repository root:

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

[`scripts/docs/package.json`](../scripts/docs/package.json) is a private workspace
containing TypeDoc, `typedoc-plugin-markdown`, and TypeScript 6. TypeDoc 0.28.20
requires the TypeScript compiler API supplied by TypeScript 6; the SDK workspace
uses TypeScript 7, whose root module no longer exposes that API. Keeping the docs
tools together gives TypeDoc a compatible compiler without changing SDK builds.
TypeScript 7 support is tracked in
[TypeDoc #3098](https://github.com/TypeStrong/typedoc/issues/3098). Once a compatible
release is available, upgrade TypeDoc and move the docs tools back to the root
workspace using the TypeScript catalog.
The `generate:*` script names keep documentation generation out of recursive
package builds.

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
