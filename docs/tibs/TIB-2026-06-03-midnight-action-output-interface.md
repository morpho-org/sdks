# TIB-2026-06-03: Midnight action flow implementation

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Status** | Proposed                             |
| **Date**   | 2026-06-03                           |
| **Author** | Romain / Carapulse draft             |
| **Scope**  | Package: `morpho-sdk` / Midnight SDK |

---

## Context

This TIB specifies the implementation of Midnight action flows in `morpho-sdk`. The source behavior is the fixed-rate app (`morpho-apps/apps/markets-app`): its home-made action builders already encode the protocol paths, requirement ordering, token-pull policy, ratifier selection, and mempool submission behavior future integrators need. The SDK should lift that protocol logic into reusable Midnight entity / action flows, while keeping the fixed-rate app migration as close as possible to an adapter swap.

The fixed-rate app is also the compatibility target. To minimize its diff, the SDK keeps the lazy action output shape already used by existing `morpho-sdk` action flows and widens only the requirement and signature arguments:

```ts
{
  getRequirements: (params?: {
    useSimplePermit?: boolean;
  }) => Promise<readonly RequirementItem[]>;
  buildTx: (
    requirementSignatures?:
      | AnyRequirementSignature
      | readonly AnyRequirementSignature[],
  ) => Readonly<Transaction<TAction>>;
}
```

The concrete implementation is still MarketV1 / vault oriented:

- `buildTx(...)` returns one final `Transaction<TAction>`.
- `getRequirements(...)` returns prerequisite approval / permit / authorization items.
- `Requirement` currently means only a signature requirement (`permit` / `permit2`).
- Transaction requirements are raw `Transaction<ERC20ApprovalAction>` or `Transaction<MorphoAuthorizationAction>` values.
- The shared `getRequirements(...)` helper is tuned for `bundler3.generalAdapter1` as spender.

The fixed-rate app (`morpho-apps/apps/markets-app`) already implements the Midnight flows, but under its UI-specific `ActionFlow` abstraction:

- market/taker flows produce optional approval transactions, optional `Midnight.setIsAuthorized(...)`, and one final bundler transaction;
- maker/limit flows produce optional approval transactions, optional ratifier authorization, either one EOA root signature or one contract-wallet ratify-root transaction, then one mempool submit transaction;
- some user-level flows are multi-transaction (`supplyCollateral` before posting a borrow offer);
- repay / withdraw collateral already goes through `MidnightBundles.repayAndWithdrawCollateral(...)`, so the app sees one final bundled tx plus optional pre-execution approval / authorization items;
- none of the current fixed-rate app builders use `ActionFlow` `before` / `after` callbacks.

This TIB freezes the minimal SDK output-shape change needed before migrating those Midnight action builders into `morpho-sdk`.

That minimal change still touches shared `morpho-sdk` action-flow types and interfaces. `Requirement` can no longer mean only "signature requirement", transaction requirements can no longer mean only optional approval / authorization prerequisites, and `buildTx(...)` must accept the collected signature list the fixed-rate app already passes through its `ActionFlow` engine. Existing Blue / MarketV1 / vault methods may keep their narrower concrete return types, but the shared interfaces need to become compatible with the fixed-rate app's current execution model so the Midnight implementation does not force a bespoke integrator migration.

The compatibility constraint is intentionally two-sided. For existing `morpho-sdk` consumers, implementing Midnight action flows should not turn the shared action interface into a broad breaking migration: existing flows should keep the same `{ getRequirements, buildTx }` execution model, and any shared type widening should be source-compatible wherever the current method can stay narrower. For the fixed-rate app, those same shared types must become wide enough to represent its existing signature-first `ActionFlow` model, ordered call requests, and mandatory prelude transactions. This keeps Midnight reusable for future integrators without making current SDK consumers absorb large unrelated changes, while keeping the fixed-rate app migration diff mostly limited to replacing app-owned protocol builders with SDK calls plus one adapter.

## Goals / Non-Goals

**Goals**

- Implement Midnight action flows in `morpho-sdk` from the fixed-rate app's working protocol implementation, so future integrators can reuse the same paths instead of rebuilding them app-side.
- Minimize the fixed-rate app migration by preserving its `ActionFlow` execution model, centralizing the adapter, and moving only protocol construction into the SDK.
- Keep the public SDK contract centered on `{ getRequirements, buildTx }`.
- Represent every currently implemented fixed-rate app flow without adding an SDK `ActionFlow` engine.
- Preserve the existing `Transaction` shape: `{ to, value, data, action }`.
- Preserve action-layer purity: actions stay synchronous, encode-only, and deep-frozen.
- Keep existing Blue / MarketV1 / vault methods source-compatible; widen shared action-flow types / interfaces only where needed for the fixed-rate app's minimum-change migration.
- Avoid large breaking changes for existing `morpho-sdk` consumers while maximizing compatibility with the fixed-rate app's current action-flow shape.
- Make requirement ordering explicit enough for multi-step Midnight flows.
- Support ERC2612 and Permit2 for Midnight bundle token pulls with the same `supportSignature` / `useSimplePermit` consumer policy as Blue.
- Support both maker consent paths: EOA / EIP-7702 signature and contract-wallet ratify-root.

**Non-Goals**

- No `ActionFlowProvider`, `CallRequest`, `before`, or `after` clone in `morpho-sdk`.
- No generic DAG / dependency graph of steps.
- No `buildTxs()` as the primary interface.
- No validation requirement objects. SDK-owned validation throws typed errors from entity / requirement resolution; app-owned preflights such as quote previews and tick-spacing assertions may continue to throw the app's user-facing errors before the SDK call.
- No SDK-specific UI policy for token permits. The SDK exposes ERC2612 / Permit2 requirements with neutral metadata; the fixed-rate app still decides whether `supportSignature` is enabled, whether to request simple permits with `useSimplePermit`, and how each signature step is labeled.
- No SDK modeling for app-only forms, dialogs, or UI copy.

## Decision

Implement Midnight as regular `morpho-sdk` entity / action flows that return the same lazy output shape as existing SDK flows. Do not introduce a second SDK flow engine. Instead, widen the existing action output / requirement interfaces just enough for the fixed-rate app's current `ActionFlow` engine to adapt the SDK result with one shared adapter.

Concretely, keep `buildTx` as the final transaction builder and widen `getRequirements` into an **ordered list of pre-execution items**.

```ts
export interface ActionOutput<
  TAction extends BaseAction = TransactionAction,
  TSignatures = RequirementSignature,
> {
  readonly getRequirements: (params?: {
    readonly useSimplePermit?: boolean;
  }) => Promise<readonly ActionRequirement[]>;
  readonly buildTx: (signatures?: TSignatures) => Readonly<Transaction<TAction>>;
}

export type MidnightActionSignatures =
  | AnyRequirementSignature
  | readonly AnyRequirementSignature[];
```

Semantics:

1. `getRequirements()` returns every item that must be satisfied **before** `buildTx()`'s transaction is sent.
2. Items are already filtered: if an approval / authorization is not needed, it is omitted.
3. Returned transaction items are ordered and must be executed in relative order.
4. Signature items in the initial Midnight implementation may be collected before transaction items because the signed typed data is fully determined during entity resolution and does not depend on a prerequisite transaction being mined.
5. A transaction item is not necessarily an approval; it can be an authorization, contract-wallet ratify-root, or mandatory prelude transaction.
6. A signature item returns a `RequirementSignature` value. Existing one-signature flows may pass that value directly into `buildTx(signature)`; Midnight flows use `MidnightActionSignatures` and may pass the collected `readonly AnyRequirementSignature[]` into `buildTx(signatures)` when the final bundle needs a token permit and a maker root signature can appear in the same action output.
7. Existing methods may keep narrower return types; new Midnight methods use `ActionRequirement`.

This is the smallest compatible change: Midnight flows that are one final tx remain one final tx, flows with required prelude txs place those prelude txs in `getRequirements()`, and the fixed-rate app can forward the signature list it already collects instead of learning a keyed SDK-owned flow engine.

## Description: fixed-rate app migration boundary

