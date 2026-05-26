# Deprecation and Migration

`@morpho-org/simulation-sdk-wagmi` is deprecated with no replacement package.

Npm deprecation message:

```text
Deprecated: no replacement package. First-party Wagmi hooks are no longer a supported public SDK surface.
```

## Migration Path

There is no first-party React or Wagmi replacement for `useSimulationState`.

Consumers are now responsible for managing Wagmi, TanStack Query, or other application state directly. Keeping that state ownership in the application avoids package-specific query semantics and gives integrations more versatile cache, invalidation, and rendering strategies.

Only shared-liquidity reallocation state has a consolidated SDK path: use `ReallocationData` and `InputReallocationData` from `@morpho-org/morpho-sdk/entities`, with reallocation option and result types from `@morpho-org/morpho-sdk` or `@morpho-org/morpho-sdk/types`.

## Not Retained

`useSimulationState`, Wagmi-driven simulation-state fetching, block-aware entity query composition, and React Query integration are not replaced.
