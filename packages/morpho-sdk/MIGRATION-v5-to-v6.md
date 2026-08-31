# Migrating morpho-sdk v5 to v6

## Vault V2-only Blue write reallocations

High-level `borrow`, `withdraw`, `supplyCollateralBorrow`, and `refinance` inputs now accept only
`VaultV2BlueReallocation` entries. Replace Vault V1 write inputs with reallocations returned by
`getVaultV2BlueReallocations()`.

Vault V1 data fetchers, planners, types, and explicit low-level Bundler3 composition remain
available. Use them only when constructing Bundler3 calls directly.

## Blue supply and withdraw

The established `supply` and `withdraw` methods and pure builder names stay stable, but now encode
one direct BlueBundlesV1 call.

| Flow | v5 input | v6 input |
| --- | --- | --- |
| `supply` | `amount`, `marketData`, optional additive `nativeAmount`, `slippageTolerance` | Rename `amount` to `assets`; remove `marketData` and slippage; add required `deadline` and optional referral-fee fields. Native and ERC-20 funding are exclusive. |
| `withdraw` | `assets` or `shares`, optional `receiver`, `slippageTolerance`, `reallocations` | Keep the amount modes; remove `receiver` and slippage; add required `deadline` and optional referral-fee fields. |

`blueSupply` and `blueWithdraw` keep their names, but their `args` and action metadata use the new
BlueBundlesV1 fields. Supply approvals and permits target BlueBundlesV1. Withdraw authorization
also targets BlueBundlesV1, and proceeds always return to the transaction sender.

Permit2 uses SignatureTransfer for these direct token pulls: its ERC-20 prerequisite still targets
canonical Permit2, while the signed payload names BlueBundlesV1 as spender.

### Permit2 SignatureTransfer requires an explicit nonce

SignatureTransfer consumes an owner-global unordered nonce rather than an allowance, so the SDK no
longer allocates one implicitly. For a client with `supportSignature: true`, the default supply
requirement path selects Permit2 and `supply(...).getRequirements()` now throws
`MissingPermit2TransferFromNonceError` when no nonce is supplied. Pass an unused nonce explicitly:

```ts
const requirements = await market
  .supply({ userAddress, assets, deadline })
  .getRequirements({ permit2Nonce });
```

Allocate any `uint256` whose Permit2 `nonceBitmap` bit is still unset for `userAddress` (each nonce
is single-use; a consumed one throws `Permit2TransferFromNonceAlreadyUsedError`). To skip Permit2
for ERC-2612 tokens, pass `getRequirements({ useSimplePermit: true })`, which prefers a one-signature
ERC-2612 permit and needs no nonce.

## Removed action-output field: `reallocationFee`

`BlueBorrowAction`, `BlueWithdrawAction`, `BlueSupplyCollateralBorrowAction`, and
`BlueRefinanceAction` no longer expose `reallocationFee` in `action.args`. That field only ever
carried Vault V1 native PublicAllocator fees, which high-level writes no longer emit. Read
`reallocationPenaltyAssets` for the loan-token penalty donated by Vault V2 BluePublicAllocator
reallocations.

## Removed type: `BlueReallocationPlan`

The `BlueReallocationPlan` union is removed. High-level Blue write inputs accept
`Iterable<VaultV2BlueReallocation>` directly; for explicit low-level Vault V1 composition, use
`VaultV1Reallocation[]`.