The fixed-rate app can keep its UI-specific `ActionFlow` execution engine. Because the SDK implementation is based on the app's current protocol builders, the migration target is a thin adapter from the proposed SDK `ActionOutput` into the app's existing `signatureRequests` / `callRequests` shape, not a port of `ActionFlow` into the SDK.

The concrete SDK implementation in the stacked implementation PR moves protocol execution into `morpho-sdk`, while leaving rate-form and display decisions in the fixed-rate app:

- **SDK-owned protocol logic**: allowance reads, `Midnight.isAuthorized(...)` reads, ratifier selection, `Group` / `Tree` / `Payload` construction, root-signature payload generation, ratify-root calldata, Midnight API mempool validation, and `MidnightBundles` / `Midnight` calldata.
- **Integrator-owned app logic**: `ActionFlow` construction, step labels (`"Confirm"`, `"Approve loan token"`, `"Submit offer"`), form-specific copy, review-only display values (`offerExpiry`, date labels, token role labels), `onSuccess` routing, query invalidation, analytics, EIP-5792 batching behavior, `before` / `after` waits if the app ever adds them, user-facing error presentation, and rate-derived input preparation (`minUnits`, `maxUnits`, offer-chain `legs`).
- **Retained preflight validation in the fixed-rate app**: existing quote/rate preview checks and tick-spacing assertions may stay app-side because they are used to produce immediate UX errors and review data. The SDK still performs the protocol checks it needs to build safe transactions and payloads.

The SDK may expose neutral typed metadata so an integrator can label steps, but it must not expose labels or UI state. For example, `MidnightAuthorizationAction.args.authorized` is SDK metadata; `"Authorize bundler"` is app copy.

### Protocol intent from Midnight source

The migration should keep the fixed-rate app on the bundle paths it already uses:

- `MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral(...)` for take-lend taker flows;
- `MidnightBundles.supplyCollateralAndSellWithAssetsTarget(...)` for take-borrow taker flows with `loanAssets > 0`;
- direct `Midnight.supplyCollateral(...)` only for supply-only branches where there are no takes and the bundler would index `takes[0]`;
- `MidnightBundles.repayAndWithdrawCollateral(...)` for repay-only, withdraw-only, and repay+withdraw position flows.

This is not just a UI preference. `MidnightBundles` pulls tokens once, consumes token permits when the SDK collected one, skips reverted stale offers while continuing through the provided take list, enforces exact asset / unit targets, and performs the authorized `Midnight` calls on behalf of the taker. The app already shaped its flows around those semantics, so the SDK migration should preserve them to minimize app changes.

Maker flows remain mempool flows, not bundle flows:

- the SDK builds offers, one content-addressed group, and a Merkle tree;
- the maker authorizes the chosen ratifier on `Midnight`;
- EOA / EIP-7702 makers sign the tree root for `EcrecoverRatifier`;
- contract-wallet makers send `SetterRatifier.setIsRootRatified(maker, root, true)`;
- the final transaction submits the encoded `Payload` to the mempool contract.

### App-side adapter

The fixed-rate app can adapt SDK output once and reuse the adapter across every screen. Labels are supplied by the app as callbacks so the SDK never learns app copy, token roles, or display rules.

```ts
import { createImmutableActionFlow } from "@repo/web3";
import type { ActionFlow, ActionFlowResult, CallRequest, SignatureRequest } from "@repo/web3";
import type { Address } from "viem";
import type {
  ActionOutput,
  ActionRequirement,
  AnyRequirementSignature,
  BaseAction,
  MidnightActionSignatures,
  SignatureRequirement,
  TransactionRequirement,
} from "@morpho-org/morpho-sdk";

interface MidnightActionFlowLabels {
  readonly confirm: string;
  readonly requirement: (requirement: ActionRequirement) => string;
  readonly final: () => string;
}

function isSignatureRequirement(
  requirement: ActionRequirement,
): requirement is SignatureRequirement {
  return "sign" in requirement;
}

function transactionToCallRequest(
  tx: TransactionRequirement,
  label: string,
): CallRequest {
  return {
    label,
    getCall: () => ({
      to: tx.to,
      value: tx.value,
      data: tx.data,
    }),
  };
}

export async function midnightActionOutputToActionFlow<
  TAction extends BaseAction,
>({
  chainId,
  accountAddress,
  action,
  useSimplePermit,
  labels,
  onSuccess,
}: {
  readonly chainId: number;
  readonly accountAddress: Address;
  readonly action: ActionOutput<TAction, MidnightActionSignatures>;
  readonly useSimplePermit?: boolean;
  readonly labels: MidnightActionFlowLabels;
  readonly onSuccess?: (result: ActionFlowResult) => void | Promise<void>;
}): Promise<ActionFlow> {
  const requirements = await action.getRequirements({ useSimplePermit });
  const signatures: AnyRequirementSignature[] = [];

  const signatureRequests: SignatureRequest[] = requirements
    .filter(isSignatureRequirement)
    .map(requirement => ({
      label: labels.requirement(requirement),
      sign: async wallet => {
        const signature = await requirement.sign(wallet, accountAddress);
        signatures.push(signature);
        return "payload" in signature.args ? signature.args.payload : signature.args.signature;
      },
    }));

  const transactionRequirements = requirements.filter(
    (requirement): requirement is TransactionRequirement => !isSignatureRequirement(requirement),
  );

  return createImmutableActionFlow({
    chainId,
    label: labels.confirm,
    signatureRequests,
    callRequests: [
      ...transactionRequirements.map(requirement =>
        transactionToCallRequest(requirement, labels.requirement(requirement)),
      ),
      {
        label: labels.final(),
        getCall: () => {
          const tx =
            signatures.length === 0
              ? action.buildTx()
              : action.buildTx(signatures.length === 1 ? signatures[0] : signatures);
          return { to: tx.to, value: tx.value, data: tx.data };
        },
      },
    ],
    onSuccess,
  });
}
```

The adapter preserves the current fixed-rate app UX where all `SignatureRequest`s are collected before transactions are sent. ERC2612 permits, Permit2 transfer signatures, and EOA maker offer-root signatures do not depend on prior Midnight authorization or collateral-supply transactions, so grouping signatures first is protocol-compatible. Permit2 may still require an ERC20 approval transaction to the Permit2 contract; that transaction stays in the ordered transaction requirements. Transaction requirements keep their relative order. The adapter is intentionally Midnight-specific and passes a singleton signature as a singleton; it only passes an array when several Midnight signatures were collected for the same final `buildTx(...)`. The only generic assertion is centralized in this adapter; individual fixed-rate builders pass the SDK action output as-is.

The label mapper stays in the fixed-rate app:

```ts
const fixedRateRequirementLabels: Pick<
  MidnightActionFlowLabels,
  "confirm" | "requirement"
> = {
  confirm: "Confirm",
  requirement: requirement => {
    if ("sign" in requirement) {
      switch (requirement.action.type) {
        case "permit":
          return "Sign token permit";
        case "permit2":
          return "Sign Permit2 approval";
        case "permit2Transfer":
          return "Sign Permit2 transfer";
        case "midnightOfferRootSignature":
          return "Sign offer root";
      }
    }

    switch (requirement.action.type) {
      case "erc20Approval":
        return requirement.action.args.amount === 0n
          ? `Reset ${tokenSymbolByAddress[requirement.to]} approval`
          : `Approve ${tokenRoleByAddress[requirement.to]}`;
      case "midnightAuthorization":
        return requirement.action.args.authorized === midnightBundlesAddress
          ? "Authorize bundler"
          : "Enable order signing";
      case "midnightRatifyRoot":
        return "Approve offer root";
      case "midnightSupplyCollateral":
        return "Supply collateral";
      default:
        return "Confirm transaction";
    }
  },
};

const takeLendLabels: MidnightActionFlowLabels = {
  ...fixedRateRequirementLabels,
  final: () => "Take lend offers",
};

const takeBorrowLabels: MidnightActionFlowLabels = {
  ...fixedRateRequirementLabels,
  final: () => "Supply collateral and borrow",
};

const submitOfferLabels: MidnightActionFlowLabels = {
  ...fixedRateRequirementLabels,
  final: () => "Submit offer",
};

const repayWithdrawLabels = ({
  repayAssets,
  withdrawCollateralAssets,
}: {
  repayAssets: bigint;
  withdrawCollateralAssets: bigint;
}): MidnightActionFlowLabels => ({
  ...fixedRateRequirementLabels,
  final: () =>
    repayAssets > 0n && withdrawCollateralAssets > 0n
      ? "Repay and withdraw collateral"
      : repayAssets > 0n
        ? "Repay"
        : "Withdraw collateral",
});
```

