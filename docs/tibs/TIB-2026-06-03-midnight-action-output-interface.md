# TIB-2026-06-03: Midnight action flow implementation

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Status** | Accepted                             |
| **Date**   | 2026-06-03                           |
| **Author** | Romain / Carapulse draft             |
| **Scope**  | Package: `morpho-sdk` / Midnight SDK |

---

## Context

This TIB specifies the implementation of Midnight action flows in `morpho-sdk`. The source behavior is the markets app (`morpho-apps/apps/markets-app`): its home-made action builders already encode the protocol paths, requirement ordering, token-pull policy, ratifier selection, and mempool submission behavior future integrators need. The SDK should lift that protocol logic into reusable Midnight entity / action flows, while keeping the markets app migration as close as possible to an adapter swap.

The markets app is also the compatibility target. To minimize its diff, the SDK exposes each flow
as a lazy `TransactionPlan`: the app prepares the plan when it is ready to discover prerequisites,
renders the typed signature and call requests, collects signatures at its wallet boundary, and then
builds the executable call sequence.

```ts
const prepared = await plan.prepare();

const signatures: RequirementSignature[] = [];
for (const request of prepared.signatureRequests) {
  signatures.push(await request.sign(walletClient, accountAddress));
}

const executable = prepared.build(signatures);
const calls = executable.callRequests.map((request) => request.call);
```

The transaction-plan contract is shared by Midnight, Blue, MarketV1, and vault entities:

- `TransactionPlan.prepare(...)` resolves only the prerequisites for the already selected action.
- `PreparedTransactionPlan.signatureRequests` exposes signable requirements without signing them.
- `PreparedTransactionPlan.callRequests` exposes ordered viem-compatible prerequisite calls and,
  when previewable, the primary call.
- `PreparedTransactionPlan.build(...)` consumes collected signatures and returns an
  `ExecutableTransactionPlan` whose primary call is last.
- `TransactionPlan` preserves the primary action, request-options, prerequisite-request, and
  signature types through preparation and execution.

The markets app (`morpho-apps/apps/markets-app`) already implements the Midnight flows, but under its UI-specific `ActionFlow` abstraction:

- market/taker flows produce optional approval transactions, optional `Midnight.setIsAuthorized(...)`, and one final bundler transaction;
- maker/limit flows produce optional approval transactions, optional ratifier authorization, either one EOA root signature or one contract-wallet ratify-root transaction, then one mempool submit transaction;
- some user-level flows are multi-transaction (`supplyCollateral` before posting a borrow offer);
- repay / withdraw collateral already goes through `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)`, so the app sees one final bundled tx plus optional pre-execution approval / authorization items;
- none of the current markets app builders use `ActionFlow` `before` / `after` callbacks.

This TIB freezes the `TransactionPlan` output shape used to migrate those Midnight action builders
into `morpho-sdk`.

The plan model makes prerequisite ordering and semantic intent explicit without importing the app's
execution engine. Requirement descriptors remain either signable requests or typed transactions;
the prepared plan converts them into app-facing signature and call requests. Blue, MarketV1,
vault, and Midnight methods use narrower `TransactionPlan` generic arguments where their request
sets are known.

The compatibility constraint is intentionally two-sided. The SDK provides one typed plan lifecycle
across protocols, while the markets app keeps its signature-first `ActionFlow` UX and adapts the
plan's ordered requests through one boundary. The replacement of the former action-output API is a
major-version migration and is not described as source-compatible.

## Goals / Non-Goals

**Goals**

- Implement Midnight action flows in `morpho-sdk` from the markets app's working protocol implementation, so future integrators can reuse the same paths instead of rebuilding them app-side.
- Minimize the markets app migration by preserving its `ActionFlow` execution model, centralizing the adapter, and moving only protocol construction into the SDK.
- Keep the public SDK contract centered on `TransactionPlan`.
- Represent every currently implemented markets app flow without adding an SDK `ActionFlow` engine.
- Preserve the existing `Transaction` shape: `{ to, value, data, action }`.
- Preserve action-layer purity: actions stay synchronous, encode-only, and deep-frozen.
- Keep identical `TransactionPlan` lifecycle semantics across Blue, MarketV1, vault, and Midnight flows.
- Preserve narrow action and prerequisite request types through prepared and executable plans.
- Make requirement ordering explicit enough for multi-step Midnight flows.
- Keep Midnight bundle token pulls approval-only in the first implementation, matching the current markets app builders.
- Add SDK support for constructing fixed-rate offer chains, because the markets app currently needs this protocol utility to build one maker order from several time-bounded offers.
- Support both maker consent paths: EOA / EIP-7702 signature and contract-wallet ratify-root.

**Non-Goals**

- No `ActionFlowProvider`, `CallRequest`, `before`, or `after` clone in `morpho-sdk`.
- No generic DAG / dependency graph of steps.
- No `buildTxs()` as the primary interface.
- No validation requirement objects. SDK-owned validation throws typed errors from entity / requirement resolution; app-owned preflights such as quote previews and tick-spacing assertions may continue to throw the app's user-facing errors before the SDK call.
- No ERC2612 or Permit2 token-pull support for Midnight bundle calls in the first PR. This is a follow-up once a product flow needs it.
- No exposed `reduceOnly` input, unit-target take entry points, referral fee input, max-continuous-fee input, or take-lend collateral-withdrawal input in the first PR. The implementation hardcodes the current markets app defaults where the bundle ABI requires those fields.
- No SDK modeling for app-only forms, dialogs, or UI copy.

**Deferred follow-up PR**

The first implementation should be limited to surface area the current markets app can actually consume. A follow-up PR, stacked on the implementation PR, can add broader protocol coverage:

- ERC2612 and Permit2 SignatureTransfer support for Midnight bundle token pulls;
- unit-target take helpers in addition to the app's asset-targeted take flows with unit slippage guards;
- exposed `reduceOnly` for take flows;
- secondary bundle knobs such as referral fees, max continuous fee caps, and take-lend collateral withdrawals.

## Decision

Implement Midnight as regular `morpho-sdk` entity / action flows returning `TransactionPlan`.
Do not introduce a second SDK flow engine. The plan prepares an ordered review surface, leaves
wallet signing to the integrator, and builds one executable sequence after signatures are supplied.

```ts
const plan: TransactionPlan<
  MempoolSubmitOffersAction,
  undefined,
  ActionRequirement,
  MidnightActionSignatures
> = await midnight.makeLend(params);

const prepared = await plan.prepare();
// The app presents prepared.signatureRequests and prepared.callRequests.
const executable = prepared.build(collectedSignatures);
```

