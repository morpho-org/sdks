# Deprecation and Migration

`@morpho-org/test-wagmi` is deprecated with no replacement package.

Npm deprecation message:

```text
Deprecated: no replacement package. This public Wagmi test helper package is no longer supported.
```

## Migration Path

Use `@morpho-org/test` for the maintained viem, mock transport, Anvil, and Vitest test base.

Consumers are now responsible for managing Wagmi, TanStack Query, or React test state directly. Keeping those wrappers in the consuming test suite avoids package-specific state assumptions and gives applications more versatile test setup control.

## Not Retained

Wagmi config fixtures, React wrapper helpers, hook rendering helpers, and Wagmi-specific Testing Library wrappers are not replaced. Consumers that still need Wagmi or React test wrappers should keep those helpers local to their own test suites.
