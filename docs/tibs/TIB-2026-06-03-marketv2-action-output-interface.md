# TIB-2026-06-03: MarketV2 action output interface for Midnight flows

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Status** | Proposed                             |
| **Date**   | 2026-06-03                           |
| **Author** | Romain / Carapulse draft             |
| **Scope**  | Package: `morpho-sdk` / MarketV2 SDK |

---

## Context

`morpho-sdk` currently models every user operation as a lazy entity result:

```ts
{
  getRequirements: () => Promise<readonly RequirementItem[]>;
  buildTx: (requirementSignature?: RequirementSignature) => Readonly<Transaction<TAction>>;
}
```

The concrete implementation is still MarketV1 / vault oriented:

- `buildTx(...)` returns one final `Transaction<TAction>`.
- `getRequirements(...)` returns prerequisite approval / permit / authorization items.
- `Requirement` currently means only a signature requirement (`permit` / `permit2`).
- Transaction requirements are raw `Transaction<ERC20ApprovalAction>` or `Transaction<MorphoAuthorizationAction>` values.
- The shared `getRequirements(...)` helper is tuned for `bundler3.generalAdapter1` as spender.

The fixed-rate app (`morpho-apps/apps/markets-v2-app`) already implements the Midnight / MarketV2 flows, but under its UI-specific `ActionFlow` abstraction:

- market/taker flows produce optional approval transactions, optional `Midnight.setIsAuthorized(...)`, and one final bundler transaction;
- maker/limit flows produce optional approval transactions, optional ratifier authorization, either one EOA root signature or one contract-wallet root-ratification transaction, then one mempool submit transaction;
- some user-level flows are multi-transaction (`supplyCollateral` before posting a borrow offer, `repay` before withdrawing collateral);
- none of the current fixed-rate app builders use `ActionFlow` `before` / `after` callbacks.

This TIB freezes the minimal SDK output-shape change needed before migrating those Midnight action builders into `morpho-sdk`.

## Goals / Non-Goals

**Goals**

- Keep the public SDK contract centered on `{ getRequirements, buildTx }`.
- Represent every currently implemented fixed-rate app flow without adding an SDK `ActionFlow` engine.
- Preserve the existing `Transaction` shape: `{ to, value, data, action }`.
- Preserve action-layer purity: actions stay synchronous, encode-only, and deep-frozen.
- Keep existing MarketV1 / vault methods source-compatible; widen types only where needed.
- Make requirement ordering explicit enough for multi-step Midnight flows.
- Support both maker consent paths: EOA / EIP-7702 signature and contract-wallet root ratification.

**Non-Goals**

- No `ActionFlowProvider`, `CallRequest`, `before`, or `after` clone in `morpho-sdk`.
- No generic DAG / dependency graph of steps.
- No `buildTxs()` as the primary interface.
- No validation requirement objects. Router validation, alpha limits, tick spacing, and liquidity checks throw typed errors from entity / requirement resolution.
- No Permit / Permit2 support for Midnight in this migration. The fixed-rate app uses approval transactions (`PermitKind.None`), and supporting token permits plus offer-root signatures would require multiple signatures per action.
- No SDK modeling for app-only forms, dialogs, or UI copy.

## Decision

Keep `buildTx` as the final transaction builder and widen `getRequirements` into an **ordered list of pre-execution items**.

```ts
export interface ActionOutput<
  TAction extends BaseAction,
  TSignature extends RequirementSignature = RequirementSignature,
> {
  readonly getRequirements: () => Promise<readonly ActionRequirement[]>;
  readonly buildTx: (signature?: TSignature) => Readonly<Transaction<TAction>>;
}
```

Semantics:

1. `getRequirements()` returns every item that must be satisfied **before** `buildTx()`'s transaction is sent.
2. Items are already filtered: if an approval / authorization is not needed, it is omitted.
3. Returned items are ordered and must be processed in order.
4. A transaction item is not necessarily an approval; it can be an authorization, contract-wallet root ratification, or mandatory prelude transaction.
5. A signature item returns the `RequirementSignature` value passed into `buildTx(signature)`.
6. Existing methods may keep narrower return types; new MarketV2 methods use `ActionRequirement`.

This is the smallest compatible change: Midnight flows that are one final tx remain one final tx, while flows with required prelude txs place those prelude txs in `getRequirements()` rather than forcing a new `buildTxs()` surface.

## Type changes

### Requirement aliases

Add explicit aliases, without changing the shape of existing `Requirement` objects.