Semantics:

1. `prepare()` resolves the currently required prerequisite descriptors and returns semantic request metadata.
2. Already-satisfied approvals or authorizations are omitted.
3. `steps` and `callRequests` preserve relative execution order; the primary call is last when present.
4. Signature descriptors are exposed through `signatureRequests`; the SDK never prompts the wallet on its own.
5. A prerequisite call can be an approval, authorization, contract-wallet ratify-root, or mandatory prelude transaction.
6. `build(signatures)` validates and consumes the collected signature values before encoding the primary call.
7. `TRequest` remains available on prepared steps, and `TPrimaryAction` remains available on executable calls.

Midnight flows that need one final transaction remain single-call plans. Flows with mandatory prelude
transactions expose them as preparation-phase call requests, and the markets app forwards the maker
signature it already collects into `build(...)`.

## Description: markets app migration boundary

The markets app can keep its UI-specific `ActionFlow` execution engine. Because the SDK implementation is based on the app's current protocol builders, the migration target is a thin adapter from the proposed SDK `TransactionPlan` into the app's existing `signatureRequests` / `callRequests` shape, not a port of `ActionFlow` into the SDK.

The concrete SDK implementation in the stacked implementation PR moves protocol execution into `morpho-sdk`, while leaving rate-form and display decisions in the markets app:

- **SDK-owned protocol logic**: allowance reads, `Midnight.isAuthorized(...)` reads, ratifier selection, `Group` / `Tree` / `Payload` construction, fixed-rate offer-chain construction, root-signature payload generation, ratify-root calldata, Midnight API mempool validation, and `MidnightBundles` / `Midnight` calldata.
- **Integrator-owned app logic**: `ActionFlow` construction, step labels (`"Confirm"`, `"Approve loan token"`, `"Submit offer"`), form-specific copy, review-only display values (`offerExpiry`, date labels, token role labels), `onSuccess` routing, query invalidation, analytics, EIP-5792 batching behavior, `before` / `after` waits if the app ever adds them, user-facing error presentation, and final take constraints (`minUnits`, `maxUnits`) from the selected quote.
- **Retained preflight validation in the markets app**: existing quote/rate preview checks and tick-spacing assertions may stay app-side because they are used to produce immediate UX errors and review data. The SDK still performs the protocol checks it needs to build safe transactions and payloads.

The SDK may expose neutral typed metadata so an integrator can label steps, but it must not expose labels or UI state. For example, `MidnightAuthorizationAction.args.authorized` is SDK metadata; `"Authorize bundler"` is app copy.

### Protocol intent from Midnight source

The migration should keep the markets app on the bundle paths it already uses:

- `MidnightBundles.midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral(...)` for take-lend taker flows;
- `MidnightBundles.midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget(...)` for take-borrow taker flows with `loanAssets > 0`;
- direct `Midnight.supplyCollateral(...)` only for supply-only branches where there are no takeableOffers and the bundler would index `takeableOffers[0]`;
- `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)` for repay-only, withdraw-only, and repay+withdraw position flows.

These bundle signatures are checked against `morpho-org/bundles` `main` commit `4c71ac5ee7254b2a448b6054e003bd81e171d86e` (`src/midnight/IMidnightBundlesV1.sol` and `src/midnight/MidnightBundlesV1.sol`). The local `midnight-sdk` ABI in this stack may lag that deploy while the implementation PR updates generated ABI inputs.

This is not just a UI preference. `MidnightBundles` pulls tokens once from direct ERC-20 allowance in the first implementation, skips reverted stale offers while continuing through the provided take list, enforces exact asset targets with unit slippage guards, and performs the authorized `Midnight` calls on behalf of the taker. The app already shaped its flows around those semantics, so the SDK migration should preserve them to minimize app changes.

Maker flows remain mempool flows, not bundle flows:

- the SDK normalizes the provided offer set into content-addressed groups and a Merkle tree;
- the maker authorizes the chosen ratifier on `Midnight`;
- EOA / EIP-7702 makers sign the tree root for `EcrecoverRatifier`;
- contract-wallet makers send `SetterRatifier.setIsRootRatified(maker, root, true)`;
- the final transaction submits the encoded `Payload` to the mempool contract.

### App-side adapter

The markets app can adapt SDK output once and reuse the adapter across every screen. The adapter description here is intentionally illustrative, not an implementation-ready patch. The implementation PR can choose different function names, labels, and control flow as long as the boundary stays the same:

- SDK transaction plans expose typed signature and call requests plus a final executable builder;
- the app wallet layer turns SDK signature requirements into signature prompts;
- the app turns SDK transaction requirements into ordered call requests;
- collected maker signatures are passed to `PreparedTransactionPlan.build(...)`;
- labels, token roles, display copy, and success behavior stay in the app.

The adapter preserves the current markets app UX where maker signature prompts are collected before transactions are sent. EOA maker offer-tree signatures do not depend on prior Midnight authorization or collateral-supply transactions, so grouping signatures first is protocol-compatible for the flows covered by this TIB. If a future Midnight flow introduces a signature that depends on a mined prerequisite transaction, the app adapter should gain an explicit dependency concept then.

The label mapper stays in the markets app. It can map requirement types such as offer-tree signatures, ERC20 approvals, Midnight authorizations, ratify-root transactions, and collateral-supply transactions to screen-specific copy. This remains app-side because it depends on display concepts (`loan token`, `collateral token`, token symbols, and screen-specific final labels) that do not belong in `morpho-sdk`.

If a markets app screen needs protocol metadata for follow-up behavior, the Midnight method can return a method-specific subtype that structurally extends `TransactionPlan` with readonly metadata. The concrete maker flows return protocol fields such as `group`, `root`, and `ratifierType`; review-only display state such as `offerExpiry` stays in the markets app because the app owns display preparation while the SDK owns offer-set normalization, tree construction, and submit payload construction. That does not change the core `TransactionPlan` interface, and the app decides how to display the metadata.

### Example 1: take-lend taker flow

This migration sketch is illustrative. It describes ownership boundaries, not a required code patch.

The app keeps quote selection, loading state, form guards, rate display math, and the rate-to-`minUnits` conversion. The app still passes the router quote it selected and owns the final label and success behavior.

What leaves the app:

