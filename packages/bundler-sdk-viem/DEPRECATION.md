# Deprecation and Migration

`@morpho-org/bundler-sdk-viem` is deprecated for application consumers.

Npm deprecation message:

```text
Deprecated: use @morpho-org/morpho-sdk. Bundler action helpers are consolidated under @morpho-org/morpho-sdk and ABIs are under @morpho-org/morpho-sdk/abis.
```

## Migration Path

Use `@morpho-org/morpho-sdk` for the Bundler3 surface kept by the consolidated SDK:

- Import `BundlerAction` and `BundlerCall` from `@morpho-org/morpho-sdk/bundler`.
- Import supported action types from `@morpho-org/morpho-sdk/bundler`, including `Action`, `ActionArgs`, `ActionType`, `Actions`, `Authorization`, `InputReallocation`, `Permit2PermitSingle`, and `Permit2PermitSingleDetails`.
- Import Bundler3 and adapter ABI literals from `@morpho-org/morpho-sdk/abis`, including `bundler3Abi`, `coreAdapterAbi`, `generalAdapter1Abi`, `ethereumGeneralAdapter1Abi`, `paraswapAdapterAbi`, wrapper adapter ABIs, and migration adapter ABIs.

## Not Retained

`morpho-sdk` keeps only the Bundler3 action encoding subset needed by its transaction builders. It does not retain `ActionBundle`, operation population or simulation helpers, Paraswap operation helpers, reward-claim helpers, migration operation helpers, or broad transaction requirement flows from `bundler-sdk-viem`.