This code is intentionally app-side. It depends on display concepts (`loan token`, `collateral token`, token symbols, and screen-specific final labels) that do not belong in `morpho-sdk`.

If a fixed-rate screen needs protocol metadata for follow-up behavior, the Midnight method can return a method-specific subtype that structurally extends `ActionOutput` with readonly metadata. The concrete maker flows return protocol fields such as `group`, `root`, and `ratifierType`; review-only display state such as `offerExpiry` stays in the fixed-rate app because the app still owns offer-chain construction. That does not change the core `{ getRequirements, buildTx }` interface, and the app decides how to display the metadata.

### Example 1: take-lend taker flow

Current fixed-rate app code mixes SDK-owned and app-owned concerns:

```ts
// SDK-owned: allowance and Midnight authorization reads.
const [allowance, authorizeBundlerRequest] = await Promise.all([
  readContract(client, {
    address: market.loanToken.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [accountAddress, midnightBundlesAddress],
  }),
  buildAuthorizeBundlerCallRequestIfNeeded({ client, accountAddress }),
]);

// Mixed today: approval calldata is business logic; label is app UI copy.
const approvalRequests = buildApprovalCallRequestIfNeeded({
  chainId: client.chain.id,
  tokenAddress: market.loanToken.address,
  tokenSymbol: market.loanToken.symbol,
  spender: midnightBundlesAddress,
  requiredAmount: assets,
  currentAllowance: allowance,
  label: "Approve loan token",
});

// Mixed today: bundle calldata is business logic; label is app UI copy.
callRequests.push({
  label: "Take lend offers",
  getCall: () => ({
    to: midnightBundlesAddress,
    data: encodeFunctionData({
      abi: MidnightBundlesAbi,
      functionName: "buyWithAssetsTargetAndWithdrawCollateral",
      args: [
        assets,
        minUnits,
        accountAddress,
        { kind: 0, data: "0x" },
        takes,
        [],
        zeroAddress,
        0n,
        zeroAddress,
      ],
    }),
  }),
});

// App-owned: execution engine, top-level label, success plumbing.
return createImmutableActionFlow({
  chainId: client.chain.id,
  label: "Confirm",
  signatureRequests: [],
  callRequests,
  onSuccess,
});
```

Equivalent fixed-rate app code after SDK migration:

```ts
const market = await fetchActionFlowMarket(client, marketId);
const maxPrice = rateToPrice({ rate: minRate, maturity: market.maturity, now });
const minUnits = computeUnitsFromAssets({
  assets,
  price: maxPrice,
  rounding: "Down",
});

const action = await client.morpho.midnight(client.chain.id).takeLend({
  marketId,
  accountAddress,
  assets,
  minUnits,
  offers,
});

return midnightActionOutputToActionFlow({
  chainId: client.chain.id,
  accountAddress,
  action,
  labels: takeLendLabels,
  onSuccess,
});
```

Expanded SDK output:

```ts
await action.getRequirements();
// [
//   maybe loan-token pull requirement for MidnightBundles:
//     - ERC20ApprovalAction when signatures are disabled / unavailable, or
//     - permit / permit2Transfer signature requirement when signatures are enabled
//       (+ optional ERC20ApprovalAction(loanToken, Permit2, assets) for Permit2),
//   maybe MidnightAuthorizationAction(MidnightBundles, true, accountAddress),
// ]

action.buildTx(signatures);
// Transaction<MidnightTakeLendAction>
// to: MidnightBundles
// data: buyWithAssetsTargetAndWithdrawCollateral(
//   assets,
//   minUnits,
//   accountAddress,
//   loanTokenPermit,
//   takes,
//   [],
//   zeroAddress,
//   0n,
//   zeroAddress,
// )
```

#### Fixed-rate app patch shape

Expected app-side diff: **small**. The app keeps the rate-to-`minUnits` calculation, then deletes requirement resolution and final calldata encoding. The screen still passes the router quote (`offers`) it already selected; the SDK accepts the API take shape directly.

```diff
 export async function buildLendMarketOrderActionFlow({
   client,
   marketId,
   accountAddress,
   assets,
   minRate,
   now,
   offers,
   onSuccess,
 }: BuildLendMarketOrderActionFlowParameters): Promise<ActionFlow> {
   validateInputs({ assets, minRate, now });

-  const { midnightAddress, midnightBundlesAddress } = getMarketsV2ContractAddresses(client.chain.id);
   const market = await fetchActionFlowMarket(client, marketId);
   const maxPrice = rateToPrice({ rate: minRate, maturity: market.maturity, now });
   const minUnits = computeUnitsFromAssets({ assets, price: maxPrice, rounding: "Down" });
-  const [allowance, authorizeBundlerRequest] = await Promise.all([...]);
-  const takes = buildTakesFromOffers(offers, { marketId, expectedBuy: false, chainId: client.chain.id, morphoV2: midnightAddress });
-  const callRequests: CallRequest[] = [];
-  const approvalRequests = buildApprovalCallRequestIfNeeded({ ... });
-  if (approvalRequests) callRequests.push(...approvalRequests);
-  if (authorizeBundlerRequest) callRequests.push(authorizeBundlerRequest);
-  callRequests.push({ label: "Take lend offers", getCall: () => encodeBundleTake(...) });
-  return createImmutableActionFlow({ chainId: client.chain.id, label: "Confirm", signatureRequests: [], callRequests, onSuccess });
+  const action = await client.morpho.midnight(client.chain.id).takeLend({
+    marketId,
+    accountAddress,
+    assets,
+    minUnits,
+    offers,
+  });
+
+  return midnightActionOutputToActionFlow({
+    chainId: client.chain.id,
+    accountAddress,
+    action,
+    labels: takeLendLabels,
+    onSuccess,
+  });
 }
```

What leaves the app:

- allowance read for the loan token;
- `buildApprovalCallRequestIfNeeded(...)` invocation for this flow; the SDK now resolves the loan-token pull as either an approval transaction, ERC2612 signature, or Permit2 signature depending on `supportSignature` and `useSimplePermit`;
- `buildAuthorizeBundlerCallRequestIfNeeded(...)` invocation for this flow;
- `buildTakesFromOffers(...)` and `MidnightBundles` calldata encoding.

What stays in the app:

- quote selection and loading state that produced `offers`;
- `rateToPrice(...)` and `computeUnitsFromAssets(...)`, because the concrete SDK API receives `minUnits` and does not own rate display math;
- form guards if the app wants immediate local UX errors;
- labels (`"Take lend offers"`, `"Approve loan token"`, `"Authorize bundler"`);
- the global decision to enable signatures through `morphoViemExtension({ supportSignature: true })` and the per-call choice to pass `useSimplePermit` into the shared adapter when the app wants ERC2612 over the default Permit2 path;
- `ActionFlow` wrapping and `onSuccess`.

Complexity for the fixed-rate app: **low**. This is mostly a mechanical builder replacement. If the app keeps `supportSignature: false`, the visible execution flow stays approval-based. If the app enables signatures, the shared adapter surfaces the extra token signature request without changing the take-lend builder again. The app keeps the existing rate-to-units lines, removes roughly the allowance / authorization / approval / take-encoding / final-call half of the builder, and updates tests to assert adapter inputs rather than raw app-built calldata.

### Example 2: make-borrow with collateral + loan offer

This is the hardest current migration shape because it combines a mandatory prelude tx with maker consent. The app currently owns both concerns:

