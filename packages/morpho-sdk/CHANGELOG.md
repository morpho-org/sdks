# @morpho-org/morpho-sdk

## 5.3.0

### Minor Changes

- [#815](https://github.com/morpho-org/sdks/pull/815) [`e7578c3`](https://github.com/morpho-org/sdks/commit/e7578c3c205c3559bf1b7498030d818a0cc04220) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add first-iteration Midnight action flows under `client.morpho.midnight(chainId)`, expose Midnight SDK API helpers through `morpho-sdk/midnight-api` and shared ABI/constant/error/utility entrypoints, and expose pure Midnight transaction builders for the markets-app taker, maker, redeem, repay/withdraw, and cancel flows.

  The Midnight entity returns lazy action outputs with `getRequirements()` and synchronous `buildTx(...)` methods, matching the existing `morpho-sdk` action pattern while accepting fixed-rate API quote takeable offers directly. UI labels, rate display logic, and offer-chain presentation stay on the integrator side.

  Midnight market transaction builders are synchronous and consume caller-provided `marketData` state, while `redeem` consumes a single caller-provided `positionData` snapshot that includes its hydrated market. Maker-offer action builders consume caller-provided `offersData` from `getOffersData(...)`, which creates the tree from the same entries accepted by `Tree.create(...)` and runs mempool validation. `getMarketData(...)`, `getPositionData(...)`, and `getOffersData(...)` remain async helpers so integrators can prepare state once, compose UI/validation around it, and then build transactions without hidden reads. Callers can pin several reads to one externally fetched block by forwarding its `blockNumber` through the fetch parameters.

  Midnight Bundles token pulls use approval-based execution in this first iteration: `getRequirements()` returns ERC20 approval calls, and encoded bundle calls pass `PermitKind.None`. ERC2612 token permits, Permit2 SignatureTransfer token pulls, unit-target take helpers, exposed taker `reduceOnly`, referral fee controls, max-continuous-fee controls, and generic collateral withdrawal lists are left to follow-up work.

  Allow fork tests to select Anvil's Osaka hardfork so deployed Midnight bytecode using the `CLZ` opcode can be exercised end to end.

  Borrow-side flows are explicit: `takeBorrow` and `makeBorrow` borrow without supplying collateral, while `supplyCollateralTakeBorrow` and `supplyCollateralMakeBorrow` perform collateral-supply plus borrow flows. Public maker flows are exposed through async entity methods such as `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`; they accept raw offer or group inputs, prepare and validate `offersData` internally, then return lazy requirement and transaction handles. Maker submit metadata exposes all submitted group ids, and the ratifier helpers enforce that the submitted tree uses one ratifier.

  Named take transaction builders validate that their takeable offers match the expected maker side, and named maker entity flows validate that prepared maker trees match the expected maker side. Borrow takes require a positive `maxUnits`, repayment-withdrawal flows reject unknown collateral indexes before exposing requirements, and partial group cancellation rejects amounts outside the onchain offer-cap range. `getOffersData(...)` stays side-agnostic so callers can prepare any valid tree.

  Validation runs before requirements are exposed: takeable offers must match the requested flow, redemption cannot exceed position credit, approval amounts and operators are checked before allowance short-circuits, and market inputs must belong to the selected Midnight deployment. Maker preparation also preserves caller-owned offer group arrays.

  Bind security-sensitive flow artifacts to their preparation context: Ecrecover submissions use the canonical payload retained for the signed tree instead of trusting payload bytes supplied to `buildTx`, typed-data signing rejects wallets on another chain, and redemption accepts only owner-bound position snapshots for the requested account.

- [#875](https://github.com/morpho-org/sdks/pull/875) [`e3bcaf5`](https://github.com/morpho-org/sdks/commit/e3bcaf59b7a774996f02d9ba5e97365405c692bb) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Consolidate Vault, Blue, and Midnight scalar input validation into two protocol-agnostic errors: `NegativeInputError` for inputs that must be non-negative and `NonPositiveInputError` for inputs that must be positive. Both errors expose the invalid `field` and `value` as readonly properties.

  This replaces the operation-specific scalar-bound error implementations with deprecated aliases to the two canonical classes, preserving imports and `instanceof` checks during the deprecation window:

  - `NonPositiveAssetAmountError`, `NonPositiveSharesAmountError`, `NonPositiveMaxSharePriceError`, `ZeroDepositAmountError`, `NonPositiveBorrowAmountError`, `ZeroCollateralAmountError`, `NonPositiveReallocationAmountError`, `NonPositiveRepayAmountError`, `NonPositiveRepayMaxSharePriceError`, `NonPositiveWithdrawCollateralAmountError`, `ZeroSupplyAmountError`, and `NonPositiveWithdrawAmountError` alias `NonPositiveInputError`.
  - `NegativeSlippageToleranceError`, `NegativeNativeAmountError`, `NegativeReallocationFeeError`, `NonPositiveMinBorrowSharePriceError`, `NegativeSupplyAmountError`, `NegativeSupplyMaxSharePriceError`, `NegativeWithdrawMinSharePriceError`, `NegativeMinSharePriceError`, `NegativeBorrowSharesError`, and `NegativeMaxRepaySharePriceError` alias `NegativeInputError`.

  The previously deprecated `NonPositiveTransferAmountError` and `NativeAmountExceedsTransferAmountError` exports are removed. The unreleased Midnight-specific scalar errors are superseded directly by the canonical errors.

  Compatibility warning (acknowledged): this minor release intentionally changes the constructor signatures, constructor identity, and `name` property observed through the deprecated aliases. Negative values previously matched by a legacy `NonPositive*Error` may now match `NegativeInputError` instead. It also removes the two previously deprecated exports named above. These compatibility risks are explicitly accepted for this release despite their normally breaking nature.

  Consumers should replace handlers for these classes with the shared input error matching the documented constraint of each field.

  State-independent validation is now repeated at both public boundaries: Blue entities and pure actions reject the same malformed scalar modes and reallocations, while Midnight entities and pure actions reject the same malformed amounts, market chains, collateral indexes, and empty offer submissions.

  Patch maintained direct dependents so their published releases resolve and are validated against this `@morpho-org/morpho-sdk` minor. The existing `^5.0.0` peer range in `@morpho-org/liquidity-sdk-viem` already accepts the new v5 minor and does not require widening.

  Domain-specific errors for conflicting modes, mismatched data, exceeded balances, unsupported native assets, and unsafe positions remain unchanged.

### Patch Changes

- Updated dependencies [[`e7578c3`](https://github.com/morpho-org/sdks/commit/e7578c3c205c3559bf1b7498030d818a0cc04220)]:
  - @morpho-org/midnight-sdk@1.2.0

## 5.2.0

### Minor Changes

- [#871](https://github.com/morpho-org/sdks/pull/871) [`36e9607`](https://github.com/morpho-org/sdks/commit/36e9607bfe40f442e9fce174df8bfcc6ff94f73f) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix Blue shares-mode repay so a `nativeAmount` that covers the full debt no longer emits a spurious loan-token approval requirement.

  `MorphoBlue.repay` / `repayWithdrawCollateral` derive the ERC-20 pulled in shares mode from the 2h-forward-accrued, rounded-up `toBorrowAssets(shares)`. Previously the entity threw `NativeAmountExceedsTransferAmountError` when `nativeAmount` exceeded that upper bound and always computed `erc20Amount = borrowAssets - nativeAmount`, so a repay funded entirely by native ETH left a tiny positive residual and `getRequirements()` returned a wNative approval/permit requirement that was never actually needed.

  The ERC-20 pulled is now clamped: `erc20Amount = max(0, borrowAssets - nativeAmount)`. When native covers (or exceeds) the borrow assets, nothing is pulled as ERC-20 — the bundle wraps the native and skims any residual wNative back to the receiver (the existing shares-mode skim) — so a fully-native shares repay emits no loan-token approval requirement.

  `NativeAmountExceedsTransferAmountError` is now deprecated (no longer thrown) and will be removed in the next major.

### Patch Changes

- Updated dependencies [[`552ab7b`](https://github.com/morpho-org/sdks/commit/552ab7b9d00e8bb0ec8c6718c798ccc1943d76d4), [`966bdc4`](https://github.com/morpho-org/sdks/commit/966bdc413e54f1cef65fffed7da92479f1322baf)]:
  - @morpho-org/blue-sdk-viem@5.2.0

## 5.1.2

### Patch Changes

- [#862](https://github.com/morpho-org/sdks/pull/862) [`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Fix published CJS/ESM package entrypoint metadata so legacy main/type resolution and conditional exports point at built files.

- Updated dependencies [[`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57)]:
  - @morpho-org/blue-sdk@6.3.1
  - @morpho-org/blue-sdk-viem@5.1.3

## 5.1.1

### Patch Changes

- [#849](https://github.com/morpho-org/sdks/pull/849) [`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Harden Midnight SDK API, fetch, offer, group, tree, and package-export behavior for Cantina audit findings.

- Updated dependencies [[`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43)]:
  - @morpho-org/morpho-ts@2.8.0

## 5.1.0

### Minor Changes

- [#840](https://github.com/morpho-org/sdks/pull/840) [`878a5bc`](https://github.com/morpho-org/sdks/commit/878a5bc4a442d677637497f30378f28fa32ac38c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add native (wNative) wrapping to the Blue repay flows and reshape their amount args, matching the `blueSupply` devex.

  `MorphoBlue.repay` / `repayWithdrawCollateral` (entity) now take:

  - **assets mode** — `{ amount, nativeAmount? }`. Additive like `blueSupply`: the repaid assets are `amount + nativeAmount`, the ERC-20 pulled is `amount`, and `nativeAmount` is wrapped into wNative.
  - **shares mode** — `{ shares, nativeAmount? }`. Repays exact shares; the entity derives the ERC-20 pulled as `toBorrowAssets(shares) − nativeAmount` from live market state, wraps `nativeAmount`, and skims residual loan tokens back to `receiver`.

  `blueRepay` / `blueRepayWithdrawCollateral` (action) take a **flat, pre-resolved** shape `{ amount?, shares?, nativeAmount?, transferAmount }` — the action does no amount arithmetic. Assets mode repays `transferAmount` (= `amount + nativeAmount`) and pulls `amount`; shares mode repays `shares` and pulls `transferAmount` ERC-20 (already net of native).

  `nativeAmount` requires the market's loan token to be the chain's wNative. A fully-native repay pulls no ERC-20 and emits no approval requirement.

  **Breaking changes (migration):**

  - Assets mode renames `assets` → `amount`: replace `repay({ assets })` with `repay({ amount })`.
  - The action args of `blueRepay` / `blueRepayWithdrawCollateral` are now the flat `RepayActionAmountArgs` (`{ amount?, shares?, nativeAmount?, transferAmount }`) instead of `{ assets, shares, transferAmount }`. Assets mode: pass `{ amount, transferAmount: amount + nativeAmount }`. Shares mode: pass `{ shares, transferAmount }` where `transferAmount` is the ERC-20 to pull (net of native).
  - `RepayAmountArgs` is no longer a deprecated alias of `AssetsOrSharesArgs`; it is now the native-aware repay union (entity surface, `DepositAmountArgs | { shares }`). A new `RepayActionAmountArgs` is the flat action-layer shape. `AssetsOrSharesArgs` is unchanged and still used by `withdraw`.
  - The `validateRepayParams` helper is removed; amount resolution now lives in the entity, and the action validates only its cheap invariants. Negative repay amounts are rejected consistently: a negative `amount` (assets mode) or a negative shares-mode `transferAmount` now throws `NonPositiveRepayAmountError` from both `getRequirements` and `buildTx`, instead of the entity leaking a negative approval.
  - New exported error `NativeAmountExceedsTransferAmountError`, thrown when a shares-mode `nativeAmount` exceeds the loan assets to repay. The action layer validates its pre-resolved funding: assets mode requires `transferAmount === amount + nativeAmount` (`TransferAmountNotEqualToAssetsError`), shares mode requires positive funding (`transferAmount + nativeAmount > 0n`). `NonPositiveTransferAmountError` is retained as exported API but no longer thrown (deprecated, slated for removal in a future major).

  `@morpho-org/wdk-protocol-lending-morpho-evm` is updated to the renamed `amount` field for its Morpho repay path.

  `@morpho-org/liquidity-sdk-viem` bumps its `@morpho-org/morpho-sdk` peer dependency range to `^5.0.0` to track the new major.

## 5.0.0

### Major Changes

- [#829](https://github.com/morpho-org/sdks/pull/829) [`4d85d35`](https://github.com/morpho-org/sdks/commit/4d85d3579ce03669ddd6d40b02c6490c907b9b77) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Rename Blue requirement entrypoints and isolate Blue-specific requirement modules.

  The public GeneralAdapter requirement entrypoint is now `getGeneralAdapterRequirements`, and `getMorphoAuthorizationRequirement` is now `getBlueAuthorizationRequirement`. GeneralAdapter token permit requirement entrypoints are exported as `getGeneralAdapterRequirementsPermit` and `getGeneralAdapterRequirementsPermit2`, and the Permit2 approval encoder is exported as `encodeErc20Permit2Approve`. Protocol-agnostic approval and EIP-2612 encoding utilities remain exported from the common requirements barrel.

  Token signature requirement callers now pass the supported spender explicitly to `encodeErc20Permit`, while ERC-20 permit and approval encoding reject spenders outside the supported chain registry entries for the target chain.

  Token-pull builders now preserve Permit2 transfer routing even when the existing Permit2-managed allowance is already sufficient and no fresh Permit2 signature requirement is returned.

  High-level `buildTx` flows that pull tokens now reject unsigned transfers until `getRequirements()` has resolved whether to route through ERC-20 allowance or Permit2 allowance.

  Blue authorization requirement metadata is now protocol-prefixed as `BlueAuthorizationAction` with `action.type === "blueAuthorization"`. The previous `MorphoAuthorizationAction` type, `"morphoAuthorization"` discriminator, and `isRequirementAuthorization` guard are removed in favor of `isRequirementBlueAuthorization`.

  DAI-specific permit support is removed from maintained Morpho SDK action-flow surfaces. DAI now follows the same token-pull policy as other tokens that are incompatible with the SDK's standard ERC-2612 encoder: Blue requirement flows route DAI to Permit2, or to classic approval when Permit2 is unavailable, even when `useSimplePermit` is enabled and `nonces(owner)` is readable. The `getDaiPermitTypedData` re-export is removed from `@morpho-org/morpho-sdk/utils`.

  Update the WDK Morpho lending adapter to consume the renamed Blue authorization action metadata.

  Update `@morpho-org/liquidity-sdk-viem` to accept the new `@morpho-org/morpho-sdk` peer major used for reallocation data helpers.

- [#833](https://github.com/morpho-org/sdks/pull/833) [`e99bd39`](https://github.com/morpho-org/sdks/commit/e99bd39c760ead2779bf72ffa39ef3d93ae258f4) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add offchain `setAuthorizationWithSig` support for Morpho Blue bundled paths and switch entity `buildTx` to accept an array of signatures.

  When the client opts into offchain signatures (`supportSignature: true`), `getRequirements()` on the authorization-bearing Blue paths (`borrow`, `withdraw`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `refinance`) now returns a signable `Requirement` instead of a standalone `setAuthorization` transaction. Signing it yields an `AuthorizationRequirementSignature` that `buildTx` folds into the bundle as a `setAuthorizationWithSig` call, so GeneralAdapter1 is authorized in-bundle with no separate onchain transaction.

  **Breaking:** every entity `buildTx` now accepts an array of signatures (`buildTx(signatures?: readonly RequirementSignature[])`) instead of a single optional signature. Pass `buildTx([permitSignature])` where you previously passed `buildTx(permitSignature)`; combine the permit and authorization signatures in the same array for paths that need both (e.g. `supplyCollateralBorrow`). The array is split internally via the new `selectRequirementSignatures` helper (built on the `isPermitSignature` / `isAuthorizationSignature` type guards). `RequirementSignature` is now the discriminated union `PermitRequirementSignature | AuthorizationRequirementSignature`, and `Requirement<T>` is generic over the signature it produces.

  **Hardening of the signature array:** `buildTx` now rejects a `signatures` array that carries more than one signature of the same kind, or a signature kind the path does not consume, instead of silently keeping only the first — surfaced as the new `AmbiguousRequirementSignaturesError` / `UnexpectedRequirementSignatureError`. The authorization path is also pinned to the chain's GeneralAdapter1: `getBlueAuthorizationAction(chainId, signature)` now takes the `chainId` and throws `BundlerErrors.UnexpectedSignature` unless `authorized` is exactly GeneralAdapter1, so a bundle can never grant Morpho operator rights to an unintended address.

  New public surface: `AuthorizationAction`, `AuthorizationSignatureArgs`, `AuthorizationRequirementSignature`, `PermitRequirementSignature`, `isPermitSignature`, `isAuthorizationSignature`, `selectRequirementSignatures`, `SelectedRequirementSignatures`, `encodeBlueSignatureAuthorization`, `getBlueAuthorizationAction` (now `(chainId, signature)`), the `morphoSetAuthorizationWithSig` bundler action, `BundlerErrors.UnexpectedSignature`, `AmbiguousRequirementSignaturesError`, and `UnexpectedRequirementSignatureError`. `getBlueAuthorizationRequirement` gains a `supportSignature` option.

  **Breaking rename:** the previously-exported `getRequirementsAction` helper is renamed to `getTokenRequirementActions` and exported from the signature action surface. Its return type is `Action[]`; the new name reflects that it encodes the token permit / permit2 requirement into a list of bundler actions. Update imports of `getRequirementsAction` to `getTokenRequirementActions`.

  `@morpho-org/wdk-protocol-lending-morpho-evm` is updated to pass single signatures as arrays to `buildTx` and widens `getBorrowRequirements` to surface the new signable authorization requirement. `MorphoBorrowOptions` gains a `requirementSignature` field, plumbed through `borrow` / `quoteBorrow`, so a signed authorization fetched via `getBorrowRequirements` (when `supportSignature: true`) can be folded into the bundle as `setAuthorizationWithSig` instead of requiring a separate `setAuthorization` transaction.

  `@morpho-org/liquidity-sdk-viem` bumps its `@morpho-org/morpho-sdk` peer-dependency range to `^5.0.0` to track the new major (the previous `^3.0.0` range no longer matched the published version).

- [#839](https://github.com/morpho-org/sdks/pull/839) [`cdff8c4`](https://github.com/morpho-org/sdks/commit/cdff8c458445d4ad7ff596ec316a5a8e8c0a12f3) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Remove the deprecated `ReallocationData.getAvailableLiquidityToTargetUtilization` alias. Use `getAvailableLiquidityToUtilization` instead — it has the same signature and behavior; only the method name (and its `targetUtilization` parameter, now `utilization`) changed.

### Minor Changes

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

### Patch Changes

- [#841](https://github.com/morpho-org/sdks/pull/841) [`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add Robinhood Chain (chain id 4663) to the shared chain and address registries.

  Register the `ChainId.RobinhoodMainnet` enum member, its explorer/native-currency metadata, and its era-2 Morpho Blue, AdaptiveCurveIrm, Bundler3, VaultV2, adapter-factory, registry, oracle-factory, pre-liquidation-factory, and wrapped-native addresses (sourced from the `morpho-org/deployments` address book).

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#828](https://github.com/morpho-org/sdks/pull/828) [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add World Chain USDC with permit version 2 support to the shared address registry.

  Normalize fallback Circle permit token address checks so known USDC/EURC addresses use permit domain version `"2"` regardless of caller-provided address casing.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#823](https://github.com/morpho-org/sdks/pull/823) [`e0208c2`](https://github.com/morpho-org/sdks/commit/e0208c299fa68552cc2b93adbd93b5d30ecaff5c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix the deployless `GetVault` query reverting on all MetaMorpho vaults.

  `fetchVault` (and `fetchAccrualVault`) silently fell back to multicall because the deployless query reverted while decoding the EIP-5267 domain: reading the high-level `eip712Domain()` struct return hits a Solidity via-IR decoding regression that reverts on valid domains. The query now decodes the raw `eip712Domain()` returndata as a tuple, the same workaround already used by `GetToken`. `deployless: "force"` no longer throws and the deployless fast path is restored (one RPC round-trip instead of a full multicall).

  The deployless query now also reads `lostAssets` (MetaMorpho V1.1), so the deployless and multicall paths return identical `Vault` state.

- [#848](https://github.com/morpho-org/sdks/pull/848) [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Update Midnight ABI/hash helpers and register Base Midnight deployment addresses.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`e0208c2`](https://github.com/morpho-org/sdks/commit/e0208c299fa68552cc2b93adbd93b5d30ecaff5c), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0
  - @morpho-org/blue-sdk-viem@5.1.2
  - @morpho-org/blue-sdk@6.3.0

## 4.2.0

### Minor Changes

- [#813](https://github.com/morpho-org/sdks/pull/813) [`3af165a`](https://github.com/morpho-org/sdks/commit/3af165a3c3c12e66308e6aa77750e6f28d1ab2fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add `ReallocationData.getAvailableLiquidityToUtilization` (with a `utilization` parameter) and deprecate the previous `getAvailableLiquidityToTargetUtilization` / `targetUtilization` naming.

  The `target utilization` wording wrongly suggested a market's configured supply-target utilization, whereas the argument is just an arbitrary utilization ceiling the caller wants to bring the market to. The old method is kept as a `@deprecated` alias that delegates to the new one (to be removed in the next major), so existing consumers keep working. Behavior is unchanged.

## 4.1.0

### Minor Changes

- [#796](https://github.com/morpho-org/sdks/pull/796) [`2936ffa`](https://github.com/morpho-org/sdks/commit/2936ffa5ed4c435b1593fb3e99537a95afbb12ad) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add two read-only public-allocator liquidity metrics as `ReallocationData` methods.

  - `ReallocationData.getPublicReallocationLiquidity(marketId, options?)`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Never throws on insufficiency (returns `0n`).
  - `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, targetUtilization?, options?)`: liquidity available to bring a market to `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`) — the max borrow keeping post-borrow utilization at or below the target on the post-reallocation supply, i.e. `getBorrowToUtilization({ supply + L, borrow }, targetUtilization)`. Returns only the market's own borrow headroom when `supplyTargetUtilization > targetUtilization`, and `0n` when the market is already at or above the target and the reallocatable liquidity is too small to bring it back under.

## 4.0.0

### Major Changes

- [#767](https://github.com/morpho-org/sdks/pull/767) [`ce4f5dc`](https://github.com/morpho-org/sdks/commit/ce4f5dc855b3d28d5d5f4f9857e6a7b0670fdb59) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Rename the `MarketV1` market abstraction to `Blue` (Morpho Blue, Morpho's immutable variable-rate lending primitive). This is a breaking change to the public surface — every `MarketV1` identifier is now `Blue`:

  - Client factory: `client.marketV1(marketParams, chainId)` → `client.blue(marketParams, chainId)` (and `client.morpho.blue(...)` on the viem extension).
  - Entity: `MorphoMarketV1` → `MorphoBlue`.
  - Actions interface: `MarketV1Actions` → `BlueActions`.
  - Transaction action types and their `type` discriminants: `MarketV1SupplyAction`/`"marketV1Supply"`, `MarketV1WithdrawAction`/`"marketV1Withdraw"`, `MarketV1SupplyCollateralAction`/`"marketV1SupplyCollateral"`, `MarketV1BorrowAction`/`"marketV1Borrow"`, `MarketV1SupplyCollateralBorrowAction`/`"marketV1SupplyCollateralBorrow"`, `MarketV1RepayAction`/`"marketV1Repay"`, `MarketV1WithdrawCollateralAction`/`"marketV1WithdrawCollateral"`, `MarketV1RepayWithdrawCollateralAction`/`"marketV1RepayWithdrawCollateral"`, `MarketV1RefinanceAction`/`"marketV1Refinance"` → the corresponding `Blue…Action` / `"blue…"` names.

  Integrators must update factory calls, type imports, and any `switch`/pattern-matching on action `type` discriminants. The unrelated Vault V2 adapter types that mirror the on-chain `MorphoMarketV1Adapter` contract (`VaultV2MorphoMarketV1Adapter`, `VaultV2MorphoMarketV1AdapterV2`, their `IAccrual…`/`I…` interfaces, and `morphoMarketV1Adapter*Abi`) are unchanged — they keep matching the deployed contract names.

- [#763](https://github.com/morpho-org/sdks/pull/763) [`d79a788`](https://github.com/morpho-org/sdks/commit/d79a7884bdf7a7eed7c38efa4e8456b859e2bc4f) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Remove the deprecated `MorphoClient` class. The only supported entry point is now the viem extension `morphoViemExtension()`, which adds a stateless `morpho` namespace to a viem client.

  Migrate by extending your viem client instead of wrapping it:

  ```ts
  // Before
  import { MorphoClient } from "@morpho-org/morpho-sdk";
  const morpho = new MorphoClient(client, { supportSignature: true });
  const vault = morpho.vaultV1(vaultAddress, 1);

  // After
  import { morphoViemExtension } from "@morpho-org/morpho-sdk";
  const extended = client.extend(
    morphoViemExtension({ supportSignature: true })
  );
  const vault = extended.morpho.vaultV1(vaultAddress, 1);
  ```

  The entity factories (`vaultV1`, `vaultV2`, `marketV1`), their signatures, and the `MorphoClientType` structural type are unchanged — they now live under `client.morpho`.

### Patch Changes

- [#752](https://github.com/morpho-org/sdks/pull/752) [`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Morph and MegaETH chain metadata, deployment addresses, deployment block lower bounds, and wrapped-native mappings.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- Updated dependencies [[`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c), [`fab0186`](https://github.com/morpho-org/sdks/commit/fab018666faef372a7f695edcd4b54e658f73118), [`bb82f64`](https://github.com/morpho-org/sdks/commit/bb82f6488986e91b228469dca12444a962922c84)]:
  - @morpho-org/blue-sdk@6.2.0
  - @morpho-org/blue-sdk-viem@5.1.1

## 3.2.0

### Minor Changes

- [#749](https://github.com/morpho-org/sdks/pull/749) [`6fc29ef`](https://github.com/morpho-org/sdks/commit/6fc29ef1dcfe2bfabd829f334e0ccb5cb42d459a) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add `MarketV1.refinance()` to migrate a position (collateral + debt) atomically from one Morpho Blue market to another sharing the same loan and collateral tokens. Implemented as a flash-collateral bundle via `onMorphoSupplyCollateral`: GA1 deposits on the target, borrows inside the callback, repays the source, then withdraws the source collateral to settle the deferred transfer — no user-side prefunding required. Shares mode is immune to mid-tx accrual; collat-only and partial migrations are supported. Optional `targetReallocations` propagates PublicAllocator `reallocateTo` calls onto the target market so the in-callback borrow can find on-chain liquidity (parity with `borrow()` / `supplyCollateralBorrow()`). Adds nine typed errors (`NegativeBorrowSharesError`, `BorrowAmountAndSharesExclusiveError`, `NegativeMaxRepaySharePriceError`, `RefinanceSameMarketError`, `RefinanceTokenMismatchError`, `RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`, `RefinanceExceedsBorrowAssetsError`, `RefinanceSharesMissingBorrowAssetsError`) and the `MarketV1RefinanceAction` discriminant (now including `reallocationFee`).

## 3.1.1

### Patch Changes

- [#746](https://github.com/morpho-org/sdks/pull/746) [`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Arc chain metadata, deployment addresses, deployment block lower bounds, and native-token mapping.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- [#736](https://github.com/morpho-org/sdks/pull/736) [`797928c`](https://github.com/morpho-org/sdks/commit/797928cd09234c98ac3259f7a07e7961eb670755) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Clarify Bundler3 Morpho Blue share-price guard names in the bundler action surface.

- Updated dependencies [[`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad), [`738421e`](https://github.com/morpho-org/sdks/commit/738421e4a428ce361d2fe551746b0c406a0fe31f), [`95b07ef`](https://github.com/morpho-org/sdks/commit/95b07ef56b8146f1084a35834243df4a7399a51d), [`6d59b5a`](https://github.com/morpho-org/sdks/commit/6d59b5abdcdab7f5da3df826ea4556899a5b765d), [`43e6cfc`](https://github.com/morpho-org/sdks/commit/43e6cfcf7eaab0355dccbe3f9f55c59cdac72f0a)]:
  - @morpho-org/blue-sdk@6.1.0
  - @morpho-org/blue-sdk-viem@5.1.0
  - @morpho-org/morpho-ts@2.6.0

## 3.1.0

### Minor Changes

- [#684](https://github.com/morpho-org/sdks/pull/684) [`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Adds `morphoSupply` and `morphoWithdraw` to the local Bundler3 action subset (action types, encoder functions, and `encode` dispatch), used by `marketV1Supply` / `marketV1Withdraw`. This keeps `@morpho-org/bundler-sdk-viem` a devDependency only — the published `morpho-sdk` tarball no longer imports it at runtime.

- [#684](https://github.com/morpho-org/sdks/pull/684) [`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add `marketV1Supply` and `marketV1Withdraw` for the loan asset of a Morpho Blue market, routed through bundler3 / GeneralAdapter1. `marketV1Supply` mirrors `marketV1SupplyCollateral` with `maxSharePrice` (anti-inflation) and optional native wrapping when `loanToken === wNative`. `marketV1Withdraw` mirrors `marketV1Borrow` with `minSharePrice` (slippage) and optional PublicAllocator reallocations to top up market liquidity. Withdraw is signer-bound (no `onBehalf` arg; the bundler uses the transaction initiator, matching `marketV1Borrow`); it supports both `assets` and `shares` modes (via the new generic `AssetsOrSharesArgs` type; `RepayAmountArgs` kept as a deprecated alias). New entity methods `MorphoMarketV1.supply()` (validates `marketData.id === marketParams.id`) and `MorphoMarketV1.withdraw()` expose the same surface. `computeReallocations` takes a canonical `{ operation: "borrow" | "withdraw", amount }` shape (single source of truth for shared-liquidity planning); `MorphoMarketV1.getReallocations` keeps a `{ borrowAmount }` alias for back-compat at the entity boundary. Merges `validateNativeCollateral` and `validateNativeLoan` into a single action-agnostic `validateNativeAsset(chainId, asset)`; the corresponding error class is now `NativeAmountOnNonWNativeAssetError` (`NativeAmountOnNonWNativeCollateralError` is kept as a deprecated alias). New typed errors: `NegativeSupplyAmountError`, `NegativeSupplyMaxSharePriceError`, `ZeroSupplyAmountError`, `NonPositiveWithdrawAmountError`, `NegativeWithdrawMinSharePriceError`, `MutuallyExclusiveWithdrawAmountsError`, `WithdrawExceedsSupplyError`, `WithdrawSharesExceedSupplyError`, `ReallocationWithdrawExceedsMarketSupplyError` (raised by `computeReallocations` when a `"withdraw"` `amount` exceeds the target market's total supply — blocks fee-bearing reallocations on an on-chain-unreachable call).

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7)]:
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/blue-sdk-viem@5.0.1
  - @morpho-org/morpho-ts@2.5.3

## 3.0.0

### Major Changes

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Replace public allocator planning inputs with `ReallocationData`, moving reallocation computation off `simulation-sdk` state and adding explicit timestamp-driven reallocation options.

  `ReallocationData.getMarketPublicReallocations` does not carry over the legacy `SimulationState.getMarketPublicReallocations` one-hour `delay` margin. It evaluates target-market vault headroom at `options.timestamp` (or the target market's `lastUpdate` when omitted), so callers that need inclusion-time safety should pass a future timestamp or reserve their own headroom.

### Minor Changes

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Extract the Bundler3 action encoding surface needed by morpho-sdk so it no longer depends on @morpho-org/bundler-sdk-viem.

  `BundlerAction.encodeBundle` now computes the native `tx.value` required by value-carrying Bundler3 calls, including `reallocateTo` fees in top-level and callback actions.

- [#655](https://github.com/morpho-org/sdks/pull/655) [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Re-export consolidated blue-sdk, blue-sdk-viem, and utility surfaces from morpho-sdk through canonical root and subpath entrypoints.

  New root action type imports from `@morpho-org/morpho-sdk`:

  - `MarketV1Actions` from `@morpho-org/morpho-sdk`
  - `VaultV1Actions` from `@morpho-org/morpho-sdk`
  - `VaultV2Actions` from `@morpho-org/morpho-sdk`

  New imports from `@morpho-org/morpho-sdk/types`:

  - `BigIntish` from `@morpho-org/morpho-sdk/types`
  - `ChainMetadata` from `@morpho-org/morpho-sdk/types`
  - `CollateralAllocation` from `@morpho-org/morpho-sdk/types`
  - `DeploylessFetchParameters` from `@morpho-org/morpho-sdk/types`
  - `Eip712Field` from `@morpho-org/morpho-sdk/types`
  - `Erc20AllowanceRecipient` from `@morpho-org/morpho-sdk/types`
  - `Failable` from `@morpho-org/morpho-sdk/types`
  - `Fetchable` from `@morpho-org/morpho-sdk/types`
  - `FetchParameters` from `@morpho-org/morpho-sdk/types`
  - `InputMarketParams` from `@morpho-org/morpho-sdk/types`
  - `IPermit2Allowance` from `@morpho-org/morpho-sdk/types`
  - `Loadable` from `@morpho-org/morpho-sdk/types`
  - `MarketId` from `@morpho-org/morpho-sdk/types`
  - `MaxBorrowOptions` from `@morpho-org/morpho-sdk/types`
  - `MaxPositionCapacities` from `@morpho-org/morpho-sdk/types`
  - `MaxWithdrawCollateralOptions` from `@morpho-org/morpho-sdk/types`
  - `Pending` from `@morpho-org/morpho-sdk/types`
  - `Permit2Allowance` from `@morpho-org/morpho-sdk/types`

  New error imports from `@morpho-org/morpho-sdk/errors`:

  - `_try` from `@morpho-org/morpho-sdk/errors`
  - `BlueErrors` from `@morpho-org/morpho-sdk/errors`
  - `InvalidMarketParamsError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownDataError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownFactory` from `@morpho-org/morpho-sdk/errors`
  - `UnknownMarketParamsError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownOfFactory` from `@morpho-org/morpho-sdk/errors`
  - `UnknownTokenError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownTokenPriceError` from `@morpho-org/morpho-sdk/errors`
  - `UnknownVaultConfigError` from `@morpho-org/morpho-sdk/errors`
  - `UnsupportedChainIdError` from `@morpho-org/morpho-sdk/errors`
  - `UnsupportedPreLiquidationParamsError` from `@morpho-org/morpho-sdk/errors`
  - `UnsupportedVaultV2AdapterError` from `@morpho-org/morpho-sdk/errors`
  - `VaultV2Errors` from `@morpho-org/morpho-sdk/errors`

  New error type imports from `@morpho-org/morpho-sdk/errors`:

  - `ErrorClass` from `@morpho-org/morpho-sdk/errors`

  New address imports from `@morpho-org/morpho-sdk/addresses`:

  - `addresses` from `@morpho-org/morpho-sdk/addresses`
  - `addressesRegistry` from `@morpho-org/morpho-sdk/addresses`
  - `convexWrapperTokens` from `@morpho-org/morpho-sdk/addresses`
  - `deployments` from `@morpho-org/morpho-sdk/addresses`
  - `erc20WrapperTokens` from `@morpho-org/morpho-sdk/addresses`
  - `getChainAddresses` from `@morpho-org/morpho-sdk/addresses`
  - `getPermissionedCoinbaseTokens` from `@morpho-org/morpho-sdk/addresses`
  - `getUnwrappedToken` from `@morpho-org/morpho-sdk/addresses`
  - `NATIVE_ADDRESS` from `@morpho-org/morpho-sdk/addresses`
  - `permissionedBackedTokens` from `@morpho-org/morpho-sdk/addresses`
  - `permissionedCoinbaseTokens` from `@morpho-org/morpho-sdk/addresses`
  - `permissionedWrapperTokens` from `@morpho-org/morpho-sdk/addresses`
  - `registerCustomAddresses` from `@morpho-org/morpho-sdk/addresses`
  - `unwrappedTokensMapping` from `@morpho-org/morpho-sdk/addresses`

  New address type imports from `@morpho-org/morpho-sdk/addresses`:

  - `AddressLabel` from `@morpho-org/morpho-sdk/addresses`
  - `ChainAddresses` from `@morpho-org/morpho-sdk/addresses`
  - `ChainDeployments` from `@morpho-org/morpho-sdk/addresses`

  New constants imports from `@morpho-org/morpho-sdk/constants`:

  - `APPROVE_ONLY_ONCE_TOKENS` from `@morpho-org/morpho-sdk/constants`
  - `BLUE_API_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `BLUE_API_GRAPHQL_URL` from `@morpho-org/morpho-sdk/constants`
  - `CDN_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `ChainId` from `@morpho-org/morpho-sdk/constants`
  - `ChainUtils` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_LLTV_BUFFER` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_SUPPLY_TARGET_UTILIZATION` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_SLIPPAGE_TOLERANCE` from `@morpho-org/morpho-sdk/constants`
  - `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` from `@morpho-org/morpho-sdk/constants`
  - `DOCS_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `EIP_712_FIELDS` from `@morpho-org/morpho-sdk/constants`
  - `isMarketId` from `@morpho-org/morpho-sdk/constants`
  - `LIQUIDATION_CURSOR` from `@morpho-org/morpho-sdk/constants`
  - `MAX_ABSOLUTE_SHARE_PRICE` from `@morpho-org/morpho-sdk/constants`
  - `MAX_LIQUIDATION_INCENTIVE_FACTOR` from `@morpho-org/morpho-sdk/constants`
  - `MAX_SLIPPAGE_TOLERANCE` from `@morpho-org/morpho-sdk/constants`
  - `MAX_TOKEN_APPROVALS` from `@morpho-org/morpho-sdk/constants`
  - `MORPHO_DOMAIN` from `@morpho-org/morpho-sdk/constants`
  - `OPTIMIZERS_API_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `OPTIMIZERS_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `ORACLE_PRICE_SCALE` from `@morpho-org/morpho-sdk/constants`
  - `REWARDS_BASE_URL` from `@morpho-org/morpho-sdk/constants`
  - `SECONDS_PER_YEAR` from `@morpho-org/morpho-sdk/constants`
  - `TransactionType` from `@morpho-org/morpho-sdk/constants`
  - `ZERO_ADDRESS` from `@morpho-org/morpho-sdk/constants`

  New entity imports from `@morpho-org/morpho-sdk/entities`:

  - `AccrualPosition` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVault` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `AccrualVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `AssetBalances` from `@morpho-org/morpho-sdk/entities`
  - `ConstantWrappedToken` from `@morpho-org/morpho-sdk/entities`
  - `Eip5267Domain` from `@morpho-org/morpho-sdk/entities`
  - `ExchangeRateWrappedToken` from `@morpho-org/morpho-sdk/entities`
  - `Holding` from `@morpho-org/morpho-sdk/entities`
  - `Market` from `@morpho-org/morpho-sdk/entities`
  - `MarketParams` from `@morpho-org/morpho-sdk/entities`
  - `MorphoMarketV1` from `@morpho-org/morpho-sdk/entities`
  - `MorphoVaultV1` from `@morpho-org/morpho-sdk/entities`
  - `MorphoVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `Position` from `@morpho-org/morpho-sdk/entities`
  - `PreLiquidationParams` from `@morpho-org/morpho-sdk/entities`
  - `PreLiquidationPosition` from `@morpho-org/morpho-sdk/entities`
  - `ReallocationData` from `@morpho-org/morpho-sdk/entities`
  - `Token` from `@morpho-org/morpho-sdk/entities`
  - `User` from `@morpho-org/morpho-sdk/entities`
  - `Vault` from `@morpho-org/morpho-sdk/entities`
  - `VaultConfig` from `@morpho-org/morpho-sdk/entities`
  - `VaultMarketAllocation` from `@morpho-org/morpho-sdk/entities`
  - `VaultMarketConfig` from `@morpho-org/morpho-sdk/entities`
  - `VaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`
  - `VaultToken` from `@morpho-org/morpho-sdk/entities`
  - `VaultUser` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `VaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `WrappedToken` from `@morpho-org/morpho-sdk/entities`

  New entity type imports from `@morpho-org/morpho-sdk/entities`:

  - `IAccrualPosition` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVault` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `IAccrualVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IAssetBalances` from `@morpho-org/morpho-sdk/entities`
  - `IEip5267Domain` from `@morpho-org/morpho-sdk/entities`
  - `IHolding` from `@morpho-org/morpho-sdk/entities`
  - `IMarket` from `@morpho-org/morpho-sdk/entities`
  - `IMarketParams` from `@morpho-org/morpho-sdk/entities`
  - `InputReallocationData` from `@morpho-org/morpho-sdk/entities`
  - `IPosition` from `@morpho-org/morpho-sdk/entities`
  - `IPreLiquidationParams` from `@morpho-org/morpho-sdk/entities`
  - `IPreLiquidationPosition` from `@morpho-org/morpho-sdk/entities`
  - `IToken` from `@morpho-org/morpho-sdk/entities`
  - `IVault` from `@morpho-org/morpho-sdk/entities`
  - `IVaultConfig` from `@morpho-org/morpho-sdk/entities`
  - `IVaultMarketAllocation` from `@morpho-org/morpho-sdk/entities`
  - `IVaultMarketConfig` from `@morpho-org/morpho-sdk/entities`
  - `IVaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`
  - `IVaultToken` from `@morpho-org/morpho-sdk/entities`
  - `IVaultUser` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2Allocation` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/entities`
  - `IVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/entities`
  - `PeripheralBalance` from `@morpho-org/morpho-sdk/entities`
  - `PeripheralBalanceType` from `@morpho-org/morpho-sdk/entities`
  - `VaultPublicAllocatorConfig` from `@morpho-org/morpho-sdk/entities`

  New fetch imports from `@morpho-org/morpho-sdk/fetch`:

  - `fetchAccrualPosition` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVault` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchAccrualVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchHolding` from `@morpho-org/morpho-sdk/fetch`
  - `fetchMarket` from `@morpho-org/morpho-sdk/fetch`
  - `fetchMarketParams` from `@morpho-org/morpho-sdk/fetch`
  - `fetchPosition` from `@morpho-org/morpho-sdk/fetch`
  - `fetchPreLiquidationParams` from `@morpho-org/morpho-sdk/fetch`
  - `fetchPreLiquidationPosition` from `@morpho-org/morpho-sdk/fetch`
  - `fetchToken` from `@morpho-org/morpho-sdk/fetch`
  - `fetchUser` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVault` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultConfig` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultMarketAllocation` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultMarketConfig` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultUser` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2MorphoMarketV1Adapter` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2MorphoMarketV1AdapterV2` from `@morpho-org/morpho-sdk/fetch`
  - `fetchVaultV2MorphoVaultV1Adapter` from `@morpho-org/morpho-sdk/fetch`

  New format imports from `@morpho-org/morpho-sdk/format`:

  - `BaseFormatter` from `@morpho-org/morpho-sdk/format`
  - `CommasFormatter` from `@morpho-org/morpho-sdk/format`
  - `CommonFormatter` from `@morpho-org/morpho-sdk/format`
  - `convertNumStrFromEffectiveTo` from `@morpho-org/morpho-sdk/format`
  - `convertNumStrToLocal` from `@morpho-org/morpho-sdk/format`
  - `createFormat` from `@morpho-org/morpho-sdk/format`
  - `Format` from `@morpho-org/morpho-sdk/format`
  - `format` from `@morpho-org/morpho-sdk/format`
  - `formatEnumeration` from `@morpho-org/morpho-sdk/format`
  - `formatLongString` from `@morpho-org/morpho-sdk/format`
  - `formatUnion` from `@morpho-org/morpho-sdk/format`
  - `getEffectiveLocale` from `@morpho-org/morpho-sdk/format`
  - `getEnUSNumberToLocalParts` from `@morpho-org/morpho-sdk/format`
  - `getLocaleSymbols` from `@morpho-org/morpho-sdk/format`
  - `HexFormatter` from `@morpho-org/morpho-sdk/format`
  - `LocaleParts` from `@morpho-org/morpho-sdk/format`
  - `NumberFormatter` from `@morpho-org/morpho-sdk/format`
  - `PercentFormatter` from `@morpho-org/morpho-sdk/format`
  - `ShortFormatter` from `@morpho-org/morpho-sdk/format`

  New ABI imports from `@morpho-org/morpho-sdk/abis`:

  - `aaveV2MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `aaveV3MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `aaveV3OptimizerMigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `adaptiveCurveIrmAbi` from `@morpho-org/morpho-sdk/abis`
  - `blueAbi` from `@morpho-org/morpho-sdk/abis`
  - `blueOracleAbi` from `@morpho-org/morpho-sdk/abis`
  - `bundler3Abi` from `@morpho-org/morpho-sdk/abis`
  - `compoundV2MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `compoundV3MigrationAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `coreAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `erc20WrapperAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `erc2612Abi` from `@morpho-org/morpho-sdk/abis`
  - `erc5267Abi` from `@morpho-org/morpho-sdk/abis`
  - `ethereumGeneralAdapter1Abi` from `@morpho-org/morpho-sdk/abis`
  - `generalAdapter1Abi` from `@morpho-org/morpho-sdk/abis`
  - `marketParamsAbi` from `@morpho-org/morpho-sdk/abis`
  - `metaMorphoAbi` from `@morpho-org/morpho-sdk/abis`
  - `metaMorphoFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterV2Abi` from `@morpho-org/morpho-sdk/abis`
  - `morphoMarketV1AdapterV2FactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoVaultV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `morphoVaultV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `paraswapAdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `permissionedErc20WrapperAbi` from `@morpho-org/morpho-sdk/abis`
  - `permit2Abi` from `@morpho-org/morpho-sdk/abis`
  - `preLiquidationAbi` from `@morpho-org/morpho-sdk/abis`
  - `preLiquidationFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `publicAllocatorAbi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV1AdapterAbi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV1AdapterFactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV2Abi` from `@morpho-org/morpho-sdk/abis`
  - `vaultV2FactoryAbi` from `@morpho-org/morpho-sdk/abis`
  - `whitelistControllerAggregatorV2Abi` from `@morpho-org/morpho-sdk/abis`
  - `wrappedBackedTokenAbi` from `@morpho-org/morpho-sdk/abis`
  - `wstEthAbi` from `@morpho-org/morpho-sdk/abis`

  New utility imports from `@morpho-org/morpho-sdk/utils`:

  - `AdaptiveCurveIrmLib` from `@morpho-org/morpho-sdk/utils`
  - `addTransactionMetadata` from `@morpho-org/morpho-sdk/utils`
  - `ArrayElementType` from `@morpho-org/morpho-sdk/utils`
  - `bigIntComparator` from `@morpho-org/morpho-sdk/utils`
  - `CapacityLimit` from `@morpho-org/morpho-sdk/utils`
  - `CapacityLimitReason` from `@morpho-org/morpho-sdk/utils`
  - `computeMaxRepaySharePrice` from `@morpho-org/morpho-sdk/utils`
  - `computeMinBorrowSharePrice` from `@morpho-org/morpho-sdk/utils`
  - `computeReallocations` from `@morpho-org/morpho-sdk/utils`
  - `createGetValue` from `@morpho-org/morpho-sdk/utils`
  - `createHasValue` from `@morpho-org/morpho-sdk/utils`
  - `decodeBytes32String` from `@morpho-org/morpho-sdk/utils`
  - `deepFreeze` from `@morpho-org/morpho-sdk/utils`
  - `DeepPartial` from `@morpho-org/morpho-sdk/utils`
  - `DottedKeys` from `@morpho-org/morpho-sdk/utils`
  - `entries` from `@morpho-org/morpho-sdk/utils`
  - `FieldType` from `@morpho-org/morpho-sdk/utils`
  - `filterDefined` from `@morpho-org/morpho-sdk/utils`
  - `fromEntries` from `@morpho-org/morpho-sdk/utils`
  - `getAuthorizationTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getDaiPermitTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getLast` from `@morpho-org/morpho-sdk/utils`
  - `getLastDefined` from `@morpho-org/morpho-sdk/utils`
  - `getPermit2PermitTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getPermit2TransferFromTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getPermitTypedData` from `@morpho-org/morpho-sdk/utils`
  - `getSubdomainBaseUrl` from `@morpho-org/morpho-sdk/utils`
  - `getValue` from `@morpho-org/morpho-sdk/utils`
  - `hasValue` from `@morpho-org/morpho-sdk/utils`
  - `isDefined` from `@morpho-org/morpho-sdk/utils`
  - `isNotNull` from `@morpho-org/morpho-sdk/utils`
  - `isNotUndefined` from `@morpho-org/morpho-sdk/utils`
  - `keys` from `@morpho-org/morpho-sdk/utils`
  - `MarketUtils` from `@morpho-org/morpho-sdk/utils`
  - `mergeEntries` from `@morpho-org/morpho-sdk/utils`
  - `MathLib` from `@morpho-org/morpho-sdk/utils`
  - `optionalBoolean` from `@morpho-org/morpho-sdk/utils`
  - `PartialDottedKeys` from `@morpho-org/morpho-sdk/utils`
  - `readContractRestructured` from `@morpho-org/morpho-sdk/utils`
  - `retryPromiseLinearBackoff` from `@morpho-org/morpho-sdk/utils`
  - `restructure` from `@morpho-org/morpho-sdk/utils`
  - `safeGetAddress` from `@morpho-org/morpho-sdk/utils`
  - `safeParseNumber` from `@morpho-org/morpho-sdk/utils`
  - `safeParseUnits` from `@morpho-org/morpho-sdk/utils`
  - `RoundingDirection` from `@morpho-org/morpho-sdk/utils`
  - `SharesMath` from `@morpho-org/morpho-sdk/utils`
  - `Time` from `@morpho-org/morpho-sdk/utils`
  - `transformValue` from `@morpho-org/morpho-sdk/utils`
  - `validateAccrualPosition` from `@morpho-org/morpho-sdk/utils`
  - `validateChainId` from `@morpho-org/morpho-sdk/utils`
  - `validateNativeCollateral` from `@morpho-org/morpho-sdk/utils`
  - `validatePositionHealth` from `@morpho-org/morpho-sdk/utils`
  - `validatePositionHealthAfterWithdraw` from `@morpho-org/morpho-sdk/utils`
  - `validateReallocations` from `@morpho-org/morpho-sdk/utils`
  - `validateRepayAmount` from `@morpho-org/morpho-sdk/utils`
  - `validateRepayParams` from `@morpho-org/morpho-sdk/utils`
  - `validateRepayShares` from `@morpho-org/morpho-sdk/utils`
  - `validateSlippageTolerance` from `@morpho-org/morpho-sdk/utils`
  - `validateUserAddress` from `@morpho-org/morpho-sdk/utils`
  - `VaultUtils` from `@morpho-org/morpho-sdk/utils`
  - `values` from `@morpho-org/morpho-sdk/utils`
  - `WithId` from `@morpho-org/morpho-sdk/utils`
  - `WithIndex` from `@morpho-org/morpho-sdk/utils`

  New augmentation imports:

  - side-effect import `@morpho-org/morpho-sdk/augment` to augment every supported symbol
  - `AccrualPosition` from `@morpho-org/morpho-sdk/augment/AccrualPosition`
  - `AccrualVault` from `@morpho-org/morpho-sdk/augment/AccrualVault`
  - `Holding` from `@morpho-org/morpho-sdk/augment/Holding`
  - `Market` from `@morpho-org/morpho-sdk/augment/Market`
  - `MarketParams` from `@morpho-org/morpho-sdk/augment/MarketParams`
  - `Position` from `@morpho-org/morpho-sdk/augment/Position`
  - `Token` from `@morpho-org/morpho-sdk/augment/Token`
  - `User` from `@morpho-org/morpho-sdk/augment/User`
  - `Vault` from `@morpho-org/morpho-sdk/augment/Vault`
  - `VaultConfig` from `@morpho-org/morpho-sdk/augment/VaultConfig`
  - `VaultMarketAllocation` from `@morpho-org/morpho-sdk/augment/VaultMarketAllocation`
  - `VaultMarketConfig` from `@morpho-org/morpho-sdk/augment/VaultMarketConfig`
  - `VaultMarketPublicAllocatorConfig` from `@morpho-org/morpho-sdk/augment/VaultMarketPublicAllocatorConfig`
  - `VaultUser` from `@morpho-org/morpho-sdk/augment/VaultUser`

  Remove the formatter's String prototype mutation so the morpho-sdk utils entrypoint can re-export morpho-ts utilities without adding a top-level side effect.

  `ReallocationData` and `InputReallocationData` are intentionally exposed from `@morpho-org/morpho-sdk/entities`. Moving them there is not a breaking change in this re-export changeset because they are introduced by the pending `extract-public-reallocation-data` changeset and have not been published as root-level `morpho-sdk` imports.

### Patch Changes

- Updated dependencies [[`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0)]:
  - @morpho-org/morpho-ts@2.5.2

## 2.1.1

### Patch Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - `addTransactionMetadata` now strips a leading `"0x"` from `metadata.origin` before validating and appending it. Previously, passing `"0xcafe"` and `"cafe"` produced different calldata: `"0xcafe"` was rejected by the upstream `isHex` check (which receives the raw fragment) while `"cafe"` was accepted. With this change, both inputs produce the same 4-byte origin appended to `tx.data`. Length validation (max 8 hex chars) is applied to the raw fragment, so `"0xdeadbeef00"` (10 raw hex chars) is still rejected.

## 2.1.0

### Minor Changes

- [#677](https://github.com/morpho-org/sdks/pull/677) [`0f71108`](https://github.com/morpho-org/sdks/commit/0f71108d40854e1bb9186e52c6ce94aa4ab91912) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Export `getRequirementsAction` on the public surface. The helper encodes a pre-signed permit / permit2 requirement followed by a transfer to an arbitrary `recipient`, and was previously `@internal` (reachable only via deep dist paths). Exposing it lets action builders outside this package — e.g. the Aave V3 → Vault V2 migration in `morpho-apps` — route the pulled asset to a non-default recipient such as `AaveV3CoreMigrationAdapter`, without copying the permit/permit2 encoding logic.

  Also exports `Permit2ExpirationMissingError`, the typed error `getRequirementsAction` now throws when a `permit2` requirement signature is missing `args.expiration` (previously a generic `Error`).

### Patch Changes

- [#578](https://github.com/morpho-org/sdks/pull/578) [`e27f9bd`](https://github.com/morpho-org/sdks/commit/e27f9bdffccdfe950104b0507c5252fa3d15ab27) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix MarketV1 share-mode `repay` and `repayWithdrawCollateral` reverting on dormant markets: `transferAmount` and `maxSharePrice` are now sized from the accrued market snapshot instead of the stale `lastUpdate` state, so full-repay matches its accrual-immune contract.

- [#681](https://github.com/morpho-org/sdks/pull/681) [`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - **`blue-sdk`** — Fix `VaultV2._wrap` / `_unwrap` (and everything layered on them: `toAssets`, `toShares`, `maxWithdraw`, plus `previewWithdrawShares` in `deallocation.ts`) overstating assets whenever management or performance fees are pending. The previous math paired **post-accrue** `totalAssets` (from `accrueInterestView`) with **pre-accrue** `totalSupply` (still missing the fee shares the next accrual will mint), overshooting the share price by `~ pendingFeeShares / totalSupply`. Conversions now pair stored `_totalAssets` with stored `totalSupply` — both pre-accrue, internally consistent. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math; it rolls `_totalAssets` forward and mints pending fee shares into `totalSupply` atomically. `AccrualVaultV2.maxDeposit`'s relative-cap check now reads `_totalAssets` instead of `totalAssets`.

  **Breaking:** `VaultV2.totalAssets` is removed (it always equalled `_totalAssets` after the fix). Read `_totalAssets` instead.

  **`blue-sdk-viem`** — `fetchVaultV2` no longer calls `vault.totalAssets()` (deployless and multicall paths), saving one RPC read per fetch.

  **`morpho-sdk`** — `MorphoVaultV2.deposit` and `MorphoVaultV1.migrateToV2` previously sized `maxSharePrice` from `vaultData.toShares(amount)` directly. With the conversion fix above, that share count is now pre-accrue, so the bound was below the actual onchain share price at execution and every bundled deposit reverted with `SlippageExceeded` (`0x8199f5f3`) inside `GeneralAdapter1`. Both entities now forward-accrue the target VaultV2 by 2h before computing the bound, mirroring `MorphoMarketV1.repay`'s shares-mode pattern.

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0
  - @morpho-org/blue-sdk-viem@5.0.0
  - @morpho-org/simulation-sdk@4.0.0
  - @morpho-org/bundler-sdk-viem@5.0.0

## 2.0.0

### Major Changes

- [#631](https://github.com/morpho-org/sdks/pull/631) [`2520c09`](https://github.com/morpho-org/sdks/commit/2520c093ddbfb284805c02b375d35493e32d3f25) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Rename VaultV1 and VaultV2 deposit parameters from `accrualVault` to `vaultData`.

- [#666](https://github.com/morpho-org/sdks/pull/666) [`c4d5a28`](https://github.com/morpho-org/sdks/commit/c4d5a28120a1bf764478023720d8fc30b6e91286) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Stop hard-enforcing `userAddress` matches the connected client account on
  transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`,
  `repay`, `withdrawCollateral`, `repayWithdrawCollateral`,
  `supplyCollateralBorrow`) and `MorphoVaultV1.migrateToV2` no longer call
  `validateUserAddress` at the builder layer — callers may now build a tx
  for any `userAddress` regardless of the client's connected account (or
  with a public client that has no account at all).

  The builder = signer invariant is now enforced exclusively at `sign()`
  time on the signature requirements. `Requirement.sign` and
  `ERC20PermitAction.sign` are typed against viem's `WalletClient` instead
  of the more permissive `Client` — **this is a TypeScript-breaking
  surface change** and is the reason this release is marked `major`.
  Downstream code that previously passed a value typed as `Client` to
  `sign()` will no longer compile and must switch to a `WalletClient`
  (e.g. `createWalletClient(...)` or `publicClient.extend(walletActions)`).
  Runtime behavior is unchanged for callers already passing a wallet
  client with the matching account.

  `encodeErc20Permit` / `encodeErc20Permit2` call `validateUserAddress`
  internally to reject any `sign(client, userAddress)` where the client
  account is missing or differs from `userAddress` with
  `MissingClientPropertyError` / `AddressMismatchError`. Signing on behalf
  of a different address is the only path where the divergence is a real
  security concern, so the check stays exactly there.

  `validateUserAddress` remains exported from `@morpho-org/morpho-sdk` and
  is no longer dead code — it is the canonical check used by the signature
  requirements above.

### Minor Changes

- [#656](https://github.com/morpho-org/sdks/pull/656) [`5584ce5`](https://github.com/morpho-org/sdks/commit/5584ce5e5c70ef19d35304cc1e74b106a08821d7) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deprecate `MorphoClient` in favor of `morphoViemExtension`. Extend a viem public (or wallet) client with `morphoViemExtension(...)` and use `client.morpho.vaultV1 / vaultV2 / marketV1` instead of constructing `MorphoClient` directly. `MorphoClient` will be removed in the next major release.

### Patch Changes

- [#654](https://github.com/morpho-org/sdks/pull/654) [`217ba29`](https://github.com/morpho-org/sdks/commit/217ba29c1a80284795a9d01250e55750ad9d0f00) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Internal: `getRequirementsAction` now takes the transfer recipient as an
  explicit `recipient` parameter instead of resolving it from `chainId`. The
  function is `@internal` and not part of the public surface; all in-repo
  callers (`marketV1` supply/repay paths, `vaultV1`/`vaultV2` deposit, and
  `vaultV1` migrate-to-v2) have been updated to pass `recipient: generalAdapter1`
  directly. No behavior change — same destination address, just no longer
  hard-coded inside the helper.

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`81825a8`](https://github.com/morpho-org/sdks/commit/81825a8864d8c4228c8476380d1ad7e76a5ee1c0), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
  - @morpho-org/blue-sdk-viem@4.6.6
  - @morpho-org/simulation-sdk@3.4.4
