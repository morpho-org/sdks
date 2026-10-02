# ADR-2026-10-02: Route Midnight actions through MidnightBundlesV2

| Field      | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| **Status** | accepted                                                                                    |
| **Date**   | 2026-10-02                                                                                  |
| **Author** | @jinmel                                                                                     |
| **Scope**  | Packages and target versions: `morpho-sdk` 7.0.0, `midnight-sdk` minor, `morpho-ts` minor   |

_Status is the only field that changes after acceptance._

## Context

`client.morpho.midnight(chainId)` sent its taker flows (`takeLend`, `takeBorrow`,
`supplyCollateralTakeBorrow`, `repayWithdrawCollateral`) through `MidnightBundlesV1`. Its maker
flows did not use a bundle: they returned approval, ratifier-authorization and root-ratification
prerequisites, then one mempool publication transaction, so creating, funding and replacing offers
took several transactions with no atomicity.

`MidnightBundlesV2` replaced V1 at the contract level. It has five entrypoints: one maker entrypoint
(`midnightBundlesV2CancelAndMake`) and four taker entrypoints (buy or sell, each with a units target
or an assets target). Each entrypoint serves several product intents, selected by its arguments:
the same maker call cancels groups, publishes offers, parks loan assets on Blue or supplies
collateral depending on which inputs are empty; the same buy call lends, repays through offers, or
repays directly depending on `reduceOnly`, `repayEnabled` and `offerFills`. V2 also dropped V1's
`taker` argument and inline token permits: every entrypoint acts for `msg.sender`, pulls tokens with
plain ERC-20 allowances, and requires the caller to have authorized the bundle on Midnight.

Shipping V2 as a second route next to V1 would leave integrators choosing between two contracts for
the same intent, and exposing the five entrypoints raw would push the argument combinations that
encode each intent onto every integrator.

## Decision

`MidnightBundlesV2` is the only bundle route of the `morpho-sdk` 7.0.0 Midnight surface. It replaces
`MidnightBundlesV1` in every migrated flow; the 7.0.0 major carries no V1 route, route flag or
fallback. Products that need V1 stay on the 6.x major, which remains published.

### One action per intent

The SDK exposes one entity method per product intent, not per entrypoint. Each method fixes the
intent-selecting arguments and exposes only the inputs that vary within that intent. Each taker
intent has its own pure action builder; the maker intents share the `midnightCancelAndMake` builder,
whose arguments the entity methods fill.

| Entity method | Pure action builder | Entrypoint | Fixed arguments |
| --- | --- | --- | --- |
| `cancelOffers` | `midnightCancelAndMake` | `CancelAndMake` | `newRoot = 0`, `assetsToPark = 0`, no collateral supplies |
| `cancelAndMakeLend` | `midnightCancelAndMake` | `CancelAndMake` | lend-side offers, `assetsToPark = 0`, no collateral supplies |
| `cancelAndMakeBorrow` | `midnightCancelAndMake` | `CancelAndMake` | borrow-side offers, `assetsToPark = 0`, no collateral supplies |
| `supplyBlueMakeLend` | `midnightCancelAndMake` | `CancelAndMake` | lend-side offers whose callback is the maker's derived `BlueBuyCallback`, `assetsToPark > 0` |
| `supplyCollateralMakeBorrow` | `midnightCancelAndMake` | `CancelAndMake` | borrow-side offers, non-empty collateral supplies, `assetsToPark = 0` |
| `takeLend` | `midnightTakeLend` | `BuyWith{Units,Assets}Target…` | `reduceOnly = false`, `repayEnabled = false`, no collateral withdrawals |
| `takeRepayWithdrawCollateral` | `midnightTakeRepayWithdrawCollateral` | `BuyWith{Units,Assets}Target…` | `reduceOnly = true`; `repayEnabled` is an input |
| `repayWithdrawCollateral` | `midnightRepayWithdrawCollateral` | `BuyWithUnitsTarget…` | `repayEnabled = true`, empty `offerFills`; full repay encodes `targetUnits = maxUint256` |
| `takeBorrow` | `midnightTakeBorrow` | `SupplyCollateralAndSellWith{Units,Assets}Target` | `reduceOnly = false`, no collateral supplies |
| `supplyCollateralTakeBorrow` | `midnightSupplyCollateralTakeBorrow` | `SupplyCollateralAndSellWith{Units,Assets}Target` | `reduceOnly = false`, non-empty collateral supplies |
| `takeWithdraw` | `midnightTakeWithdraw` | `SupplyCollateralAndSellWith{Units,Assets}Target` | `reduceOnly = true`, no collateral supplies |