```ts
if (collateralAssets > 0n) {
  // SDK-owned: allowance read.
  const collateralAllowance = await readContract(client, {
    address: market.collateralToken.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [accountAddress, midnightAddress],
  });

  // Mixed today: approval business logic plus app label.
  const approvalRequests = buildApprovalCallRequestIfNeeded({
    chainId: client.chain.id,
    tokenAddress: market.collateralToken.address,
    tokenSymbol: market.collateralToken.symbol,
    spender: midnightAddress,
    requiredAmount: reservedCollateralAssets + collateralAssets,
    currentAllowance: collateralAllowance,
    label: "Approve collateral token",
  });
  if (approvalRequests) callRequests.push(...approvalRequests);

  // SDK-owned calldata; app-owned label.
  callRequests.push({
    label: "Supply collateral",
    getCall: () => ({
      to: midnightAddress,
      data: encodeFunctionData({
        abi: MidnightAbi,
        functionName: "supplyCollateral",
        args: [market.struct, 0n, collateralAssets, accountAddress],
      }),
    }),
  });
}

// SDK-owned: offer inputs, Group, Tree, router validation, ratifier selection,
// ratifier authorization, root signature/ratify-root, Payload.
const { signatureRequests: sigReqs, callRequests: callReqs, groupId } =
  await buildMakeOfferRequests({ client, accountAddress, ratifier, offerInputs });

// App-owned: ActionFlow composition and onSuccess metadata routing.
signatureRequests.push(...sigReqs);
callRequests.push(...callReqs);
return createImmutableActionFlow({
  chainId: client.chain.id,
  label: "Confirm",
  signatureRequests,
  callRequests,
  onSuccess: onSuccess ? result => onSuccess(result, groupId) : undefined,
});
```

Equivalent fixed-rate app code after SDK migration:

```ts
const market = await fetchActionFlowMarket(client, marketId);
let offerExpiry = expiry;
let legs: MidnightMakeOfferLeg[] | undefined;

if (loanAssets > 0n) {
  if (rate === null) {
    throw new UserFacingError("Rate is required");
  }

  const offerChain = buildOfferChain({
    side: "borrow",
    targetRate: rate,
    tickSpacing: market.state.tickSpacing,
    maturityTimestamp: market.maturity,
    chainStartTimestamp: now,
    chainEndTimestamp: expiry,
  });

  if (offerChain.length === 0) {
    throw new UserFacingError("This rate can't be held for this market. Try a different rate.");
  }

  offerExpiry = offerChain.at(-1)!.expiryTimestamp;

  await assertTicksAlignedToSpacing({
    client,
    entries: offerChain.map((leg) => ({ marketId: market.id, tick: leg.tick })),
  });

  legs = offerChain.map((leg) => ({
    market: market.struct,
    tick: leg.tick,
    start: leg.startTimestamp,
    expiry: leg.expiryTimestamp,
  }));
}

const action = await client.morpho.midnight(client.chain.id).makeBorrow({
  accountAddress,
  market: market.struct,
  collateralAssets,
  loanAssets,
  reservedCollateralAssets,
  legs,
});

const flow = await midnightActionOutputToActionFlow({
  chainId: client.chain.id,
  accountAddress,
  action,
  labels: submitOfferLabels,
  onSuccess: (result) => onSuccess?.(result, action.group ?? null),
});

return { flow, offerExpiry };
```

Expanded SDK output for the collateral + loan branch:

```ts
await action.getRequirements();
// EOA / EIP-7702:
// [
//   maybe ERC20ApprovalAction(collateralToken, Midnight, reservedCollateralAssets + collateralAssets),
//   MidnightSupplyCollateralAction,             // mandatory prelude tx
//   maybe MidnightAuthorizationAction(EcrecoverRatifier, true, accountAddress),
//   midnightOfferRootSignature,                 // app maps to SignatureRequest
// ]
//
// Contract wallet:
// [
//   maybe ERC20ApprovalAction(collateralToken, Midnight, reservedCollateralAssets + collateralAssets),
//   MidnightSupplyCollateralAction,             // mandatory prelude tx
//   maybe MidnightAuthorizationAction(SetterRatifier, true, accountAddress),
//   MidnightRatifyRootAction,
// ]

action.buildTx(signatures);
// Transaction<MidnightSubmitOffersAction>
// to: MidnightMempool
// data: Payload.encode(...)
```

This case intentionally stays approval-based for collateral and reserve transfers. The mandatory `MidnightSupplyCollateralAction` and maker reserve approvals target the core `Midnight` contract / mempool path, not a `MidnightBundles` function that accepts `TokenPermit`. Introducing token permits here would require a different protocol entry point rather than an app-only SDK migration.

SDK-side outline, with no UI labels:

```ts
async function makeBorrow(params): Promise<MakeBorrowActionOutput> {
  const market = MarketParams.from(params.market);

  if (params.loanAssets === 0n) {
    return {
      getRequirements: async () => getMidnightApprovalRequirements(...),
      buildTx: () => encodeMidnightSupplyCollateral(...),
    };
  }

  const ratifier = await fetchRatifierInfo(...);
  const offers = params.legs.map((leg) => Offer.create({
    market: leg.market,
    buy: false,
    maker: params.accountAddress,
    tick: leg.tick,
    start: leg.start,
    expiry: leg.expiry,
    ratifier: ratifier.ratifier,
    maxAssets: params.loanAssets,
    receiverIfMakerIsSeller: params.accountAddress,
  }));
  const group = Group.create(offers);
  const tree = Tree.create([group]);
  await tree.mempoolValidate({ chainId });

  return {
    group: group.id,
    root: tree.root,
    ratifierType: ratifier.type,
    getRequirements: async () => {
      const requirements: ActionRequirement[] = [];
      if (params.collateralAssets > 0n) {
        requirements.push(...await getMidnightApprovalRequirements(...));
        requirements.push(encodeMidnightSupplyCollateral(...));
      }
      requirements.push(...await getRatifierRequirements(...));

      return requirements;
    },
    buildTx: signatures => encodeMidnightSubmitOffers({
      mempool,
      group: group.id,
      payload: buildSubmitPayload(signatures),
    }),
  };
}
```

#### Fixed-rate app patch shape

Expected app-side diff: **medium**. The app keeps form validation, offer-chain construction, the tick-spacing preflight, and `offerExpiry` review state. It deletes allowance reads, approval/supply calldata, ratifier detection, root signing/ratify-root wiring, payload construction, and the app-local maker submit transaction.

```diff
 export async function buildBorrowLimitOrderActionFlow({
   client,
   marketId,
   accountAddress,
   collateralAssets,
   loanAssets,
   reservedCollateralAssets = 0n,
   rate,
   expiry,
   now,
   onSuccess,
 }: BuildBorrowLimitActionFlowParameters): Promise<{ flow: ActionFlow; offerExpiry: number }> {
   if (collateralAssets === 0n && loanAssets === 0n) throw new UserFacingError(...);
   if (collateralAssets < 0n || loanAssets < 0n) throw new UserFacingError(...);

   const market = await fetchActionFlowMarket(client, marketId);
   let offerExpiry = expiry;
+  let legs: MidnightMakeOfferLeg[] | undefined;

-  if (collateralAssets > 0n) {
-    const collateralAllowance = await readContract(...);
-    const approvalRequests = buildApprovalCallRequestIfNeeded({ ... });
-    if (approvalRequests) callRequests.push(...approvalRequests);
-    callRequests.push({ label: "Supply collateral", getCall: () => encodeSupplyCollateral(...) });
-  }

   if (loanAssets > 0n) {
     if (rate === null) throw new UserFacingError("Rate is required");
-    const legs = buildOfferChain(...);
-    if (legs.length === 0) throw new UserFacingError(...);
-    offerExpiry = legs.at(-1)!.expiryTimestamp;
+    const offerChain = buildOfferChain(...);
+    if (offerChain.length === 0) throw new UserFacingError(...);
+    offerExpiry = offerChain.at(-1)!.expiryTimestamp;
     await assertTicksAlignedToSpacing(...);
-    const ratifier = await getRatifierInfo({ client, accountAddress });
-    const offerInputs = legs.map(leg => ({ ... }));
-    const { signatureRequests: sigReqs, callRequests: callReqs, groupId } =
-      await buildMakeOfferRequests({ client, accountAddress, ratifier, offerInputs });
-    offerGroupId = groupId;
-    signatureRequests.push(...sigReqs);
-    callRequests.push(...callReqs);
+    legs = offerChain.map((leg) => ({
+      market: market.struct,
+      tick: leg.tick,
+      start: leg.startTimestamp,
+      expiry: leg.expiryTimestamp,
+    }));
   }

+  const action = await client.morpho.midnight(client.chain.id).makeBorrow({
+    accountAddress,
+    market: market.struct,
+    collateralAssets,
+    loanAssets,
+    reservedCollateralAssets,
+    legs,
+  });
+
+  const flow = await midnightActionOutputToActionFlow({
+    chainId: client.chain.id,
+    accountAddress,
+    action,
+    labels: submitOfferLabels,
+    onSuccess: (result) => onSuccess?.(result, action.group ?? null),
+  });
+
   return { flow, offerExpiry };
 }
```