```ts
export type SignatureRequirementAction =
  | PermitAction
  | Permit2Action
  | MarketV2OfferRootSignatureAction;

export type RequirementSignatureArgs =
  | PermitArgs
  | Permit2Args
  | MarketV2OfferRootSignatureArgs;

export interface Requirement {
  readonly sign: (
    client: WalletClient,
    userAddress: Address,
  ) => Promise<RequirementSignature>;
  readonly action: SignatureRequirementAction;
}

export interface RequirementSignature {
  readonly args: RequirementSignatureArgs;
  readonly action: SignatureRequirementAction;
}
```

Compatibility:

- Existing `permit` and `permit2` requirement objects stay structurally identical.
- Existing consumers that check `"sign" in requirement` still work.
- New consumers can discriminate on `requirement.action.type`.

### Transaction requirements

Add a named transaction-requirement union. Existing raw `Transaction<...>` requirement values stay valid.

```ts
export type TransactionRequirementAction =
  | ERC20ApprovalAction
  | MorphoAuthorizationAction
  | MarketV2AuthorizationAction
  | MarketV2RootRatificationAction
  | MarketV2SupplyCollateralAction
  | MarketV2RepayAction;

export type TransactionRequirement = Readonly<
  Transaction<TransactionRequirementAction>
>;

export type ActionRequirement = TransactionRequirement | Requirement;
```

`MarketV2SupplyCollateralAction` and `MarketV2RepayAction` are included because they can be mandatory prelude transactions for currently implemented app flows:

- borrow-limit with collateral + offer: supply collateral first, then submit the offer;
- repay + withdraw collateral: repay first, then withdraw collateral.

### New MarketV2 / Midnight requirement actions

Use public `MarketV2*` action names for SDK metadata. The calldata still targets `Midnight`, `MidnightBundles`, `EcrecoverRatifier`, `SetterRatifier`, and the mempool contract.

```ts
export interface MarketV2AuthorizationAction
  extends BaseAction<
    "marketV2Authorization",
    {
      owner: Address;
      authorized: Address;
      isAuthorized: boolean;
    }
  > {}

export interface MarketV2RootRatificationAction
  extends BaseAction<
    "marketV2RootRatification",
    {
      ratifier: Address;
      maker: Address;
      root: Hex;
      isRatified: boolean;
    }
  > {}

export interface MarketV2OfferRootSignatureAction
  extends BaseAction<
    "marketV2OfferRootSignature",
    {
      root: Hex;
      verifyingContract: Address;
      chainId: number;
      maker: Address;
      group: Hex;
      offerCount: number;
    }
  > {}

export interface MarketV2OfferRootSignatureArgs {
  readonly root: Hex;
  readonly signature: Hex;
  readonly payload: Hex;
}
```

`MarketV2OfferRootSignatureArgs.payload` is the encoded mempool payload produced after the root signature is collected. `buildTx(signature)` uses it as the final submit calldata.

### New final action metadata

Add action union members only; do not change `Transaction`.

```ts
export interface MarketV2LendMarketAction
  extends BaseAction<
    "marketV2LendMarket",
    {
      market: Hex;
      assets: bigint;
      minUnits: bigint;
      taker: Address;
      offerCount: number;
    }
  > {}

export interface MarketV2BorrowMarketAction
  extends BaseAction<
    "marketV2BorrowMarket",
    {
      market: Hex;
      loanAmount: bigint;
      maxUnits: bigint;
      collateralAmount: bigint;
      taker: Address;
      offerCount: number;
    }
  > {}

export interface MarketV2SupplyCollateralAction
  extends BaseAction<
    "marketV2SupplyCollateral",
    {
      market: Hex;
      collateralIndex: bigint;
      assets: bigint;
      onBehalf: Address;
    }
  > {}

export interface MarketV2SubmitOffersAction
  extends BaseAction<
    "marketV2SubmitOffers",
    {
      group: Hex;
      maker: Address;
      offerCount: number;
      ratifier: Address;
    }
  > {}

export interface MarketV2RedeemAction
  extends BaseAction<
    "marketV2Redeem",
    {
      market: Hex;
      units: bigint;
      owner: Address;
      receiver: Address;
    }
  > {}

export interface MarketV2RepayAction
  extends BaseAction<
    "marketV2Repay",
    {
      market: Hex;
      units: bigint;
      onBehalf: Address;
    }
  > {}

export interface MarketV2WithdrawCollateralAction
  extends BaseAction<
    "marketV2WithdrawCollateral",
    {
      market: Hex;
      collateralIndex: bigint;
      assets: bigint;
      owner: Address;
      receiver: Address;
    }
  > {}

export interface MarketV2CancelOfferAction
  extends BaseAction<
    "marketV2CancelOffer",
    {
      group: Hex;
      consumed: bigint;
      maker: Address;
    }
  > {}
```