Rules shared by the taker actions:

- The amount target is a discriminated union, `{ type: "assets", … } | { type: "units", … }`, which
  selects the assets-target or units-target entrypoint. Each arm carries its own aggregate bound
  (`maxBuyerAssets` or `minUnits` on buys, `minSellerAssets` or `maxUnits` on sells).
- `reduceOnly` and `repayEnabled` are never free inputs of a lending or borrowing action; only
  `takeRepayWithdrawCollateral` exposes `repayEnabled`, as its direct-repayment fallback.
- Referral fee (`referralFeePct`, `referralFeeRecipient`) is an optional input on every taker action
  and defaults to no fee. `maxContinuousFee` is an input only on buy actions, because the sell
  entrypoints do not accept it.
- Sell actions account for V2 withdrawing the sender's existing credit before taking offers, so a
  borrow by a sender with credit nets that credit first.
- Collateral supplies and withdrawals are lists of `{ collateralIndex, assets }`; `maxUint256`
  `assets` on a withdrawal means the sender's full balance at execution.

Rules shared by the maker actions:

- Group cancellation is a list of `{ group, maxConsumed }`; an empty list publishes without
  cancelling. Replacement offers must use group IDs not present in the cancellation list.
- Root activation targets `PriceRatifierV1` or `RateRatifierV1` only. An EOA maker activates the
  root with a signature, which `buildTx` encodes as `v, r, s`; a contract-wallet maker encodes
  `v = r = s = 0`. The ratifier authorization, root activation and payload publication happen
  inside the bundle call, so they are no longer separate requirements.
- The root and the publication payload are derived deterministically from the offers input, so
  every handle built from the same inputs encodes the same values, with or without a signature.
- For an EOA maker, the root-activation values `v, r, s`, `signatureHeight`, `signatureNonce` and
  `signatureDeadline` reach `buildTx` only through the signature's `args`, as required by
  ADR-2026-09-23-stateless-entity-flows. A contract-wallet maker and `cancelOffers` take no
  signature.

### Every entrypoint acts for the sender

Every V2 action is executed by the account whose position it changes. Requirement resolution and
encoding follow from that:

- Action inputs name that account as `accountAddress`; there is no `taker`, `onBehalf` or `maker`
  input distinct from the sender. Maker actions reject offers whose maker is not `accountAddress`.
- Token requirements for the bundle call are ERC-20 approvals from `accountAddress` to
  `MidnightBundlesV2` for exactly the assets the call pulls: `targetBuyerAssets` on an
  assets-target buy, `maxBuyerAssets` on a units-target buy, each collateral supply, and
  `assetsToPark`. ERC-2612 and Permit2 requirements are not produced, because V2 accepts no inline
  permit.
- A full repay (`targetUnits = maxUint256`) still sets a finite `maxBuyerAssets` at or above the
  sender's debt; the unused remainder is returned.
- Lend offers that the maker funds directly (`cancelAndMakeLend`) keep the maker's loan-token
  approval to `midnight`, sized to the offered and reserved loan assets, because Midnight pulls
  those tokens from the maker when the offer is taken. Offers funded through the Blue callback do
  not need it.
- Every V2 action requires `accountAddress` to have authorized `MidnightBundlesV2` on Midnight;
  `getRequirements()` returns that authorization when it is missing. `MidnightBundlesV2` and the
  V1 ratifiers are added to the supported Midnight authorization targets.
- Native-token funding is out of scope: actions encode `value = 0`. Native wrapping is a separate
  decision.

### Public surface and semver

- `midnight-sdk` adds `midnightBundlesV2Abi` and the V2 struct types (minor). `morpho-ts` adds the
  `midnightBundlesV2` address and deployment-block keys per chain (minor). `morpho-sdk` re-exports
  `midnightBundlesV2Abi` from `/midnight` and its root facade, next to `midnightBundlesAbi`.