- allowance read for the loan token;
- `buildApprovalCallRequestIfNeeded(...)` invocation for this flow; the SDK now resolves the loan-token pull as a direct approval transaction to `MidnightBundles`;
- `buildAuthorizeBundlerCallRequestIfNeeded(...)` invocation for this flow;
- take construction (`buildTakesFromOffers(...)` in the markets app) and `MidnightBundles` calldata encoding.

What stays in the app:

- quote selection and loading state that produced `offers`;
- rate and price display math, because the concrete SDK API receives the final unit constraint and does not own app display math;
- form guards if the app wants immediate local UX errors;
- labels (`"Take lend offers"`, `"Approve loan token"`, `"Authorize bundler"`);
- `ActionFlow` wrapping and `onSuccess`.

The resulting SDK action should expose approval and Midnight authorization requirements when needed, then build the final `MidnightBundles` take-lend transaction. The exact helper names and call shapes are intentionally left to the implementation PR.

The buy bundle has collateral-withdrawal, referral, max-continuous-fee, and `reduceOnly` slots that the current lend-market screen leaves at defaults. The first SDK implementation should hardcode the current app defaults instead of exposing those fields as public parameters. A follow-up PR can expose them when a product flow needs secondary-market exits or advanced bundle policy.

Complexity for the markets app: **low**. This is mostly a mechanical builder replacement. The app keeps the existing rate-to-units lines, removes roughly the allowance / authorization / approval / take-encoding / final-call half of the builder, and updates tests to assert adapter inputs rather than raw app-built calldata.

### Example 2: supply-collateral-make-borrow

This migration sketch is illustrative. It describes the intended split of responsibilities, not an implementation-ready branch structure.

This is the hardest current migration shape because it combines a mandatory collateral prelude transaction with maker consent. The app should keep form-level validation, rate / tick / expiry preparation, review display state, ratifier selection, tick-spacing preflight, labels, and the `ActionFlow` wrapper. The SDK should accept only a tree-like offer set for maker flows, then own collateral approval requirements, collateral supply transaction construction, offer-set normalization, tree validation, mempool validation, ratifier requirements, root signature / ratify-root requirements, payload construction, and the final submit transaction.

This case intentionally stays approval-based for collateral and reserve transfers. The mandatory `MidnightSupplyCollateralAction` and maker reserve approvals target the core `Midnight` contract / mempool path, not a `MidnightBundles` function that accepts `TokenPermit`. Introducing token permits here would require a different protocol entry point rather than an app-only SDK migration.

`MidnightApi.validateMempoolPayload(...)` keeps the API-helper behavior: it returns the raw validation result as `{ valid, issues }` so low-level callers can decide how to surface policy failures. `Tree.mempoolValidate(...)` / `TreeUtils.mempoolValidate(...)` are the SDK-owned safety boundary for action flows, so they must branch on `valid` and throw a typed `MidnightMempoolValidationError` carrying the returned `issues` before the entity exposes `midnightOfferRootSignature`, ratify-root requirements, or submit calldata.

`getOffersData(...)` remains side-agnostic because it prepares any valid tree-like offer set. The low-level take transaction builders enforce take-side semantics: `takeLend` requires maker-sell takeable offers, and `takeBorrow` / `supplyCollateralTakeBorrow` require maker-buy takeable offers. The named maker entity flows enforce maker-side semantics: `makeLend` requires maker-buy offers, and `makeBorrow` / `supplyCollateralMakeBorrow` require maker-sell offers.

Collateral-only handling must be explicit. Blue's combined supply-collateral-and-borrow flow rejects a zero borrow amount, and callers use direct `supplyCollateral` for collateral-only behavior. Midnight should follow the same principle unless the implementation PR deliberately chooses a different product contract. If the markets screen keeps a collateral-only branch, that branch should route directly to `supplyCollateral` or reject the combined maker flow before offer-tree preparation. It should not prepare an empty offer tree or call maker-offer helpers with no offers.

What leaves the app:

- collateral allowance read and collateral approval construction;
- collateral supply calldata construction;
- `buildMakeOfferRequests(...)`, `Tree`, `Payload`, and root payload state;
- ratifier authorization read / calldata;
- EOA root-signature payload mutation and Setter ratify-root calldata.

What stays in the app:

- form-level guards and user-facing copy (`"Rate is required"`, empty amount checks) unless the app chooses to rely entirely on SDK typed errors;
- market loading, final review display, ratifier selection, and tick-spacing preflight;
- `ActionFlow` execution through the shared adapter;
- final labels and requirement labels;
- no token-permit UI branch for this collateral prelude; the SDK returns an approval transaction because the core Midnight call used by this migration has no `TokenPermit` argument;
- success routing with the created group when a maker offer exists, plus local review display of `offerExpiry`.

Complexity for the markets app: **medium**. The code removal is still large, but the remaining app code is the code it already owns: form validation, rate / tick / expiry preparation, tree-like offer-set input preparation, labels, and `offerExpiry` display. The SDK action should return enough metadata for the app to route `onSuccess` with the created group when a maker offer exists. No markets app flow requires `ActionFlow.before`, `ActionFlow.after`, a DAG, or `buildTxs()`.

### Example 3: repay / withdraw through MidnightBundles

The current app already minimizes transactions here by using `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)` for repay-only, withdraw-only, and combined flows. The SDK migration should keep that shape.

This migration sketch is illustrative. It describes the desired shape, not a literal app patch.

The app keeps input validation, final label selection, `ActionFlow` wrapping, and success behavior. The SDK should own the loan-token allowance read, approval requirement selection, bundler authorization requirement, single-collateral withdrawal struct construction, and final `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)` calldata encoding.

The SDK requirements should include a loan-token pull requirement only when repay assets are positive, plus a MidnightBundles authorization requirement when needed. The final transaction remains one bundle transaction for repay-only, withdraw-only, and combined repay-withdraw flows.

The current markets app parameter is named `repayUnits`, and its implementation relies on the current `referralFeePct === 0` identity where the bundle `assets` argument equals the units passed to `Midnight.repay`. The SDK API should still be assets-denominated because the bundle ABI is assets-denominated. If referral fees are ever exposed as non-zero inputs, the caller must convert explicitly instead of relying on the current units-to-assets identity; the latest bundle source documents full repayment of debt `D` as `assets = floor(D * WAD / (WAD - referralFeePct))`.

What leaves the app:

- loan-token allowance read;
- bundler authorization read;
- loan-token approval construction; the SDK now resolves the repay token pull as an approval transaction to `MidnightBundles`;
- `collateralWithdrawals` struct construction;
- `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)` calldata encoding.

What stays in the app:

