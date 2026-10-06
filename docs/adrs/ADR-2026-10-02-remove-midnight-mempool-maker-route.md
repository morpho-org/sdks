# ADR-2026-10-02: Remove the Midnight mempool maker route without deprecation

| Field      | Value                    |
| ---------- | ------------------------ |
| **Status** | accepted                 |
| **Date**   | 2026-10-02               |
| **Author** | @jinmel                  |
| **Scope**  | `morpho-sdk` 7.0.0 major |

_Status is the only field that changes after acceptance._

## Context

[`ADR-2026-10-02-midnight-bundles-v2-sdk-actions`](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md)
moves the Midnight maker intents to `MidnightBundlesV2` but keeps the mempool maker route alive:
`makeLend` and `makeBorrow` stay as `@deprecated` mempool methods for one minor while the atomic
methods are named `cancelAndMakeLend` and `cancelAndMakeBorrow`; `supplyCollateralMakeBorrow` is
retyped in place, and EOA makers activate their offer root with a signature passed to `buildTx`.

Keeping the mempool route means a second publication path, with its Ecrecover and SetterRatifier
signing, for the same intent that the parent record's `cancelAndMakeLend` and `cancelAndMakeBorrow`
methods serve atomically. The maintainer chose to ship those methods under the v6 names instead.
`morpho-sdk` 7.0.0 is already a major for the V2 route; a deprecation minor would only delay the
same break and keep an untested route shipping for another release.

## Decision

`morpho-sdk` 7.0.0 removes the mempool maker route in one step, skipping the successor-introduction,
`@deprecated` and one-minor coexistence steps of the AGENTS.md §7 flow. This supersedes the parts of
ADR-2026-10-02-midnight-bundles-v2-sdk-actions listed below; the rest of that record still holds.

- `makeLend`, `makeBorrow` and `supplyCollateralMakeBorrow` are retyped in place onto
  `MidnightBundlesV2` and keep their names. The parent record's `cancelAndMakeLend` and
  `cancelAndMakeBorrow` ship under these names, so no `cancelAndMake*` entity method is added.
  Each accepts optional cancellations; `makeBorrow` uses `MakeOffersParams` and takes no
  collateral. `supplyCollateralMakeBorrow` requires `collateral: { market, supplies }`, builds
  `midnightCancelAndMake` directly, and rejects an empty supply list. Its collateral input replaces
  `market`, `collateralAssets` and `collateralIndex`, and `reservedCollateralAssets` is removed.
- The route-specific surface is removed with them: `mempoolSubmitOffers`
  (`MempoolSubmitOffersParams`, `MempoolSubmitOffersAction`),
  `setterRatifierRatifyRoot` (`SetterRatifierRatifyRootParams`,
  `SetterRatifierRatifyRootAction`), `getSetterRatifierRatifyRootRequirement`
  (`GetSetterRatifierRatifyRootRequirementParams`), the
  `MidnightOfferRootSignature*`, `MidnightOfferRootRequirement` and `MidnightActionSignatures`
  types, `isMidnightOfferRootSignature`, the `midnightOfferRoot` slot of
  `selectRequirementSignatures` (`SelectedRequirementSignatures`), the
  `"midnightOfferRootSignature"` member of `RequirementSignatureKind`, the offer-root signature
  errors, and `UnknownMidnightRatifierError`.
- The maker types kept in 7.0.0 are retyped in place: `MakeOffersParams`, `MakeLendParams`, and
  `MakeOffersOutput` keep their v6 export names (`MidnightMakeOffersParams`,
  `MidnightMakeLendParams`, and `MidnightMakeOffersOutput`); `makeBorrow` continues to use
  `MakeOffersParams`, while `SupplyCollateralMakeBorrowParams` extends it with required
  `MidnightMakeBorrowCollateral`; `MorphoMidnight.getOffersData` and the maker `offers` input accept
  only a PriceRatifierV1 or RateRatifierV1 tree (`MidnightMakerTreeInput`)
  instead of any `TreeInput`; `MidnightOfferValidationParams` drops `ratification`;
  `MidnightOffersData.ratifierType` becomes `"priceV1" | "rateV1"` and its `setterPayload` is
  replaced by `payload`; `MidnightSupplyCollateralMakeBorrowParams` requires
  `collateral: MidnightMakeBorrowCollateral`.
- The pure `midnightCancelAndMake` builder does not restrict `ratifier`: MidnightBundlesV2 has no
  allowlist and only requires the root setter to return `SET_IS_ROOT_RATIFIED_SUCCESS`. This
  supersedes the “Root activation targets `PriceRatifierV1` or `RateRatifierV1` only” clause in
  ADR-2026-10-02-midnight-bundles-v2-sdk-actions for the builder. Maker entity methods still use
  the chain's registered V1 ratifier for the tree type.
- Maker entity methods activate the root with `v = r = s = 0` and zero signature height, nonce and
  deadline for every maker. The ratifier then checks only that the maker has authorized
  `MidnightBundlesV2` on Midnight, which these methods already require, so no off-chain signature
  step exists. The pure `midnightCancelAndMake` builder still accepts an explicit delegated root
  signature.
- `getMidnightAuthorizationRequirement` and `midnightSetIsAuthorized` no longer accept the
  EcrecoverRatifier or SetterRatifier as `authorized` targets, and do not accept `PriceRatifierV1`
  or `RateRatifierV1` either; makers authorize `MidnightBundlesV2`, which authorizes the V1 ratifier
  itself.

The major changeset, the migration guide and continued availability of the 6.x major still apply.
No removal outside this list inherits this exception.

## Invariants

- No `cancelAndMakeLend`, `cancelAndMakeBorrow` or `mempoolSubmitOffers` export remains in
  `morpho-sdk` 7.x; all three maker methods return `MakeOffersOutput`. Check: the public export
  snapshot and a grep of the package entrypoints.
- Maker entity methods return no signature requirement and encode all-zero root-signature fields.
  Check: entity unit tests decode the calldata and assert the zero fields.
- Revisit if a ratifier used by maker flows requires a root signature even when the bundle is
  authorized.

## References

- Supersedes, in part,
  [`ADR-2026-10-02-midnight-bundles-v2-sdk-actions`](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md).
- Supersedes, in part, the maker mempool route in
  [`ADR-2026-06-03-midnight-action-output-interface`](./ADR-2026-06-03-midnight-action-output-interface.md).
- Precedent: [`ADR-2026-09-17-remove-bundler3-primitives-without-deprecation`](./ADR-2026-09-17-remove-bundler3-primitives-without-deprecation.md).