- The V1 symbols stay exported and are marked `@deprecated`: `midnightBundlesAbi` in `midnight-sdk`
  and its `morpho-sdk` re-exports, and the `midnightBundles` address and deployment-block keys in
  `morpho-ts`. Their removal is a later decision.
- `morpho-sdk` 7.0.0 keeps the established method and action names of the migrated flows
  (`takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `repayWithdrawCollateral`,
  `supplyCollateralMakeBorrow`) and retypes their inputs, action `args`, requirement spenders and
  authorization targets for V2. Removed inputs: `taker`, inline permits, and single-amount targets
  replaced by the target union. The migration guide lists each.
- `cancelOffers`, `cancelAndMakeLend`, `cancelAndMakeBorrow`, `supplyBlueMakeLend`,
  `takeRepayWithdrawCollateral` and `takeWithdraw` are additions.
- `cancelOffer` stays as the direct Midnight call for one group; it needs no bundle authorization.
- `makeLend` and `makeBorrow` do not use V1 and are not covered by the route replacement: they are
  marked `@deprecated` in favour of `cancelAndMakeLend` and `cancelAndMakeBorrow` and follow the
  standard deprecation lifecycle.
- `supplyCollateralMakeBorrow` did not use V1 either, but it is retyped in place rather than
  deprecated: its V2 successor serves the same intent under the same name, and the prior
  non-atomic flow can leave collateral supplied with no live offer when publication fails.
- The route replacement of the migrated flows invokes a narrow lifecycle exception, added
  to `AGENTS.md` §7 with this record. It does not waive the major changeset, migration guide or
  maintained-dependent audit.

This decision does not cover native-token wrapping, the callback model behind `supplyBlueMakeLend`
beyond the derived-callback check, Blue market safety policy for parked assets, or quote and offer
selection.

## Invariants

- Every migrated and added Midnight bundle action targets the chain's `midnightBundlesV2` address
  and encodes a `midnightBundlesV2*` selector → unit tests per action builder.
- No `morpho-sdk` 7.0.0 action encodes a `midnightBundlesV1*` selector → a unit test over every
  Midnight action builder's encoded calldata.
- Each action fixes the intent arguments in the table above → encoder tests decode calldata and
  assert `reduceOnly`, `repayEnabled`, `newRoot`, `assetsToPark` and list emptiness per action.
- Requirements for assets the bundle call pulls name `MidnightBundlesV2` as approval spender,
  every V2 action requires Midnight authorization of `MidnightBundlesV2`, and no V2 requirement is
  a permit → requirement unit tests and pinned-fork integration tests per method.
- Maker actions reject offers whose maker differs from `accountAddress` and replacement groups that
  are also being cancelled → typed-error unit tests.
- Two handles built from the same inputs produce the same transaction for the same root signature
  → cross-handle tests on every signature-consuming maker method.
- Revisit if `MidnightBundlesV2` gains an entrypoint, an `onBehalf` argument or inline permits, or
  changes the argument semantics documented at the reviewed contract revision.

## Rejected alternatives

- **Keep V1 as a selectable route in 7.0.0.** Rejected because two routes for the same intent is
  the ambiguity the major removes; 6.x remains available to V1 consumers.
- **One action per entrypoint exposing every argument.** Rejected because the intent is encoded in
  argument combinations (`reduceOnly`, `repayEnabled`, empty lists, zero root) that integrators
  would have to reproduce, and an invalid combination would execute a different product action.
- **Emulate `taker`/`onBehalf` on V2.** Rejected because V2 acts only for `msg.sender`; an input
  naming another account would build transactions that cannot act for it.

## References

- ADR-2026-06-03-midnight-action-output-interface — the lazy action output shape these actions keep.
- ADR-2026-08-25-blue-bundles-v1-sdk-actions — the precedent for replacing a high-level route
  while keeping method names.
- ADR-2026-09-23-stateless-entity-flows — signature-only transport between requirements and
  `buildTx`.
- [`MidnightBundlesV2` at the reviewed revision](https://github.com/morpho-org/bundles/blob/07f293b383824b35adc745454ac2622a27eb0502/src/midnight/MidnightBundlesV2.sol)
  and its [interface](https://github.com/morpho-org/bundles/blob/07f293b383824b35adc745454ac2622a27eb0502/src/midnight/interfaces/IMidnightBundlesV2.sol).
- Accepted in the PR that added this file.