- `validateInputs(...)` or equivalent form-level guards;
- the final label switch between `"Repay"`, `"Withdraw collateral"`, and `"Repay and withdraw collateral"`;
- `ActionFlow` wrapping and `onSuccess`.

Complexity for the markets app: **low**. The important migration detail is that this does **not** become a two-step direct `repay` then `withdrawCollateral` flow. The SDK keeps the same final bundle transaction the app uses today, so app risk is mostly around label/test updates and adapter reuse.

## Type changes

### Requirement aliases

Add explicit aliases for ordered call requirements and Midnight maker signatures, without changing the shape of existing `Requirement` objects.

```ts
export type SignatureRequirementAction =
  | PermitAction
  | Permit2Action
  | MidnightOfferRootSignatureAction;

export type RequirementSignatureArgs =
  | PermitArgs
  | Permit2Args
  | MidnightOfferRootSignatureArgs;

export interface Requirement<
  TAction extends SignatureRequirementAction = PermitAction | Permit2Action,
  TArgs extends RequirementSignatureArgs = PermitArgs | Permit2Args,
> {
  readonly sign: (
    client: WalletClient,
    userAddress: Address,
  ) => Promise<RequirementSignature<TAction, TArgs>>;
  readonly action: TAction;
}

export interface RequirementSignature<
  TAction extends SignatureRequirementAction = PermitAction | Permit2Action,
  TArgs extends RequirementSignatureArgs = PermitArgs | Permit2Args,
> {
  readonly args: TArgs;
  readonly action: TAction;
}

export type MidnightOfferRootRequirement = Requirement<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

export type MidnightOfferRootSignature = RequirementSignature<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

export type BlueTokenSignatureRequirement =
  | Requirement<PermitAction, PermitArgs>
  | Requirement<Permit2Action, Permit2Args>;

export type TokenSignatureRequirement = BlueTokenSignatureRequirement;

export type BlueTokenRequirementSignature =
  | RequirementSignature<PermitAction, PermitArgs>
  | RequirementSignature<Permit2Action, Permit2Args>;

export type TokenRequirementSignature = BlueTokenRequirementSignature;

export type AnyRequirementSignature =
  | TokenRequirementSignature
  | MidnightOfferRootSignature;

export type SignatureRequirement =
  | TokenSignatureRequirement
  | MidnightOfferRootRequirement;
```

Compatibility:

- Existing `permit` and Blue `permit2` requirement objects stay structurally identical.
- Existing consumers that check `"sign" in requirement` still work.
- New consumers can discriminate on `requirement.action.type`.
- Midnight maker flows can return `MidnightOfferRootRequirement`; taker and repay flows in the first implementation return only call requirements.
- Midnight bundle token signatures are intentionally not represented in the first implementation. A follow-up PR should add a distinct requirement type for Permit2 SignatureTransfer rather than reusing Blue's `action.type === "permit2"`, because Blue signs `PermitSingle` and Midnight Bundles consume `permitTransferFrom`.

### Midnight bundle permit metadata

Keep the Midnight bundle permit shape in `morpho-sdk` because it is introduced by the SDK's `MidnightBundles` action encoders:

```ts
export enum PermitKind {
  None = 0,
  ERC2612 = 1,
  Permit2 = 2,
}

export type MidnightTokenPermit =
  | {
      readonly kind: PermitKind.None;
      readonly data: "0x";
    }
  | {
      readonly kind: PermitKind.ERC2612 | PermitKind.Permit2;
      readonly data: Hex;
    };
```

This is action-encoding metadata, not UI state. The first implementation only encodes `PermitKind.None`; the non-`None` variants are ABI names reserved for the deferred token-signature PR.

### Call requirements

Add a named call-requirement union. Existing raw `Transaction<...>` requirement values stay valid.

```ts
export type CallRequirementAction =
  | ERC20ApprovalAction
  | MorphoAuthorizationAction
  | MidnightAuthorizationAction
  | SetterRatifierRatifyRootAction
  | MidnightSupplyCollateralAction;

export type CallRequirement = Readonly<Transaction<CallRequirementAction>>;

export type ActionRequirement = CallRequirement | SignatureRequirement;
```

`MidnightSupplyCollateralAction` is included because it can be a mandatory prelude transaction for a currently implemented app flow:

- `supplyCollateralMakeBorrow`: supply collateral first, then submit the maker borrow offer.

Repay / withdraw collateral does **not** need a mandatory repay prelude in the app-compatible migration, because it remains one final `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)` transaction.

### New Midnight requirement actions

Use contract-specific action names for SDK metadata. The calldata targets `Midnight`, `MidnightBundles`, `EcrecoverRatifier`, `SetterRatifier`, and the mempool contract.

```ts
export interface MidnightAuthorizationAction
  extends BaseAction<
    "midnightAuthorization",
    {
      authorized: Address;
      isAuthorized: boolean;
      onBehalf: Address;
    }
  > {}

export interface SetterRatifierRatifyRootAction
  extends BaseAction<
    "setterRatifierRatifyRoot",
    {
      maker: Address;
      root: Hex;
      isRootRatified: boolean;
    }
  > {}

export interface MidnightOfferRootSignatureAction
  extends BaseAction<
    "midnightOfferRootSignature",
    {
      root: Hex;
      ratifier: Address;
      offers: number;
    }
  > {}

export interface MidnightOfferRootSignatureArgs {
  readonly owner: Address;
  readonly root: Hex;
  readonly signature: Hex;
  readonly payload: Hex;
}
```

`MidnightOfferRootSignatureArgs.payload` is the encoded mempool payload produced after the root signature is collected by the SDK requirement. `PreparedTransactionPlan.build(signatures)` selects the `midnightOfferRootSignature` result from the collected signature list, validates that its owner, root, ratifier, and offer count match the prepared flow, then uses its payload as the final submit calldata.

### New final action metadata

Add action union members only; do not change `Transaction`.

