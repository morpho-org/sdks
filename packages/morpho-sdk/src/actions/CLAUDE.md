# Actions Layer

> Full context: [CLAUDE.md](../../CLAUDE.md)

Pure functions that build deep-frozen `Transaction<TAction>` objects. Four sub-layers:

## `vaultV1/` — VaultV1 (MetaMorpho) Operations

| Function           | Route                     | Why                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------ |
| `vaultV1Deposit`   | Bundler (general adapter) | Enforces `maxSharePrice` — inflation attack prevention. Supports native ETH wrapping via `nativeAmount`. |
| `vaultV1Withdraw`  | Direct vault call         | No attack surface, simpler UX                          |
| `vaultV1Redeem`    | Direct vault call         | No attack surface, simpler UX                          |

## `vaultV2/` — VaultV2 Operations

| Function                  | Route                     | Why                                                    |
| ------------------------- | ------------------------- | ------------------------------------------------------ |
| `vaultV2Deposit`          | Bundler (general adapter) | Enforces `maxSharePrice` — inflation attack prevention. Supports native ETH wrapping via `nativeAmount`. |
| `vaultV2Withdraw`         | Direct vault call         | No attack surface, simpler UX                          |
| `vaultV2Redeem`           | Direct vault call         | No attack surface, simpler UX                          |
| `vaultV2ForceWithdraw`    | VaultV2 multicall         | Bundles N forceDeallocate + 1 withdraw to exit illiquid positions |
| `vaultV2ForceRedeem`      | VaultV2 multicall         | Bundles N forceDeallocate + 1 redeem for maximum withdrawal scenarios |

## `marketV1/` — MarketV1 (Morpho Blue) Operations

| Function                         | Route                            | Why                                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `marketV1SupplyCollateral`       | Bundler (general adapter)        | Always bundled via GeneralAdapter1. Approval on GA1, not Morpho.              |
| `marketV1Borrow`                 | Bundler (general adapter)        | Requires GA1 authorization on Morpho. Uses `minSharePrice` for slippage. Supports `reallocations`. |
| `marketV1SupplyCollateralBorrow` | Bundler (general adapter)        | Atomic supply + borrow. Requires Morpho authorization for GeneralAdapter1. Supports `reallocations`. |
| `marketV1Repay`                  | Bundler (general adapter)        | Two modes: by assets (partial) or by shares (full repay). Uses `maxSharePrice` for slippage. No Morpho auth needed. |
| `marketV1WithdrawCollateral`     | Direct Morpho call               | No bundler, no GA1 authorization. Caller must be `onBehalf`. Validates position health post-withdraw. |
| `marketV1RepayWithdrawCollateral`| Bundler (general adapter)        | Atomic repay + withdraw. Order: repay FIRST. Requires both loan token approval and Morpho auth. |

## `requirements/` — Approval Resolution

Resolves token approval needs before a deposit or supply collateral:

1. `supportSignature: false` → classic `approve()` tx (`getRequirementsApproval`).
2. `supportSignature: true` + EIP-2612 → permit signature (`getRequirementsPermit`).
3. `supportSignature: true` + no EIP-2612 → permit2 fallback (`getRequirementsPermit2`).

`encode/` sub-folder: low-level calldata encoders for each approval type.

## Shared Liquidity (Reallocations)

`marketV1Borrow` and `marketV1SupplyCollateralBorrow` accept optional `reallocations: VaultReallocation[]`. When present:

1. `validateReallocations(reallocations)` is called (fee >= 0, non-empty withdrawals, positive amounts).
2. Each `VaultReallocation` is encoded as a `reallocateTo` bundler action (calls `PublicAllocator.reallocateTo()`).
3. `reallocateTo` actions are placed **before** `morphoBorrow` in the bundle.
4. Total reallocation fees (sum of `r.fee`) are added to `tx.value`.
5. `reallocationFee` is tracked in the returned `action.args`.

## Key Constraints

- Every returned object must be `deepFreeze`-d.
- Validate inputs (`assets > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`) and throw dedicated errors.
- For deposits with `nativeAmount`: validate vault asset is `wNative`, prepend `nativeTransfer` + `wrapNative` bundler actions, set `tx.value`.
- Append metadata via `addTransactionMetadata` only when provided.