Extend `TransactionAction` with these action interfaces and the MarketV2 requirement action interfaces above (`MarketV2AuthorizationAction`, `MarketV2RootRatificationAction`).

## Minimal helper changes

### General approval helper

Do not reuse the top-level MarketV1 `getRequirements(...)` helper for Midnight, because it hardcodes `bundler3.generalAdapter1` as spender. Reuse / export the lower-level approval helper instead:

```ts
getRequirementsApproval({
  address: token,
  chainId,
  args: {
    spendAmount: requiredAmount,
    approvalAmount,
    spender,
  },
  allowances,
});
```

Midnight callers supply the spender explicitly:

- `MidnightBundles` for lend-market and borrow-market taker flows;
- `Midnight` for direct `supplyCollateral`, direct `repay`, and maker lend-limit loan-token approvals.

### MarketV2 authorization helper

Add a helper that reads `Midnight.isAuthorized(owner, authorized)` and returns one tx only when missing.

```ts
async function getMarketV2AuthorizationRequirement(client, {
  midnight,
  owner,
  authorized,
}: {
  midnight: Address;
  owner: Address;
  authorized: Address;
}): Promise<Readonly<Transaction<MarketV2AuthorizationAction>> | undefined>
```

Returned tx:

```ts
Midnight.setIsAuthorized(authorized, true, owner)
```

### Ratifier requirements helper

One helper hides EOA vs contract-wallet maker consent.

```ts
async function getMarketV2RatifierRequirements(client, {
  maker,
  tree,
  ratifier,
  chainId,
}: {
  maker: Address;
  tree: OfferTree;
  ratifier: RatifierInfo;
  chainId: number;
}): Promise<{
  requirements: readonly ActionRequirement[];
  buildSubmitData: (signature?: RequirementSignature) => Hex;
}>
```

EOA / EIP-7702 maker:

- optional `MarketV2AuthorizationAction` for `EcrecoverRatifier`;
- one `Requirement` with `action.type === "marketV2OfferRootSignature"`;
- `Requirement.sign(...)` calls the same typed-data root-signing path as the fixed-rate app and returns `{ action, args: { root, signature, payload } }`;
- `buildTx(signature)` uses `signature.args.payload` as mempool calldata.

Contract-wallet maker:

- optional `MarketV2AuthorizationAction` for `SetterRatifier`;
- one `MarketV2RootRatificationAction` transaction requirement calling `SetterRatifier.setIsRootRatified(maker, root, true)`;
- `buildTx()` uses precomputed `Payload.encode(SetterRatifier.encodeItems({ tree }))` as mempool calldata.

## Layering

The migration must preserve the monorepo's `Client → Entity → Action` split.

- **Entity layer** performs reads and off-chain checks: allowances, `isAuthorized`, `getCode` / ratifier selection, router validation, alpha limits, tick spacing, quote reads, credit / withdrawable reads, and group generation.
- **Action layer** is synchronous and encode-only: it receives already-computed amounts, offers, payloads, roots, and addresses, then returns deep-frozen `Transaction` values.
- **Helpers** are pure unless explicitly placed in the requirement-resolution boundary.

Important boundary calls:

- randomness (`group = bytes32`) is entity-level, not action-level;
- signing is inside `Requirement.sign`, not action-level;
- router validation throws before a signature prompt is exposed;
- no raw `Error`; every new failure mode gets a typed error in `src/types/error.ts`.

## Flow mapping

### Lend market

`getRequirements()` returns:

1. optional `ERC20ApprovalAction` for `loanToken.approve(MidnightBundles, approvalAmount)`;
2. optional `MarketV2AuthorizationAction` for `Midnight.setIsAuthorized(MidnightBundles, true, taker)`.

`buildTx()` returns `MarketV2LendMarketAction`:

```ts
MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral(
  assets,
  minUnits,
  taker,
  { kind: 0, data: "0x" },
  takes,
  [],
  zeroAddress,
  0n,
  zeroAddress,
)
```

No signature.

### Borrow market with `loanAmount > 0`

`getRequirements()` returns:

1. optional `ERC20ApprovalAction` for `collateralToken.approve(MidnightBundles, approvalAmount)` when new collateral is supplied;
2. optional `MarketV2AuthorizationAction` for `Midnight.setIsAuthorized(MidnightBundles, true, taker)`.

`buildTx()` returns `MarketV2BorrowMarketAction`:

```ts
MidnightBundles.supplyCollateralAndSellWithAssetsTarget(
  loanAmount,
  maxUnits,
  taker,
  receiver,
  collateralSupplies,
  takes,
  0n,
  zeroAddress,
)
```