```ts
export type MidnightOfferSetInput =
  | Offer
  | readonly Offer[]
  | Group
  | readonly Group[]
  | Tree;

export interface MidnightTakeLendAction
  extends BaseAction<
    "midnightTakeLend",
    {
      market: Hex;
      assets: bigint;
      minUnits: bigint;
      taker: Address;
      takeableOffers: number;
      deadline: bigint;
    }
  > {}

export interface MidnightTakeBorrowAction
  extends BaseAction<
    "midnightTakeBorrow",
    {
      market: Hex;
      loanAssets: bigint;
      maxUnits: bigint;
      taker: Address;
      receiver: Address;
      collateralSupplies: number;
      takeableOffers: number;
      deadline: bigint;
    }
  > {}

export interface MidnightSupplyCollateralAction
  extends BaseAction<
    "midnightSupplyCollateral",
    {
      market: Hex;
      collateralIndex: bigint;
      assets: bigint;
      onBehalf: Address;
    }
  > {}

export interface MempoolSubmitOffersAction
  extends BaseAction<
    "mempoolSubmitOffers",
    {
      groups: readonly Hex[];
      root: Hex;
      maker: Address;
      ratifier: Address;
      ratifierType: "ecrecover" | "setter";
      offers: number;
    }
  > {}

export interface MidnightRedeemAction
  extends BaseAction<
    "midnightRedeem",
    {
      market: Hex;
      units: bigint;
      onBehalf: Address;
      receiver: Address;
    }
  > {}

export interface MidnightRepayWithdrawCollateralAction
  extends BaseAction<
    "midnightRepayWithdrawCollateral",
    {
      market: Hex;
      repayAssets: bigint;
      collateralWithdrawals: number;
      onBehalf: Address;
      collateralReceiver: Address;
      deadline: bigint;
    }
  > {}

export interface MidnightCancelOfferAction
  extends BaseAction<
    "midnightCancelOffer",
    {
      group: Hex;
      amount: bigint;
      onBehalf: Address;
    }
  > {}
```

Maker entity methods accept a tree-like `MidnightOfferSetInput` only. The caller may pass a single offer, an array of offers, pre-grouped offers, or a tree; it does not pass derived `groups`, `root`, compression, signature payload, or mempool calldata. The entity normalizes the offer set, constructs the groups and tree, derives the root and signature input, validates the router / mempool payload, and passes only prepared encode inputs into the final action builder. `MempoolSubmitOffersAction` may expose derived metadata such as `groups`, `root`, and `offers` for adapters and `onSuccess` routing, but those fields are not caller inputs.

Building a tree-like offer set remains caller-owned, but the Midnight SDK should expose the fixed-rate offer-chain utility the markets app currently owns. The utility returns `{ tick, startTimestamp, expiryTimestamp }` legs from a target APR, side, tick spacing, maturity, and requested window. The app still turns those legs into `Offer.create(...)` inputs and review display state.

Extend `TransactionAction` with these action interfaces and the Midnight requirement action interfaces above (`MidnightAuthorizationAction`, `SetterRatifierRatifyRootAction`).

## Minimal helper changes

### Midnight approval requirement helper

Do not reuse `getGeneralAdapterRequirements(...)` for Midnight, because it hardcodes `bundler3.generalAdapter1` as spender and its signature paths emit Bundler3 actions. The first Midnight transaction-plan implementation mirrors the current markets app and returns classic ERC-20 approval transactions only for token pulls. The spender is explicit because current flows need both `Midnight` (maker reserves and direct collateral supply) and `MidnightBundles` (taker and repay/withdraw bundle calls).

```ts
async function getMidnightApprovalRequirements({
  viemClient,
  chainId,
  token,
  owner,
  spender,
  amount,
}: {
  readonly viemClient: Client;
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
}): Promise<readonly Readonly<Transaction<ERC20ApprovalAction>>[]>
```

The helper follows the current markets app policy:

- if `amount === 0n`, return `[]`;
- read `allowance(owner, spender)`;
- return `[]` when the direct allowance already covers `amount`;
- otherwise return the approval transaction requirements for `token.approve(spender, amount)`.

Approval transaction requirements can be a reset-then-approve pair for reset-requiring tokens. The reset requirement for amount `0n` must precede the positive approval requirement, which is one concrete reason returned transaction requirements are ordered rather than just a set.

Bundle action encoders still pass a `TokenPermit` struct because the ABI requires it, but the first implementation always uses:

```ts
{ kind: PermitKind.None, data: "0x" }
```

The deferred token-signature PR can add ERC2612 and Permit2 SignatureTransfer support. That PR should keep the bundle spender explicit, validate the signed spender and amount, and not reuse Blue's `permit2` requirement shape because Midnight's Permit2 branch signs SignatureTransfer, not PermitSingle.

Midnight callers still supply the spender explicitly:

- `MidnightBundles` for take-lend, take-borrow with `loanAssets > 0`, and repay / withdraw bundle flows;
- `Midnight` for direct `supplyCollateral` branches and maker-offer reserve approvals (make-lend loan token approvals and supply-collateral-make-borrow collateral approvals). These direct / mempool paths do not have a `TokenPermit` argument in this migration and remain approval-transaction based.

Never route a bundle token pull through the core `Midnight` allowance. Bundle flows should use `MidnightBundles` as spender so they do not churn the core `Midnight` allowance that open maker offers use for reserved amounts.

### Midnight authorization helper

Add a helper that reads `Midnight.isAuthorized(owner, authorized)` and returns one tx only when missing.

```ts
async function getMidnightAuthorizationRequirement({
  viemClient,
  chainId,
  owner,
  authorized,
}: {
  viemClient: Client;
  chainId: number;
  owner: Address;
  authorized: Address;
}): Promise<Readonly<Transaction<MidnightAuthorizationAction>> | undefined>
```

Returned tx:

```ts
Midnight.setIsAuthorized(authorized, true, owner)
```

### Ratifier requirements

The implementation keeps maker consent in the `MorphoMidnight` entity instead of exporting one large helper. This keeps the public helper surface comparable to Blue and keeps tree / payload construction at the entity boundary:

```ts
async getOffersData(offerSet: MidnightOfferSetInput): Promise<OffersData>;

private async getRatifierRequirements({
  offersData,
}): Promise<readonly ActionRequirement[]>;

private buildSubmitOffersTx({
  offersData,
  signatures,
}): Readonly<Transaction<MempoolSubmitOffersAction>>;
```

EOA / EIP-7702 maker:

- optional `MidnightAuthorizationAction` for `EcrecoverRatifier`;
- one private `makeOfferRootRequirement(...)` result with `action.type === "midnightOfferRootSignature"`;
- `Requirement.sign(...)` calls the same typed-data root-signing path as the markets app and returns `{ action, args: { root, signature, payload } }`;
- `PreparedTransactionPlan.build(signatures)` selects the `midnightOfferRootSignature` result, validates the owner / root / ratifier / offer-count metadata against the prepared flow, and uses `signature.args.payload` as mempool calldata.

Contract-wallet maker:

