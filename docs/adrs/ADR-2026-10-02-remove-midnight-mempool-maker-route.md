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
`makeLend` and `makeBorrow` stay as `@deprecated` methods for one minor, `supplyCollateralMakeBorrow`
is retyped in place, and EOA makers activate their offer root with a signature passed to `buildTx`.

Keeping the mempool route means a second publication path, with its Ecrecover and SetterRatifier
signing, for the same intent that `cancelAndMakeLend` and `cancelAndMakeBorrow` serve atomically.
`morpho-sdk` 7.0.0 is already a major for the V2 route; a deprecation minor would only delay the
same break and keep an untested route shipping for another release.

## Decision

`morpho-sdk` 7.0.0 removes the mempool maker route in one step, skipping the successor-introduction,
`@deprecated` and one-minor coexistence steps of the AGENTS.md §7 flow. This supersedes the parts of
ADR-2026-10-02-midnight-bundles-v2-sdk-actions listed below; the rest of that record still holds.

- `makeLend`, `makeBorrow` and `supplyCollateralMakeBorrow` are removed. `cancelAndMakeLend` and
  `cancelAndMakeBorrow` replace them; `cancelAndMakeBorrow` takes optional collateral supplies, so
  it also covers `supplyCollateralMakeBorrow`.
- The route-specific surface is removed with them: `MakeOffersOutput`, the `mempoolSubmitOffers` and
  `setterRatifierRatifyRoot` builders and requirement, the `MidnightOfferRootSignature*` and
  `MidnightActionSignatures` types, and the offer-root signature errors.
- Maker entity methods activate the root with `v = r = s = 0` and zero signature height, nonce and
  deadline for every maker. The ratifier then checks only that the maker has authorized
  `MidnightBundlesV2` on Midnight, which these methods already require, so no off-chain signature
  step exists. The pure `midnightCancelAndMake` builder still accepts an explicit delegated root
  signature.
- `PriceRatifierV1` and `RateRatifierV1` are not Midnight authorization targets; makers authorize
  `MidnightBundlesV2`.

The major changeset, the migration guide and continued availability of the 6.x major still apply.
No removal outside this list inherits this exception.

## Invariants

- No `makeLend`, `makeBorrow`, `supplyCollateralMakeBorrow` or `mempoolSubmitOffers` export remains
  in `morpho-sdk` 7.x. Check: the public export snapshot and a grep of the package entrypoints.
- Maker entity methods return no signature requirement and encode all-zero root-signature fields.
  Check: entity unit tests decode the calldata and assert the zero fields.
- Revisit if a ratifier used by maker flows requires a root signature even when the bundle is
  authorized.

## References

- Supersedes, in part,
  [`ADR-2026-10-02-midnight-bundles-v2-sdk-actions`](./ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md).
- Precedent: [`ADR-2026-09-17-remove-bundler3-primitives-without-deprecation`](./ADR-2026-09-17-remove-bundler3-primitives-without-deprecation.md).