What leaves the app:

- collateral allowance read and collateral approval construction;
- collateral supply calldata construction;
- offer-chain to full `OfferInput` conversion;
- `getRatifierInfo(...)`, `buildMakeOfferRequests(...)`, `Group`, `Tree`, `Payload`, and root payload state;
- ratifier authorization read / calldata;
- EOA root-signature payload mutation and Setter ratify-root calldata.

What stays in the app:

- form-level guards and user-facing copy (`"Rate is required"`, empty amount checks) unless the app chooses to rely entirely on SDK typed errors;
- `fetchActionFlowMarket(...)`, `buildOfferChain(...)`, and `assertTicksAlignedToSpacing(...)`;
- `ActionFlow` execution through the shared adapter;
- final labels and requirement labels;
- no token-permit UI branch for this collateral prelude; the SDK returns an approval transaction because the core Midnight call used by this migration has no `TokenPermit` argument;
- `onSuccess(result, action.group ?? null)` and local review display of `offerExpiry`.

Complexity for the fixed-rate app: **medium**. The code removal is still large, but less than the hypothetical API because rate math and offer-chain construction stay in the app. The replacement is exact: convert `OfferChainLeg[]` into `MidnightMakeOfferLeg[]`, call `makeBorrow`, adapt requirements, and use `action.group ?? null` for `onSuccess`. No fixed-rate flow requires `ActionFlow.before`, `ActionFlow.after`, a DAG, or `buildTxs()`.

### Example 3: repay / withdraw through MidnightBundles

The current app already minimizes transactions here by using `MidnightBundles.repayAndWithdrawCollateral(...)` for repay-only, withdraw-only, and combined flows. The SDK migration should keep that shape.

Current fixed-rate app core:

```ts
const [allowance, authorizeBundlerRequest] = await Promise.all([
  repayAssets > 0n
    ? readContract(client, {
        address: market.loanToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [accountAddress, midnightBundlesAddress],
      })
    : Promise.resolve(0n),
  buildAuthorizeBundlerCallRequestIfNeeded({ client, accountAddress }),
]);

if (repayAssets > 0n) {
  callRequests.push(...approvalRequestsForMidnightBundles);
}
if (authorizeBundlerRequest) callRequests.push(authorizeBundlerRequest);

callRequests.push({
  label,
  getCall: () => ({
    to: midnightBundlesAddress,
    data: encodeFunctionData({
      abi: MidnightBundlesAbi,
      functionName: "repayAndWithdrawCollateral",
      args: [
        market.struct,
        repayAssets,
        accountAddress,
        { kind: 0, data: "0x" },
        collateralWithdrawals,
        accountAddress,
        0n,
        zeroAddress,
      ],
    }),
  }),
});
```

Equivalent fixed-rate app code after SDK migration:

```ts
const action = await client.morpho
  .midnight(client.chain.id)
  .repayWithdrawCollateral({
    marketId,
    accountAddress,
    repayAssets,
    withdrawCollateralAssets,
  });

return midnightActionOutputToActionFlow({
  chainId: client.chain.id,
  accountAddress,
  action,
  labels: repayWithdrawLabels({ repayAssets, withdrawCollateralAssets }),
  onSuccess,
});
```

Expanded SDK output:

```ts
await action.getRequirements();
// [
//   maybe loan-token pull requirement for MidnightBundles when repayAssets > 0n:
//     - ERC20ApprovalAction when signatures are disabled / unavailable, or
//     - permit / permit2Transfer signature requirement when signatures are enabled
//       (+ optional ERC20ApprovalAction(loanToken, Permit2, repayAssets) for Permit2),
//   maybe MidnightAuthorizationAction(MidnightBundles, true, accountAddress),
// ]

action.buildTx(signatures);
// Transaction<MidnightRepayWithdrawCollateralAction>
// to: MidnightBundles
// data: repayAndWithdrawCollateral(
//   market,
//   repayAssets,
//   accountAddress,
//   loanTokenPermit,
//   withdrawCollateralAssets > 0n ? [{ collateralIndex: 0n, assets: withdrawCollateralAssets }] : [],
//   accountAddress,
//   0n,
//   zeroAddress,
// )
```

#### Fixed-rate app patch shape

Expected app-side diff: **small**. This stays a bundle flow, so the app does not need to learn a new execution sequence. The final label still depends on form state, so that label choice remains app-side.

```diff
 export async function buildRepayWithdrawActionFlow({
   client,
   marketId,
   accountAddress,
   repayAssets,
   withdrawCollateralAssets,
   onSuccess,
 }: BuildRepayWithdrawActionFlowParameters): Promise<ActionFlow> {
   validateInputs({ repayAssets, withdrawCollateralAssets });

-  const { midnightBundlesAddress } = getMarketsV2ContractAddresses(client.chain.id);
-  const market = await fetchActionFlowMarket(client, marketId);
-  const [allowance, authorizeBundlerRequest] = await Promise.all([...]);
-  const callRequests: CallRequest[] = [];
-  if (repayAssets > 0n) {
-    const approvalRequests = buildApprovalCallRequestIfNeeded({ ... });
-    if (approvalRequests) callRequests.push(...approvalRequests);
-  }
-  if (authorizeBundlerRequest) callRequests.push(authorizeBundlerRequest);
-  const collateralWithdrawals = withdrawCollateralAssets > 0n ? [{ collateralIndex: 0n, assets: withdrawCollateralAssets }] : [];
-  const label = repayAssets > 0n && withdrawCollateralAssets > 0n
-    ? "Repay and withdraw collateral"
-    : repayAssets > 0n ? "Repay" : "Withdraw collateral";
-  callRequests.push({ label, getCall: () => encodeRepayAndWithdrawBundle(...) });
-  return createImmutableActionFlow({ chainId: client.chain.id, label: "Confirm", signatureRequests: [], callRequests, onSuccess });
+  const action = await client.morpho
+    .midnight(client.chain.id)
+    .repayWithdrawCollateral({
+      marketId,
+      accountAddress,
+      repayAssets,
+      withdrawCollateralAssets,
+    });
+
+  return midnightActionOutputToActionFlow({
+    chainId: client.chain.id,
+    accountAddress,
+    action,
+    labels: repayWithdrawLabels({ repayAssets, withdrawCollateralAssets }),
+    onSuccess,
+  });
 }
```

What leaves the app:

- loan-token allowance read;
- bundler authorization read;
- loan-token approval construction; the SDK now resolves the repay token pull as either an approval transaction, ERC2612 signature, or Permit2 signature depending on `supportSignature` and `useSimplePermit`;
- `collateralWithdrawals` struct construction;
- `MidnightBundles.repayAndWithdrawCollateral(...)` calldata encoding.

What stays in the app:

- `validateInputs(...)` or equivalent form-level guards;
- the final label switch between `"Repay"`, `"Withdraw collateral"`, and `"Repay and withdraw collateral"`;
- the global / per-call policy for signatures (`supportSignature` and optional `useSimplePermit`);
- `ActionFlow` wrapping and `onSuccess`.