- optional `MidnightAuthorizationAction` for `SetterRatifier`;
- one `SetterRatifierRatifyRootAction` transaction requirement from `getSetterRatifierRatifyRootRequirement(...)`, calling `SetterRatifier.setIsRootRatified(maker, root, true)` only when missing;
- `PreparedTransactionPlan.build()` uses precomputed `Payload.encode(SetterRatifierUtils.ratify({ tree }))` as mempool calldata.

## Layering

The migration must preserve the monorepo's `Client → Entity → Action` split.

- **Entity layer** performs SDK-owned reads and off-chain checks: allowances, `isAuthorized`, ratifier selection, offer-set normalization, tree / payload construction, Midnight API mempool validation, credit / withdrawable reads, and group generation. App-owned preflights such as quote previews, rate math, and tick-spacing assertions may run before the entity call.
- **Action layer** is synchronous and encode-only: it receives already-computed amounts, prepared calldata payloads, roots, and addresses from the entity boundary, then returns deep-frozen `Transaction` values.
- **Helpers** are pure unless explicitly placed in the requirement-resolution boundary.

Important boundary calls:

- group ids are content-addressed, not random: the entity normalizes the caller-provided offer set with the Midnight SDK, then uses `Group.create(offers)` / `GroupUtils.hash` so `group`, roots, payloads, cancel references, and `onSuccess` metadata all agree with the shared Midnight helpers;
- offer and tree construction derives the market `chainId` and `midnight` address from the chain-scoped SDK configuration / market data, never from router SDK defaults such as `DEFAULT_CHAIN_ID` or `DEFAULT_MIDNIGHT`; these fields are part of the offer-id preimage and must follow the selected chain;
- signing is inside `Requirement.sign`, not action-level;
- router validation through `Tree.mempoolValidate(...)` throws before a signature prompt is exposed; lower-level `MidnightApi` helpers may still return `{ valid, issues }` for raw API consumers;
- no raw `Error`; every new failure mode gets a typed error in the package that owns the failing boundary.

Bundle action builders encode ABI policy knobs with the current markets app defaults:

- `reduceOnly` is encoded as `false`;
- `deadline` is still a required caller input, so the app can keep its current explicit max-deadline behavior or pass a bounded deadline later;
- `maxContinuousFee` is encoded as `maxUint256` for buy / sell bundle paths that expose it;
- referral parameters are encoded as `0n` and `zeroAddress`;
- take-lend collateral withdrawals are encoded as an empty list and a zero collateral receiver.

These fields should not be first-iteration public inputs. Exposing them before the markets app needs them creates untested action-flow surface.

## Flow mapping

### Take lend

`prepare()` exposes these prerequisite requests:

1. optional loan-token approval requirement for `MidnightBundles`;
2. optional `MidnightAuthorizationAction` for `Midnight.setIsAuthorized(MidnightBundles, true, taker)`.

`PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightTakeLendAction`:

```ts
MidnightBundles.midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral(
  assets,
  minUnits,
  taker,
  false, // reduceOnly
  { kind: PermitKind.None, data: "0x" },
  takeableOffers,
  [],
  zeroAddress,
  0n,
  zeroAddress,
  maxUint256,
  deadline,
)
```

No offer-root or token signature is involved in the first implementation.

### Take borrow with `loanAssets > 0`

`prepare()` exposes these prerequisite requests:

1. optional collateral-token approval requirement for `MidnightBundles` when new collateral is supplied;
2. optional `MidnightAuthorizationAction` for `Midnight.setIsAuthorized(MidnightBundles, true, taker)`.

`PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightTakeBorrowAction`:

```ts
MidnightBundles.midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget(
  loanAssets,
  maxUnits,
  taker,
  false, // reduceOnly
  taker,
  collateralSuppliesWithNoPermit,
  takeableOffers,
  0n,
  zeroAddress,
  maxUint256,
  deadline,
)
```

No offer-root or token signature is involved in the first implementation.

### Take borrow supply-only branch

`prepare()` exposes an optional collateral approval to `Midnight`.

`PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightSupplyCollateralAction`:

```ts
Midnight.supplyCollateral(market, 0n, collateralAssets, onBehalf)
```

This branch remains approval-based because direct `Midnight.supplyCollateral(...)` has no `TokenPermit` argument.

### Make lend

`prepare()` exposes these prerequisite requests:

EOA / EIP-7702:

1. optional loan-token approval to `Midnight` for `reservedLoanAssets + loanAssets`;
2. optional `MidnightAuthorizationAction` for the chosen ratifier;
3. one `midnightOfferRootSignature` requirement.

Contract wallet:

1. optional loan-token approval to `Midnight` for `reservedLoanAssets + loanAssets`;
2. optional `MidnightAuthorizationAction` for the chosen ratifier;
3. one `setterRatifierRatifyRoot` transaction requirement.

`PreparedTransactionPlan.build(signatures)` produces an executable plan whose primary call carries `MempoolSubmitOffersAction` and targets the mempool contract.

The make-lend method accepts a tree-like offer set. It must accept multi-market offer legs in the same tree when the markets share one loan token, matching the markets app's multi-limit-order / OCA basket flow. For those baskets, offers in the same group share one `consumed[maker][group]` counter on Midnight, so the new group contributes one reserve amount: the maximum leg reserve, with equal leg reserves expected for the current OCA shape. It is not the sum of every offer leg. The SDK throws a typed error when the tree would exceed the Midnight tree-size limit.

The Midnight SDK also exposes a fixed-rate offer-chain utility consumed before this entity call. Given a target APR, side, tick spacing, maturity, and `[start, end]` window, it returns time-bounded legs that the app maps to `Offer.create(...)`. This replaces the app-owned protocol math without making the entity layer own form state or display labels.

Maker reserve approvals stay transaction approvals in this migration. The final mempool submit payload does not consume ERC2612 or Permit2 token signatures, so supporting permits here would require a separate protocol entry point rather than a markets-app-only SDK migration.

`reservedLoanAssets` and `reservedCollateralAssets` are cross-group protocol reserve amounts, not UI display values. All resting groups for the maker share the same direct `Midnight` allowance, so the approval target is the existing reserved amount across open groups plus the new group's reserve amount. The entity must derive existing reserved amounts from maker reserve state, including each open group's current consumed amount when that data is available from the API, or accept them through an explicit data object when the caller already fetched that state. They are added to the new group reserve amount before approval so a replacement approval does not under-cover already-open offers.

### Borrow limit collateral-only branch

`prepare()` exposes an optional collateral approval to `Midnight`.

`PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightSupplyCollateralAction`.

