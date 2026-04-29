# VaultV1 (MetaMorpho) Entity

> Parent: [`src/entities/CLAUDE.md`](../CLAUDE.md)

`MorphoVaultV1` implements `VaultV1Actions`. Client → Actions for MetaMorpho vaults.

## Intent

- Fetches on-chain vault data (`fetchVault`, `fetchAccrualVault`).
- Computes `maxSharePrice` with slippage tolerance for deposits, using `totalAssets = amount + nativeAmount`.
- Validates `nativeAmount` constraints: vault asset must be `wNative`, chain must have `wNative` configured, amount must be non-negative.
- Delegates transaction building to pure action functions in `src/actions/vaultV1/`.
- Returns `{ buildTx, getRequirements }` — lazy evaluation, no side effects at construction.

## Key Constraints

- Validate `chainId` match before any on-chain call.
- Never encode calldata here — that belongs in Actions.
- Deposit goes through the bundler (via `vaultV1Deposit`). Withdraw/redeem are direct vault calls.