Complexity for the fixed-rate app: **low**. The important migration detail is that this does **not** become a two-step direct `repay` then `withdrawCollateral` flow. The SDK keeps the same final bundle transaction the app uses today, so app risk is mostly around label/test updates and adapter reuse. Enabling signatures adds a token-signature request through the shared adapter; the repay/withdraw builder itself does not branch on ERC2612 vs Permit2.

## Type changes

### Requirement aliases

Add explicit aliases, without changing the shape of existing `Requirement` objects.

```ts
export interface Permit2TransferAction
  extends BaseAction<
    "permit2Transfer",
    { spender: Address; amount: bigint; deadline: bigint }
  > {}

export interface Permit2TransferArgs {
  readonly owner: Address;
  readonly nonce: bigint;
  readonly asset: Address;
  readonly signature: Hex;
  readonly amount: bigint;
  readonly deadline: bigint;
}

export type SignatureRequirementAction =
  | PermitAction
  | Permit2Action
  | Permit2TransferAction
  | MidnightOfferRootSignatureAction;

export type RequirementSignatureArgs =
  | PermitArgs
  | Permit2Args
  | Permit2TransferArgs
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

export type TokenSignatureRequirement = Requirement<
  PermitAction | Permit2Action | Permit2TransferAction,
  PermitArgs | Permit2Args | Permit2TransferArgs
>;

export type TokenRequirementSignature = RequirementSignature<
  PermitAction | Permit2Action | Permit2TransferAction,
  PermitArgs | Permit2Args | Permit2TransferArgs
>;

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
- Midnight bundle actions that can consume a token permit accept `AnyRequirementSignature | readonly AnyRequirementSignature[]` and select the matching `permit` / `permit2Transfer` signature for the token pull they encode. They validate the signed token and amount before producing `TokenPermit` calldata.
- Midnight does not reuse `action.type === "permit2"` because Blue's existing `permit2` requirement signs Permit2 `PermitSingle` and returns `Permit2Args` with `expiration`. Midnight Bundles consume Permit2 `SignatureTransfer` through `permitTransferFrom`, whose signed payload has no `expiration`; it is encoded into `TokenPermit` as `(nonce, deadline, signature)`. A separate `permit2Transfer` action / args shape keeps the two public contracts distinguishable.

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

This is action-encoding metadata, not UI state. Integrators still receive neutral `permit`, `permit2`, and `permit2Transfer` requirements and decide how to label them.

### Transaction requirements

Add a named transaction-requirement union. Existing raw `Transaction<...>` requirement values stay valid.

```ts
export type TransactionRequirementAction =
  | ERC20ApprovalAction
  | MorphoAuthorizationAction
  | MidnightAuthorizationAction
  | MidnightRatifyRootAction
  | MidnightSupplyCollateralAction;

export type TransactionRequirement = Readonly<
  Transaction<TransactionRequirementAction>
>;

export type ActionRequirement = TransactionRequirement | SignatureRequirement;
```

`MidnightSupplyCollateralAction` is included because it can be a mandatory prelude transaction for a currently implemented app flow:

- make-borrow with collateral + offer: supply collateral first, then submit the offer.

Repay / withdraw collateral does **not** need a mandatory repay prelude in the app-compatible migration, because it remains one final `MidnightBundles.repayAndWithdrawCollateral(...)` transaction.

### New Midnight requirement actions

Use public `Midnight*` action names for SDK metadata. The calldata still targets `Midnight`, `MidnightBundles`, `EcrecoverRatifier`, `SetterRatifier`, and the mempool contract.

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

export interface MidnightRatifyRootAction
  extends BaseAction<
    "midnightRatifyRoot",
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

`MidnightOfferRootSignatureArgs.payload` is the encoded mempool payload produced after the root signature is collected by the SDK requirement. `buildTx(signatures?)` selects the `midnightOfferRootSignature` result from the collected signature list, validates that its owner, root, ratifier, and offer count match the prepared flow, then uses its payload as the final submit calldata.

### New final action metadata

Add action union members only; do not change `Transaction`.

```ts
export interface MidnightTakeLendAction
  extends BaseAction<
    "midnightTakeLend",
    {
      market: Hex;
      assets: bigint;
      minUnits: bigint;
      taker: Address;
      takes: number;
    }
  > {}