This branch remains approval-based because direct `Midnight.supplyCollateral(...)` has no `TokenPermit` argument.

### Make borrow loan-only branch

`prepare()` exposes these prerequisite requests:

EOA / EIP-7702:

1. optional `MidnightAuthorizationAction` for the chosen ratifier;
2. one `midnightOfferRootSignature` requirement.

Contract wallet:

1. optional `MidnightAuthorizationAction` for the chosen ratifier;
2. one `setterRatifierRatifyRoot` transaction requirement.

`PreparedTransactionPlan.build(signatures)` produces an executable plan whose primary call carries `MempoolSubmitOffersAction` and targets the mempool contract.

### Borrow limit collateral + loan branch

`prepare()` exposes these prerequisite requests:

EOA / EIP-7702:

1. optional collateral approval to `Midnight`;
2. **mandatory** `MidnightSupplyCollateralAction` transaction requirement;
3. optional `MidnightAuthorizationAction` for the chosen ratifier;
4. one `midnightOfferRootSignature` requirement.

Contract wallet:

1. optional collateral approval to `Midnight`;
2. **mandatory** `MidnightSupplyCollateralAction` transaction requirement;
3. optional `MidnightAuthorizationAction` for the chosen ratifier;
4. one `setterRatifierRatifyRoot` transaction requirement.

`PreparedTransactionPlan.build(signatures)` produces an executable plan containing only the final `MempoolSubmitOffersAction` primary call.

This branch is the reason `prepare()` must be allowed to return mandatory prelude transactions, not only optional prerequisites.

### Redeem at maturity

Pre-read / validation happens before returning the transaction plan:

- `updatePositionView(...)` gives accrued `creditUnits` and remaining `pendingFeeUnits`;
- compute `redeemUnits = creditUnits - pendingFeeUnits`, using the `midnight-sdk` `positionData.faceValue` getter when the SDK consumer provides an `AccrualPosition`;
- resolve `requestedUnits = params.units ?? redeemUnits`;
- `requestedUnits > 0`;
- `requestedUnits <= creditUnits`;
- `positionData.withdrawable >= requestedUnits`, where `withdrawable` is the protocol-capacity helper `min(positionData.credit, positionData.market.withdrawable)` using the hydrated market snapshot embedded in the position.

`positionData` is the sole state input for this flow, avoiding a second caller-provided market snapshot with potentially inconsistent liquidity. Callers that coordinate several reads fetch the block outside the entity, pass its `blockNumber` to `getPositionData(...)`, and accrue the returned position with the same block timestamp before constructing the redeem output.

Do not default this flow to raw, unaccrued `positionData.credit`. `Midnight.withdraw(...)` calls `_updatePosition(...)` before burning credit, so bad-debt loss and accrued continuous fees can reduce the position's credit before the withdraw amount is applied. The default SDK flow should therefore use the accrued net face value. Integrators that intentionally want a different partial withdraw amount can still pass explicit `units`.

The latest `morpho-org/midnight` implementation does not cap withdrawals at net face value. After `_updatePosition(...)`, `Midnight.withdraw(...)` decreases `pendingFee` pro rata and burns `units` from the updated `credit`; the protocol-compatible cap for explicit `units` is therefore the lower of accrued `creditUnits` and market `withdrawable` liquidity. This intentionally keeps the SDK default at net face value while still allowing integrators to request another protocol-valid partial amount explicitly.

`prepare()` exposes no prerequisite requests.

`PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightRedeemAction`:

```ts
Midnight.withdraw(market, redeemUnits, onBehalf, receiver)
```

### Repay / withdraw collateral

All three app branches keep the current bundled execution path.

Repay only:

- `prepare()` exposes an optional loan-token approval requirement for `MidnightBundles`, then optional `MidnightAuthorizationAction` for `MidnightBundles`;
- `PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightRepayWithdrawCollateralAction`.

Withdraw-only:

- `prepare()` exposes an optional `MidnightAuthorizationAction` for `MidnightBundles`;
- `PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightRepayWithdrawCollateralAction` with `repayAssets === 0n`.

Repay + withdraw:

- `prepare()` exposes an optional loan-token approval requirement for `MidnightBundles`, then optional `MidnightAuthorizationAction` for `MidnightBundles`;
- `PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightRepayWithdrawCollateralAction`.

```ts
MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(
  market,
  repayAssets,
  onBehalf,
  { kind: PermitKind.None, data: "0x" },
  collateralWithdrawals,
  receiver,
  0n,
  zeroAddress,
  deadline,
)
```

### Cancel offer

`prepare()` exposes no prerequisite requests.

`PreparedTransactionPlan.build()` produces an executable plan whose primary call carries `MidnightCancelOfferAction`:

```ts
Midnight.setConsumed(group, maxUint256, onBehalf)
```

## Compatibility checklist

This implementation represents the current markets app flows, with the documented redeem default divergence, because:

- every prerequisite transaction maps to a preparation-phase `callRequest`, and every primary transaction maps to the primary `callRequest` returned by `PreparedTransactionPlan.build()`;
- every maker signature requirement maps to a `signatureRequest` whose `sign(...)` delegates to `Requirement.sign(...)`;
- the `Transaction` wire shape is unchanged;
- no app builder currently needs `before` / `after` callback semantics;
- bundle token pulls keep the approval-transaction behavior the markets app uses today;
- direct core Midnight paths still return approval transactions because they do not consume `TokenPermit`;
- EOA maker flow still needs exactly one offer-root signature, selected from the collected signature list;
- contract-wallet maker flow needs zero signatures and one ratify-root tx;
- EOA maker signatures can be surfaced before transaction requirements, preserving the markets app's current signature-before-calls UX;
- repay / withdraw keeps the app's existing single final `MidnightBundles.midnightBundlesV1RepayAndWithdrawCollateral(...)` transaction;
- all multi-tx app flows can be represented by ordered requirements plus final `PreparedTransactionPlan.build()`.
- redeem defaults to net face value, while explicit `units` can still reproduce the current app's post-update credit behavior as long as the amount does not exceed accrued credit or market withdrawable liquidity.

The only semantic expansion is documented: returned transaction requirements are **ordered pre-execution items** and can include mandatory prelude transactions. Consumers must execute every returned item in order unless they intentionally replace it with an equivalent already-satisfied state.

## Considered alternatives

### Alternative 1: Add `buildTxs()`

Return the whole transaction sequence from the transaction plan.

**Why rejected:** it would add a second way to expose the ordered call sequence already represented by prepared and executable plans. The current app flows only need one final transaction plus ordered pre-execution items.

