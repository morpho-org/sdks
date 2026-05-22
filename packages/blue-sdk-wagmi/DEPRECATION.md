# Deprecation and Migration

`@morpho-org/blue-sdk-wagmi` is deprecated with no replacement package.

Npm deprecation message:

```text
Deprecated: no replacement package. First-party Wagmi hooks are no longer a supported public SDK surface.
```

## Migration Path

There is no first-party React or Wagmi replacement in this consolidation.

Consumers are now responsible for managing Wagmi, TanStack Query, or other application state directly. Keeping that state ownership in the application avoids package-specific query semantics and gives integrations more versatile cache, invalidation, and rendering strategies.

For non-React application code, use `@morpho-org/morpho-sdk`:

- Import entity fetchers from `@morpho-org/morpho-sdk/fetch`.
- Import entity classes from `@morpho-org/morpho-sdk/entities`.
- Import optional side-effecting augmentation from `@morpho-org/morpho-sdk/augment`.

## Not Retained

React hooks, Wagmi query option helpers, query key helpers, query invalidation helpers, and React Query structural-sharing utilities are not replaced.