No signature.

### Borrow market supply-only branch

`getRequirements()` returns optional collateral approval to `Midnight`.

`buildTx()` returns `MarketV2SupplyCollateralAction`:

```ts
Midnight.supplyCollateral(market, 0n, collateralAssets, onBehalf)
```

### Lend limit / multi-limit

`getRequirements()` returns:

1. optional loan-token approval to `Midnight` for `reservedLoanAssets + loanAssets`;
2. optional `MarketV2AuthorizationAction` for the chosen ratifier;
3. EOA / EIP-7702: one `marketV2OfferRootSignature` requirement;
4. contract wallet: one `marketV2RootRatification` transaction requirement.

`buildTx(signature?)` returns `MarketV2SubmitOffersAction` to the mempool contract.

The single-market lend-limit method delegates to the same multi-limit builder with one `{ market, tick }` entry.

### Borrow limit collateral-only branch

`getRequirements()` returns optional collateral approval to `Midnight`.

`buildTx()` returns `MarketV2SupplyCollateralAction`.

### Borrow limit loan-only branch

`getRequirements()` returns:

1. optional `MarketV2AuthorizationAction` for the chosen ratifier;
2. EOA / EIP-7702: one `marketV2OfferRootSignature` requirement;
3. contract wallet: one `marketV2RootRatification` transaction requirement.

`buildTx(signature?)` returns `MarketV2SubmitOffersAction` to the mempool contract.

### Borrow limit collateral + loan branch

`getRequirements()` returns:

1. optional collateral approval to `Midnight`;
2. **mandatory** `MarketV2SupplyCollateralAction` transaction requirement;
3. optional `MarketV2AuthorizationAction` for the chosen ratifier;
4. EOA / EIP-7702: one `marketV2OfferRootSignature` requirement;
5. contract wallet: one `marketV2RootRatification` transaction requirement.

`buildTx(signature?)` returns only the final `MarketV2SubmitOffersAction`.

This branch is the reason `getRequirements()` must be allowed to return mandatory prelude transactions, not only optional prerequisites.

### Redeem at maturity

Pre-read / validation happens before returning the action output:

- `updatePositionView(...)` gives `creditUnits`;
- `withdrawable(marketId) >= creditUnits`.

`getRequirements()` returns `[]`.

`buildTx()` returns `MarketV2RedeemAction`:

```ts
Midnight.withdraw(market, creditUnits, receiver, owner)
```

### Repay / withdraw collateral

Repay only:

- `getRequirements()` returns optional loan-token approval to `Midnight`;
- `buildTx()` returns `MarketV2RepayAction`.

Withdraw-only:

- `getRequirements()` returns `[]`;
- `buildTx()` returns `MarketV2WithdrawCollateralAction`.

Repay + withdraw:

- `getRequirements()` returns optional loan-token approval, then mandatory `MarketV2RepayAction`;
- `buildTx()` returns final `MarketV2WithdrawCollateralAction`.

### Cancel offer

`getRequirements()` returns `[]`.

`buildTx()` returns `MarketV2CancelOfferAction`:

```ts
Midnight.setConsumed(group, maxUint256, maker)
```

## Compatibility checklist

This proposal is compatible with the current fixed-rate app flows because:

- every app `CallRequest` maps either to a `TransactionRequirement` or to `buildTx()`;
- every app `SignatureRequest` maps to `Requirement.sign(...)`;
- the `Transaction` wire shape is unchanged;
- no app builder currently needs `before` / `after` callback semantics;
- all app approvals are transaction approvals, so the existing single `RequirementSignature` argument is enough;
- EOA maker flow needs exactly one signature: the offer-root signature;
- contract-wallet maker flow needs zero signatures and one root-ratification tx;
- all multi-tx app flows can be represented by ordered requirements plus final `buildTx()`.

The only semantic expansion is documented: returned transaction requirements are **ordered pre-execution items** and can include mandatory prelude transactions. Consumers must execute every returned item in order unless they intentionally replace it with an equivalent already-satisfied state.

## Considered alternatives

### Alternative 1: Add `buildTxs()`

Return the whole transaction sequence from the action output.

**Why rejected:** larger public API change, duplicates `getRequirements`, and forces every existing SDK consumer to learn a second execution model. The current app flows only need one final tx plus ordered pre-execution items.

### Alternative 2: Port the app `ActionFlow` abstraction

Copy `signatureRequests`, `callRequests`, `before`, and `after` into the SDK.

**Why rejected:** this imports UI execution-engine concepts into a pure SDK package. The current fixed-rate app builders define no `before` / `after` requirements, so the extra machinery buys nothing for the initial migration.