### Alternative 2: Port the app `ActionFlow` abstraction

Copy `signatureRequests`, `callRequests`, `before`, and `after` into the SDK.

**Why rejected:** this imports UI execution-engine concepts into a pure SDK package. The current markets app builders define no `before` / `after` requirements, so the extra machinery buys nothing for the initial migration.

### Alternative 3: Keep preparation-phase calls limited to approvals / authorizations

Expose only optional prerequisites and force callers to build prelude txs manually.

**Why rejected:** supply-collateral-make-borrow cannot be expressed safely if the caller owns the prelude because the collateral supply must execute before the mempool submit transaction. Integrators would need bespoke sequencing outside the SDK, which defeats the migration goal.

### Alternative 4: Include Midnight Permit / Permit2 immediately

Add ERC2612 and Permit2 SignatureTransfer support to the first action-flow implementation because the bundle ABI already has `TokenPermit` slots.

**Why rejected for the first PR:** the current markets app builders use direct ERC-20 approvals and `PermitKind.None`. Adding token signatures would expand the first SDK surface beyond what will be migrated and tested by the app. The follow-up PR can add this once there is a product path or dedicated test plan for it.

## Implementation phases

- **Phase 1 — Shared transaction-plan types / interfaces.** Add `TransactionPlan`, `PreparedTransactionPlan`, and `ExecutableTransactionPlan`; preserve the primary action and prerequisite-request types across every lifecycle stage; and add the Midnight action interfaces and type guards. The markets app keeps its existing `ActionFlow` signature / call collection model through one adapter, while Blue, MarketV1, vault, and Midnight methods expose narrow plan types.
- **Phase 2 — Requirement helpers.** Reuse `getRequirementsApproval` with an explicit spender rather than `getGeneralAdapterRequirements`; add Midnight approval, authorization, and ratifier helpers.
- **Phase 3 — Pure action encoders.** Add `src/actions/midnight/*` encoders for final txs and prelude txs. Every encoder returns a deep-frozen `Transaction` and has colocated unit tests.
- **Phase 4 — Entity methods.** Add `MorphoMidnight` methods that perform RPC/off-chain reads, router validation, amount math, group generation, and return `TransactionPlan`.
- **Phase 5 — Integration tests.** Fork-test each flow shape: no requirement, approval reset, missing authorization, EOA root signature, contract-wallet ratify-root, mandatory prelude txs, and cancel offer.
- **Phase 6 — Docs / changeset.** Update package `AGENTS.md`, generated docs/JSDoc, README snippets, and add the major changeset required by the action-output-to-transaction-plan API migration.

## Security

- **Wallet-decodable offer-tree signing.** The SDK must build the offer tree locally from the SDK input and validate the router response before exposing `midnightOfferRootSignature`. The wallet signs EIP-712 `OfferTree` typed data whose leaves are visible to the user, and the SDK verifies that the signed tree hashes to the root used in ratifier data.
- **No signing inside actions.** `Requirement.sign(...)` is the only signing boundary and takes a `WalletClient` from the integrator.
- **No hidden prelude txs.** Mandatory prelude transactions are visible as typed preparation-phase `callRequests` on the prepared plan.
- **Authorization target is explicit.** `MidnightAuthorizationAction.args.authorized` is either `MidnightBundles`, `EcrecoverRatifier`, or `SetterRatifier`; never inferred by a consumer.
- **Approval target is explicit.** Midnight approval helper callers pass `spender`; no default to `GeneralAdapter1`.
- **Bundle token-pull policy is explicit.** Bundle flows use `MidnightBundles` as spender and never consume or reset the core `Midnight` allowance reserved by maker offers.
- **Deadline is explicit.** Passing `maxUint256` preserves current markets app behavior, but requiring `deadline` keeps unbounded validity intentional at each call site.
- **Typed errors only.** SDK-owned router / mempool validation, invalid protocol inputs, no credit, and insufficient withdrawable liquidity each get exported typed errors before implementation lands. App-owned preflights may keep app-specific user-facing errors.

## Future considerations

- If a future Midnight flow needs a real wait condition (`before` / `after` equivalent), add a small `wait` requirement kind at that time. Do not preemptively port app `ActionFlow`.
- If consumers strongly reject mandatory preparation-phase `callRequests`, revisit a dedicated sequence-building API with evidence from integration feedback.

## References

- `packages/morpho-sdk/src/types/action.ts` — current `Transaction`, `Requirement`, and action unions.
- `packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirements.ts` — current GeneralAdapter1-oriented requirement helper.
- `packages/morpho-sdk/src/actions/requirements/getRequirementsApproval.ts` — lower-level approval helper to reuse with explicit spender.
- `packages/midnight-sdk/src/signatures/{Group,Tree,Payload,EcrecoverRatifierUtils,SetterRatifierUtils}.ts` — existing framework-free Midnight group, tree, payload, and ratifier utilities that the hypothetical `morpho-sdk` flows should reuse or mirror.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/lend-market/buildLendMarketOrderActionFlow.ts` — lend-market app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/borrow-market/buildBorrowMarketOrderActionFlow.ts` — borrow-market app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/lend-limit/buildLendLimitOrderActionFlow.ts` and `lib/modules/offer/buildMakeOffersActionFlow.ts` — lend-limit / OCA app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/borrow-limit/buildBorrowLimitOrderActionFlow.ts` — borrow-limit app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/multi-limit-order/buildMultiLimitOrderActionFlow.ts` — multi-market OCA basket flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/market-order.utils.ts` — `buildTakesFromOffers` take construction.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/limit-order.utils.ts` — ratifier detection, root signing, and mempool submit.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/position/actions/redeem/buildRedeemActionFlow.ts` — redeem flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/position/actions/repay-withdraw/buildRepayWithdrawActionFlow.ts` — repay / withdraw collateral flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/offer/actions/buildCancelOfferActionFlow.ts` — cancel offer flow.
- `morpho-org/midnight/src/Midnight.sol` and `src/interfaces/IMidnight.sol` — core offer, authorization, position, consumed, repay, withdraw, and collateral semantics.
- `morpho-org/bundles/src/midnight/MidnightBundlesV1.sol` and `src/midnight/IMidnightBundlesV1.sol` — latest bundled taker and repay / withdraw entry points used by the markets app.
- `morpho-org/midnight/src/ratifiers/EcrecoverRatifier.sol` and `src/ratifiers/SetterRatifier.sol` — maker root-signature and ratify-root consent paths.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §2 (forbidden patterns), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
