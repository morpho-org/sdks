# `actions/`

Pure synchronous transaction builders. Each action returns a deep-frozen `Transaction<TAction>` and follows the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Sub-layers

- `vaultV1/` — VaultV1 (MetaMorpho) `deposit` / `withdraw` / `redeem` / `migrateToV2` encode one
  direct VaultBundlesV1 call; `inKindRedeem` encodes the standalone VaultExitBundlesV1 periphery.
- `vaultV2/` — VaultV2 `deposit` / `withdraw` / `redeem` encode one direct VaultBundlesV1 call;
  `inKindRedeem` and `forceWithdraw` target VaultExitBundlesV1; `forceRedeem` remains a vault multicall.
- `blue/` — direct BlueBundlesV1 write encoders backing the established `supply`, `withdraw`,
  `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `withdrawCollateral`,
  `repayWithdrawCollateral`, and `refinance` methods on `client.morpho.blue(...)`.
- `bundles/` — shared funding and permit resolution helpers used by the vault and Blue builders:
  `resolveBundlesFunding`, `getBundlesTokenPermit`, `getBundlesSharesPermit`, and the
  `BundlesPermitKind` discriminator; plus `resolveBundlesTokenRequirements`, consumed by the
  entity-layer resolver `entities/requirements/getBundlesTokenRequirements.ts`.
- `midnight/` — Midnight fixed-rate direct and bundled transaction encoders plus take normalization for fixed-rate API quote outputs.
- `requirements/` — async resolvers that read on-chain state and return what the user must do/sign before an action: token approvals, permit/permit2 signature requests, Morpho authorization, Midnight authorization, and SetterRatifier root ratification.

## Common builder pattern

1. Validate inputs with dedicated errors from `src/types/error.ts` (`assets > 0`, `shares > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`).
2. Encode calldata. **Vault V1 and Vault V2 write paths** encode one registered
   `VaultBundlesV1` entrypoint directly. **Blue write paths**
   encode one registered `BlueBundlesV1` entrypoint directly. **Midnight bundle paths** encode one
   `MidnightBundles` (V1) or `MidnightBundlesV2` entrypoint call directly (see
   [MidnightBundlesV2](#midnightbundlesv2-canonical-statement)). Other **direct calls** (Midnight
   collateral supply / redeem / single-group `cancelOffer`) encode their target contract call directly. Vault `inKindRedeem` and
   `vaultV2/forceWithdraw` actions encode VaultExitBundlesV1 directly;
   `vaultV2/forceRedeem` stays on `VaultV2.multicall`.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native funding (canonical statement)

Native funding is valid only for assets/collateral configured as wNative; reject it on any other
asset with the dedicated error. On direct **VaultBundlesV1 vault deposits**, encode the gross native amount as
the deposit assets and send that same amount as `tx.value` to `vaultBundlesV1Deposit`; the
standalone contract wraps the value internally, so these paths do not add a token permit.
Direct BlueBundlesV1 funding sends the native amount as `tx.value`; it is exclusive with an ERC-20
token permit and must equal the funded entrypoint amount. `refinance` moves an existing on-chain
position and takes no native funding.

## MidnightBundlesV2 (canonical statement)

- **One action per intent, not per entrypoint.** V2 has one maker entrypoint
  (`midnightBundlesV2CancelAndMake`) and four taker entrypoints; the arguments select the intent
  (empty lists, zero `newRoot`, `assetsToPark`, `reduceOnly`, `repayEnabled`, empty `offerFills`).
  Each builder fixes its intent-selecting arguments and exposes only the inputs that vary within
  that intent; never expose them as free inputs. Reject inputs that would make one intent encode
  another intent's call (for example an empty collateral list on a collateral flow) with a typed error.
- **Every entrypoint acts for `msg.sender`.** Inputs name that account `accountAddress`; there is no
  `taker`, `onBehalf` or `maker` distinct from it, and maker offers must have
  `maker === accountAddress`.
- **Requirements.** Token requirements are plain ERC-20 approvals from `accountAddress` to
  `midnightBundlesV2` for exactly the pulled assets; V2 takes no inline permit, so never produce
  ERC-2612 or Permit2 requirements. Every V2 action requires Midnight authorization of
  `midnightBundlesV2`, resolved lazily at the entity layer.
- **Encoding.** Target `getChainAddress(chainId, "midnightBundlesV2")`. Pass every positional
  argument, labelling each with its contract parameter name in a trailing comment. Arguments of a
  skipped step get zero values (all-zero `blueMarket` / `market` structs, `zeroHash`, `[]`, `"0x"`);
  the contract does not read them.
- **Group cancellations** are `{ group, maxConsumed }` lists: reject negative or above-`uint128`
  ceilings and duplicate groups. Replacement offers must use groups not in the cancellation list.
- **Root activation** targets `PriceRatifierV1` or `RateRatifierV1` only. An EOA maker's
  `v, r, s`, `signatureHeight`, `signatureNonce` and `signatureDeadline` reach `buildTx` only
  through the signature's `args`; a contract-wallet maker encodes `v = r = s = 0`.
- **Native funding** is out of scope: encode `value = 0` and `wrappedNative = zeroAddress`.

## Shared liquidity / reallocations (canonical statement)

High-level Blue write reallocations are V2-only. `borrow`, `supplyCollateralBorrow`, `withdraw`,
and `refinance` accept `VaultV2BlueReallocation` entries, which map to BlueBundlesV1
`PublicAllocations` and then to `reallocate(...)` for a market source or `allocateFromIdle(...)` for
idle liquidity. The enclosing action supplies the target market, the input supplies adapters, the
chain registry supplies the allocator, and each call passes the vault's configured WAD-scaled
`penalty` — the allocator donates `ceil(assets × penalty / WAD)` of the target loan token per call.
BluePublicAllocator sources are not sorted and idle uses no synthetic zero-address
market. BlueBundlesV1 executes every allocation unconditionally; aggregate penalties reduce borrow
or withdrawal proceeds, and those builders reject an aggregate penalty above `borrowAssets` (or, in
withdraw assets mode, the withdrawn amount). Migration instead adds penalties to destination debt,
which the entity health check and encoded `maxLtv` bound. Penalties do not add native value or a
separate funding requirement.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/AGENTS.md`](../types/AGENTS.md#adding-a-new-operation).
