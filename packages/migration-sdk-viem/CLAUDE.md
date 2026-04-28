# migration-sdk-viem Conventions

- Keep per-protocol fetchers under `src/fetchers/<protocol>/<protocol>.fetchers.ts`.
- Fetchers return `MigratablePosition[]` and return `[]` when a protocol is unsupported on the chain.
- Read chain IDs from viem clients when absent: `parameters.chainId ??= await getChainId(client)`.
- Migration address config is additive and frozen with `deepFreeze`.
- Position classes expose validated `getMigrationTx(...)` and keep protocol-specific encoding in subclasses.
- Use protocol enums in public types, e.g. `MigratableProtocol.aaveV3`.