export interface MidnightTakeBorrowAction
  extends BaseAction<
    "midnightTakeBorrow",
    {
      market: Hex;
      collateralAssets: bigint;
      loanAssets: bigint;
      maxUnits: bigint;
      taker: Address;
      receiver: Address;
      takes: number;
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

export interface MidnightSubmitOffersAction
  extends BaseAction<
    "midnightSubmitOffers",
    {
      group: Hex;
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
      withdrawCollateralAssets: bigint;
      onBehalf: Address;
      receiver: Address;
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

Extend `TransactionAction` with these action interfaces and the Midnight requirement action interfaces above (`MidnightAuthorizationAction`, `MidnightRatifyRootAction`).

## Minimal helper changes

### Midnight token-pull requirement helper

Do not reuse the top-level Blue / MarketV1 `getRequirements(...)` helper for Midnight, because it hardcodes `bundler3.generalAdapter1` as spender and its Permit2 path emits Bundler3 actions (`approve2` + `transferFrom2`). Midnight bundle entry points consume a `TokenPermit` struct directly, so the SDK needs a Midnight-specific token-pull helper with an explicit spender and an encoder for the bundle's permit argument.

```ts
type GetMidnightTokenPullRequirementsParams =
  | {
      readonly viemClient: Client;
      readonly chainId: number;
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
      readonly supportDeployless?: boolean;
      readonly supportSignature: false;
    }
  | {
      readonly viemClient: Client;
      readonly chainId: number;
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
      readonly supportDeployless?: boolean;
      readonly supportSignature: true;
      readonly useSimplePermit?: boolean;
    };

async function getMidnightTokenPullRequirements(
  params: GetMidnightTokenPullRequirementsParams,
): Promise<readonly ActionRequirement[]>
```

The helper follows Blue's consumer-facing policy:

- if the direct allowance to `spender` already covers `amount`, return `[]`;
- if `supportSignature` is `false`, return the classic `ERC20ApprovalAction` for `token.approve(spender, approvalAmount)`;
- if `supportSignature` is `true`, `useSimplePermit` is `true`, and the token supports ERC2612, return a `permit` signature requirement for `spender`;
- otherwise, when Permit2 is configured on the chain, return the Permit2 prerequisites: optional `ERC20ApprovalAction` for `token.approve(Permit2, approvalAmount)` plus a `permit2Transfer` signature requirement for Midnight's SignatureTransfer payload;
- if signatures are enabled but no permit route is available, fall back to the classic approval transaction.

The paired action encoder consumes the collected signatures:

```ts
function encodeMidnightTokenPermit({
  token,
  owner,
  spender,
  amount,
  signatures,
}: {
  token: Address;
  owner: Address;
  spender: Address;
  amount: bigint;
  signatures?: AnyRequirementSignature | readonly AnyRequirementSignature[];
}): MidnightTokenPermit
```

Encoding rules:

- no matching token signature: `{ kind: PermitKind.None, data: "0x" }`;
- ERC2612: validate `args.owner === owner`, `action.args.spender === spender`, `args.asset === token`, and `args.amount === amount`, then encode `(deadline, v, r, s)` as `PermitKind.ERC2612`;
- Permit2 SignatureTransfer: validate `args.owner === owner`, `action.args.spender === spender`, `args.asset === token`, and `args.amount === amount`, then encode Midnight's Permit2 data `(nonce, deadline, signature)` as `PermitKind.Permit2`. A Blue `permit2` allowance signature is not valid here because it signs `PermitSingle` and carries an `expiration`; Midnight only accepts `permit2Transfer`.

This follows the Midnight protocol source: `MidnightBundles._pullToken(...)` decodes `PermitKind.Permit2` data as `(uint256 nonce, uint256 deadline, bytes signature)` and calls `IPermit2.permitTransferFrom(...)` with `PermitTransferFrom(TokenPermissions(token, amount), nonce, deadline)`. There is no `expiration` field in the signed or encoded Midnight bundle path.

Midnight's Permit2 branch uses SignatureTransfer with a randomly generated 256-bit unordered nonce. It does not read Permit2 nonce bitmaps before returning the requirement: with a random unordered nonce, collision risk is negligible, and the extra onchain read would add cost and latency to every Permit2-backed Midnight bundle flow.

Midnight callers still supply the spender explicitly:

- `MidnightBundles` for take-lend, take-borrow with `loanAssets > 0`, and repay / withdraw bundle flows. These bundle calls have a `TokenPermit` argument and can use ERC2612 / Permit2;
- `Midnight` for direct `supplyCollateral` branches and maker-offer reserve approvals (make-lend loan token approvals and make-borrow collateral approvals). These direct / mempool paths do not have a `TokenPermit` argument in this migration and remain approval-transaction based.

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
private async prepareOffers(...): Promise<PreparedOffers>;

private async getRatifierRequirements({
  accountAddress,
  prepared,
}): Promise<readonly ActionRequirement[]>;

private buildSubmitOffersTx({
  accountAddress,
  prepared,
  signatures,
}): Readonly<Transaction<MidnightSubmitOffersAction>>;
```

EOA / EIP-7702 maker:

- optional `MidnightAuthorizationAction` for `EcrecoverRatifier`;
- one private `makeOfferRootRequirement(...)` result with `action.type === "midnightOfferRootSignature"`;
- `Requirement.sign(...)` calls the same typed-data root-signing path as the fixed-rate app and returns `{ action, args: { root, signature, payload } }`;
- `buildTx(signatures?)` selects the `midnightOfferRootSignature` result, validates the owner / root / ratifier / offer-count metadata against the prepared flow, and uses `signature.args.payload` as mempool calldata.

Contract-wallet maker:

- optional `MidnightAuthorizationAction` for `SetterRatifier`;
- one `MidnightRatifyRootAction` transaction requirement from `getMidnightRatifyRootRequirement(...)`, calling `SetterRatifier.setIsRootRatified(maker, root, true)` only when missing;
- `buildTx()` uses precomputed `Payload.encode(SetterRatifierUtils.ratify({ tree }))` as mempool calldata.

## Layering

The migration must preserve the monorepo's `Client → Entity → Action` split.

- **Entity layer** performs SDK-owned reads and off-chain checks: allowances, `isAuthorized`, ratifier selection, Midnight API mempool validation, credit / withdrawable reads, and group generation. App-owned preflights such as quote previews, rate math, and tick-spacing assertions may run before the entity call.
- **Action layer** is synchronous and encode-only: it receives already-computed amounts, offers, payloads, roots, and addresses, then returns deep-frozen `Transaction` values.
- **Helpers** are pure unless explicitly placed in the requirement-resolution boundary.

Important boundary calls:

- randomness (`group = bytes32`) is entity-level, not action-level;
- signing is inside `Requirement.sign`, not action-level;
- router validation throws before a signature prompt is exposed;
- no raw `Error`; every new failure mode gets a typed error in `src/types/error.ts`.

## Flow mapping

### Take lend

`getRequirements()` returns:

1. optional loan-token pull requirement for `MidnightBundles`: either `ERC20ApprovalAction(loanToken, MidnightBundles, approvalAmount)`, ERC2612 `permit`, or Permit2 SignatureTransfer `permit2Transfer` (+ optional `ERC20ApprovalAction(loanToken, Permit2, approvalAmount)`);
2. optional `MidnightAuthorizationAction` for `Midnight.setIsAuthorized(MidnightBundles, true, taker)`.

`buildTx(signatures?)` returns `MidnightTakeLendAction`:

```ts
MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral(
  assets,
  minUnits,
  taker,
  loanTokenPermit,
  takes,
  [],
  zeroAddress,
  0n,
  zeroAddress,
)
```

No offer-root signature is involved. `buildTx(signatures?)` only consumes a token signature if `getRequirements()` returned an ERC2612 `permit` or Permit2 `permit2Transfer` requirement for the bundle token pull.

### Take borrow with `loanAssets > 0`

`getRequirements()` returns:

1. optional collateral-token pull requirement for `MidnightBundles` when new collateral is supplied: either `ERC20ApprovalAction(collateralToken, MidnightBundles, approvalAmount)`, ERC2612 `permit`, or Permit2 SignatureTransfer `permit2Transfer` (+ optional `ERC20ApprovalAction(collateralToken, Permit2, approvalAmount)`);
2. optional `MidnightAuthorizationAction` for `Midnight.setIsAuthorized(MidnightBundles, true, taker)`.

`buildTx(signatures?)` returns `MidnightTakeBorrowAction`:

```ts
MidnightBundles.supplyCollateralAndSellWithAssetsTarget(
  loanAssets,
  maxUnits,
  taker,
  receiver,
  collateralSuppliesWithPermits,
  takes,
  0n,
  zeroAddress,
)
```

No offer-root signature is involved. `buildTx(signatures?)` only consumes a token signature if `getRequirements()` returned an ERC2612 `permit` or Permit2 `permit2Transfer` requirement for the bundle collateral pull.

### Take borrow supply-only branch

`getRequirements()` returns optional collateral approval to `Midnight`.

`buildTx()` returns `MidnightSupplyCollateralAction`:

```ts
Midnight.supplyCollateral(market, 0n, collateralAssets, onBehalf)
```

This branch remains approval-based because direct `Midnight.supplyCollateral(...)` has no `TokenPermit` argument.

### Make lend

`getRequirements()` returns:

EOA / EIP-7702:

1. optional loan-token approval to `Midnight` for `reservedLoanAssets + loanAssets`;
2. optional `MidnightAuthorizationAction` for the chosen ratifier;
3. one `midnightOfferRootSignature` requirement.

Contract wallet:

1. optional loan-token approval to `Midnight` for `reservedLoanAssets + loanAssets`;
2. optional `MidnightAuthorizationAction` for the chosen ratifier;
3. one `midnightRatifyRoot` transaction requirement.

`buildTx(signatures?)` returns `MidnightSubmitOffersAction` to the mempool contract.

The make-lend method builds one or more precomputed `{ market, tick, start, expiry }` offers.

Maker reserve approvals stay transaction approvals in this migration. The final mempool submit payload does not consume ERC2612 or Permit2 token signatures, so supporting permits here would require a separate protocol entry point rather than a fixed-rate-app-only SDK migration.

### Make borrow collateral-only branch

`getRequirements()` returns optional collateral approval to `Midnight`.

`buildTx()` returns `MidnightSupplyCollateralAction`.

This branch remains approval-based because direct `Midnight.supplyCollateral(...)` has no `TokenPermit` argument.

### Make borrow loan-only branch

`getRequirements()` returns:

EOA / EIP-7702:

1. optional `MidnightAuthorizationAction` for the chosen ratifier;
2. one `midnightOfferRootSignature` requirement.

Contract wallet:

1. optional `MidnightAuthorizationAction` for the chosen ratifier;
2. one `midnightRatifyRoot` transaction requirement.

`buildTx(signatures?)` returns `MidnightSubmitOffersAction` to the mempool contract.

### Borrow limit collateral + loan branch

`getRequirements()` returns:

EOA / EIP-7702:

1. optional collateral approval to `Midnight`;
2. **mandatory** `MidnightSupplyCollateralAction` transaction requirement;
3. optional `MidnightAuthorizationAction` for the chosen ratifier;
4. one `midnightOfferRootSignature` requirement.

Contract wallet:

1. optional collateral approval to `Midnight`;
2. **mandatory** `MidnightSupplyCollateralAction` transaction requirement;
3. optional `MidnightAuthorizationAction` for the chosen ratifier;
4. one `midnightRatifyRoot` transaction requirement.

`buildTx(signatures?)` returns only the final `MidnightSubmitOffersAction`.

This branch is the reason `getRequirements()` must be allowed to return mandatory prelude transactions, not only optional prerequisites.

### Redeem at maturity

Pre-read / validation happens before returning the action output:

- `updatePositionView(...)` gives `creditUnits`;
- `withdrawable(marketId) >= creditUnits`.

`getRequirements()` returns `[]`.

`buildTx()` returns `MidnightRedeemAction`:

```ts
Midnight.withdraw(market, creditUnits, onBehalf, receiver)
```

### Repay / withdraw collateral

All three app branches keep the current bundled execution path.

Repay only:

- `getRequirements()` returns optional loan-token pull requirement for `MidnightBundles` (approval, ERC2612 `permit`, or Permit2 `permit2Transfer`), then optional `MidnightAuthorizationAction` for `MidnightBundles`;
- `buildTx(signatures?)` returns `MidnightRepayWithdrawCollateralAction`.

Withdraw-only:

- `getRequirements()` returns optional `MidnightAuthorizationAction` for `MidnightBundles`;
- `buildTx()` returns `MidnightRepayWithdrawCollateralAction` with `repayAssets === 0n`.

Repay + withdraw:

- `getRequirements()` returns optional loan-token pull requirement for `MidnightBundles` (approval, ERC2612 `permit`, or Permit2 `permit2Transfer`), then optional `MidnightAuthorizationAction` for `MidnightBundles`;
- `buildTx(signatures?)` returns `MidnightRepayWithdrawCollateralAction`.

```ts
MidnightBundles.repayAndWithdrawCollateral(
  market,
  repayAssets,
  onBehalf,
  loanTokenPermit,
  collateralWithdrawals,
  receiver,
  0n,
  zeroAddress,
)
```

### Cancel offer

`getRequirements()` returns `[]`.

`buildTx()` returns `MidnightCancelOfferAction`:

```ts
Midnight.setConsumed(group, maxUint256, onBehalf)
```

## Compatibility checklist

This proposal is compatible with the current fixed-rate app flows because:

- every app `CallRequest` maps either to a `TransactionRequirement` or to `buildTx()`;
- every app `SignatureRequest` maps to `Requirement.sign(...)`;
- the `Transaction` wire shape is unchanged;
- no app builder currently needs `before` / `after` callback semantics;
- when `supportSignature` stays `false`, bundle token pulls keep the approval-transaction behavior the fixed-rate app uses today;
- when `supportSignature` is `true`, bundle token pulls can return ERC2612 `permit` / Permit2 `permit2Transfer` signature requirements, and the shared adapter forwards every collected `AnyRequirementSignature[]` to `buildTx(signatures)`;
- direct core Midnight paths still return approval transactions because they do not consume `TokenPermit`;
- EOA maker flow still needs exactly one offer-root signature, selected from the collected signature list;
- contract-wallet maker flow needs zero signatures and one ratify-root tx;
- EOA maker signatures and token signatures can be surfaced before transaction requirements, preserving the fixed-rate app's current signature-before-calls UX;
- repay / withdraw keeps the app's existing single final `MidnightBundles.repayAndWithdrawCollateral(...)` transaction;
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

**Why rejected:** make-borrow collateral + loan cannot be expressed safely because the collateral supply must execute before the mempool submit transaction. Integrators would need bespoke sequencing outside the SDK, which defeats the migration goal.

### Alternative 4: Keep Midnight Permit / Permit2 deferred

Keep approval-only Midnight bundle flows for the initial migration and add token permits later behind another interface change.

**Why rejected:** this would make Midnight diverge from Blue even though the fixed-rate app already has a `signatureRequests` array. A source-compatible `buildTx(signatures?: AnyRequirementSignature | readonly AnyRequirementSignature[])` shape lets the shared adapter pass all collected signatures, keeps app changes centralized, and uses the `TokenPermit` slots already present on the Midnight bundle ABI.

## Implementation phases

- **Phase 1 — Shared action-flow types / interfaces.** Add `ActionRequirement`, `TransactionRequirement`, widened `Requirement` / `RequirementSignature` unions, Midnight action interfaces, and type guards. This is the compatibility layer that lets the fixed-rate app keep its existing `ActionFlow` signature / call collection model while consuming SDK-built Midnight flows. Existing Blue / MarketV1 / vault methods keep their narrow return types.
- **Phase 2 — Requirement helpers.** Export / reuse `getRequirementsApproval` with explicit spender; add Midnight token-pull, authorization, and ratifier helpers.
- **Phase 3 — Pure action encoders.** Add `src/actions/midnight/*` encoders for final txs and prelude txs. Every encoder returns a deep-frozen `Transaction` and has colocated unit tests.
- **Phase 4 — Entity methods.** Add `MorphoMidnight` methods that perform RPC/off-chain reads, router validation, amount math, group generation, and return `{ getRequirements, buildTx }`.
- **Phase 5 — Integration tests.** Fork-test each flow shape: no requirement, approval reset, missing authorization, EOA root signature, contract-wallet ratify-root, mandatory prelude txs, and cancel offer.
- **Phase 6 — Docs / changeset.** Update package `AGENTS.md`, generated docs/JSDoc, README snippets, and add a minor changeset when code lands.

## Security

- **No blind signing beyond the protocol's intended root signature.** The SDK must build the offer tree locally from the SDK input and validate the router response before exposing `midnightOfferRootSignature`. The wallet signs only the root produced from those local offers.
- **No signing inside actions.** `Requirement.sign(...)` is the only signing boundary and takes a `WalletClient` from the integrator.
- **No hidden prelude txs.** Mandatory prelude transactions are visible in `getRequirements()` as typed `Transaction` values.
- **Authorization target is explicit.** `MidnightAuthorizationAction.args.authorized` is either `MidnightBundles`, `EcrecoverRatifier`, or `SetterRatifier`; never inferred by a consumer.
- **Approval target is explicit.** Midnight approval helper callers pass `spender`; no default to `GeneralAdapter1`.
- **Typed errors only.** SDK-owned router / mempool validation, invalid protocol inputs, no credit, and insufficient withdrawable liquidity each get exported typed errors before implementation lands. App-owned preflights may keep app-specific user-facing errors.

## Future considerations

- If a future Midnight flow needs a real wait condition (`before` / `after` equivalent), add a small `wait` requirement kind at that time. Do not preemptively port app `ActionFlow`.
- If consumers strongly reject mandatory prelude transactions inside `getRequirements()`, revisit `buildTxs()` with evidence from integration feedback.

## References

- `packages/morpho-sdk/src/types/action.ts` — current `Transaction`, `Requirement`, and action unions.
- `packages/morpho-sdk/src/actions/requirements/getRequirements.ts` — current GeneralAdapter1-oriented requirement helper.
- `packages/morpho-sdk/src/actions/requirements/getRequirementsApproval.ts` — lower-level approval helper to reuse with explicit spender.
- `packages/midnight-sdk/src/signatures/{Group,Tree,Payload,EcrecoverRatifierUtils,SetterRatifierUtils}.ts` — existing framework-free Midnight group, tree, payload, and ratifier utilities that the hypothetical `morpho-sdk` flows should reuse or mirror.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/lend-market/buildLendMarketOrderActionFlow.ts` — lend-market app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/borrow-market/buildBorrowMarketOrderActionFlow.ts` — borrow-market app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/lend-limit/buildLendLimitOrderActionFlow.ts` and `lib/modules/offer/buildMakeOffersActionFlow.ts` — lend-limit / OCA app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/borrow-limit/buildBorrowLimitOrderActionFlow.ts` — borrow-limit app flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/order/actions/limit-order.utils.ts` — ratifier detection, root signing, and mempool submit.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/position/actions/redeem/buildRedeemActionFlow.ts` — redeem flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/position/actions/repay-withdraw/buildRepayWithdrawActionFlow.ts` — repay / withdraw collateral flow.
- `morpho-org/morpho-apps/apps/markets-app/lib/modules/offer/actions/buildCancelOfferActionFlow.ts` — cancel offer flow.
- `morpho-org/midnight/src/Midnight.sol` and `src/interfaces/IMidnight.sol` — core offer, authorization, position, consumed, repay, withdraw, and collateral semantics.
- `morpho-org/midnight/src/periphery/MidnightBundles.sol` and `src/periphery/interfaces/IMidnightBundles.sol` — bundled taker and repay / withdraw entry points used by the fixed-rate app.
- `morpho-org/midnight/src/ratifiers/EcrecoverRatifier.sol` and `src/ratifiers/SetterRatifier.sol` — maker root-signature and ratify-root consent paths.
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §2 (forbidden patterns), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