### Alternative 3: Keep `getRequirements()` limited to approvals / authorizations

Expose only optional prerequisites and force callers to build prelude txs manually.

**Why rejected:** borrow-limit collateral + loan and repay + withdraw cannot be expressed safely. Integrators would need bespoke sequencing outside the SDK, which defeats the migration goal.

### Alternative 4: Support Midnight Permit / Permit2 immediately

Let maker/taker flows use token permits and offer-root signatures together.

**Why rejected:** the fixed-rate app uses approval transactions today. Adding token permits would require multiple signatures per final tx (`permit` + offer root) or a keyed signature bag. That is a bigger interface change and not needed for compatibility with the app.

## Implementation phases

- **Phase 1 — Types only.** Add `ActionRequirement`, `TransactionRequirement`, widened `Requirement` / `RequirementSignature` unions, MarketV2 action interfaces, and type guards. Existing methods keep their narrow return types.
- **Phase 2 — Requirement helpers.** Export / reuse `getRequirementsApproval` with explicit spender; add MarketV2 authorization and ratifier helpers.
- **Phase 3 — Pure action encoders.** Add `src/actions/marketV2/*` encoders for final txs and prelude txs. Every encoder returns a deep-frozen `Transaction` and has colocated unit tests.
- **Phase 4 — Entity methods.** Add `MorphoMarketV2` methods that perform RPC/off-chain reads, router validation, amount math, group generation, and return `{ getRequirements, buildTx }`.
- **Phase 5 — Integration tests.** Fork-test each flow shape: no requirement, approval reset, missing authorization, EOA root signature, contract-wallet root ratification, mandatory prelude txs, and cancel offer.
- **Phase 6 — Docs / changeset.** Update package `AGENTS.md`, generated docs/JSDoc, README snippets, and add a minor changeset when code lands.

## Security

- **No blind signing beyond the protocol's intended root signature.** The SDK must build the offer tree locally from the SDK input and validate the router response before exposing `marketV2OfferRootSignature`. The wallet signs only the root produced from those local offers.
- **No signing inside actions.** `Requirement.sign(...)` is the only signing boundary and takes a `WalletClient` from the integrator.
- **No hidden prelude txs.** Mandatory prelude transactions are visible in `getRequirements()` as typed `Transaction` values.
- **Authorization target is explicit.** `MarketV2AuthorizationAction.args.authorized` is either `MidnightBundles`, `EcrecoverRatifier`, or `SetterRatifier`; never inferred by a consumer.
- **Approval target is explicit.** Midnight approval helper callers pass `spender`; no default to `GeneralAdapter1`.
- **Typed errors only.** Router validation, alpha limits, invalid ticks, insufficient liquidity, no credit, and insufficient withdrawable liquidity each get exported typed errors before implementation lands.

## Future considerations

- If Midnight later supports token permits in the SDK, introduce `buildTx(signatures: readonly RequirementSignature[])` or a keyed signature bag in a separate TIB. Do not overload the single optional signature argument silently.
- If a future MarketV2 flow needs a real wait condition (`before` / `after` equivalent), add a small `wait` requirement kind at that time. Do not preemptively port app `ActionFlow`.
- If consumers strongly reject mandatory prelude transactions inside `getRequirements()`, revisit `buildTxs()` with evidence from integration feedback.

## References

- `packages/morpho-sdk/src/types/action.ts` — current `Transaction`, `Requirement`, and action unions.
- `packages/morpho-sdk/src/actions/requirements/getRequirements.ts` — current GeneralAdapter1-oriented requirement helper.
- `packages/morpho-sdk/src/actions/requirements/getRequirementsApproval.ts` — lower-level approval helper to reuse with explicit spender.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/order/actions/lend-market/buildLendMarketOrderActionFlow.ts` — lend-market app flow.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/order/actions/borrow-market/buildBorrowMarketOrderActionFlow.ts` — borrow-market app flow.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/multi-limit-order/buildMultiLimitOrderActionFlow.ts` — lend-limit / OCA app flow.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/order/actions/borrow-limit/buildBorrowLimitOrderActionFlow.ts` — borrow-limit app flow.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/order/actions/limit-order.utils.ts` — ratifier detection, root signing, and mempool submit.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/position/actions/redeem/buildRedeemActionFlow.ts` — redeem flow.
- `morpho-org/morpho-apps/apps/markets-v2-app/lib/modules/position/actions/repay-withdraw/buildRepayWithdrawActionFlow.ts` — repay / withdraw collateral flow.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §2 (forbidden patterns), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
