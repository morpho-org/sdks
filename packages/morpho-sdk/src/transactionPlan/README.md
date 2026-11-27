# TransactionPlan

TransactionPlan prepares immutable, serializable recipes for Vault V1 and V2 deposits, asset withdrawals and
exact-share redemptions, plus Vault V1 to V2 migrations, Vault V2 forced asset exits and force redemptions,
Blue supply, collateral, borrow, repay, withdrawal, BlueBuyCallback withdrawal and refinance operations, redeeming Midnight credit, withdrawing Midnight collateral, repaying Midnight debt
with optional collateral withdrawals (directly or through borrow offers), and publishing Midnight
maker borrow, lend, withdrawal and repayment offers.
Maker borrow publication can also supply collateral in the same transaction, and maker lend
publication can park loan assets on Blue for a BlueBuyCallback.
Midnight taker borrows can fill a lend-side quote against existing collateral or supply
new collateral in the same bundle.
Consumers own the client, wallet, storage and submission.
The SDK does not sign or retain a client in a plan. Stable entity handles remain the recommended path
during beta. See the [package guide](../../README.md#transactionplan-sign-and-verify-permits)
for signature attachment and transaction building.

## Midnight fixed-rate lends

`prepareMidnightTakeLend` takes a caller-fetched `marketData` snapshot, an assets target with a
unit floor or a units target with an asset cap, and the ordered ABI-ready offers from the
caller's quote. It validates them like the entity `takeLend`: a fee cap below the market fee,
unfillable offers and unreachable targets throw, and on an assets target an offer is dropped only
when its price would revert the bundle at every time up to the deadline, so simulate before
sending. The recipe stores the market tuple, fills, fee bounds,
optional `nativeAssets`, and the onchain deadline (at most one hour from preparation), which
`parseTransactionPlan` and the build functions require to equal the plan's `expiresAt`. A
wrapped-native loan token still needs allowance for the full maximum pull when paying some or
all of it in native currency.

The plan adds a token approval and Midnight bundle authorization only when needed.
Neither uses signatures. Decode the calldata to check that it matches the intended
transaction. Before sending, simulate the steps in order from the plan's account on
the plan's chain to catch offers that have expired, been cancelled, or already been
consumed. Building or inspecting the calldata offline cannot detect those changes.

## Midnight fixed-rate borrows

`prepareMidnightTakeBorrow` takes an assets target with a unit cap or a units target with
an asset floor. Supply lend-side fills from the quote, a hydrated market and a borrower
position from the same market, and collateral oracle prices from the snapshot block.
Preparation checks the borrower and market binding, buffered collateral capacity and fill
feasibility. Like the entity check, fill feasibility counts units at par and does not price
discounted bids after settlement fees, so a plan can pass preparation and still revert
onchain; the onchain bounds keep funds safe, and simulation catches the revert.
The plan stores only the market tuple, selected fills, target, fee, receiver
and onchain deadline (at most one hour from preparation); it does not retain the snapshots.

The bundle uses the sender's existing credit first. Borrowed assets go to the sender unless
you supply an alternate receiver; any new debt belongs to the sender. If needed, the plan
places a standalone Midnight bundle authorization before the borrow. There are no token
approvals or signature requests. Restore and build without RPC, then simulate and submit in
order from the plan account. Offline building does not refresh the health or fill checks.

`prepareMidnightSupplyCollateralTakeBorrow` produces a `midnightSupplyCollateralTakeBorrow`
step for a nonempty list of collateral supplies and the same lend-side quote and targets.
Fetch the position, market, and oracle prices before supplying collateral, at the same block.
Preparation adds the proposed supplies only for the health check; the stored recipe holds
the supplies and optional native funding, not the snapshots. Repeated collateral indexes are
summed, as in the entity flow. An empty list throws
`EmptyMidnightCollateralSuppliesError`; an unconfigured index throws
`UnknownCollateralIndexError`; a borrow above the buffered limit throws
`BorrowExceedsSafeLtvError`. Parsing a stored plan reruns the same supply and native funding
checks and reports a failure as `InvalidTransactionPlanError`.

The plan reuses sufficient allowances and existing bundle authorization. Otherwise it adds
ERC-20 approvals to MidnightBundlesV2 and standalone Midnight authorization before the bundle.
Even with native ETH funding the allowance must cover the full wrapped-native pull. The plan
does not request signatures. Submit the steps from the plan account; the supply and borrow
are atomic, but approvals and authorization may remain if the bundle fails.

`prepareMidnightTakeWithdraw` exits the account's Midnight credit. Supply the market and
owner-bound position snapshots from the same block, plus lend-side fills. An assets target
sets the exact net proceeds and a maximum number of credit units; a units target sets the
exact units to spend and minimum net proceeds. The bundle first redeems at par up to the
account's credit and the market's available liquidity, then sells the remaining target into
the supplied offers. It reverts rather than opening debt. Proceeds go to the account unless
you specify a receiver. Expiry defaults to one hour and is enforced onchain. Like the entity
check, fill feasibility counts units at par and does not price discounted bids after
settlement fees, so a plan can pass preparation and still revert onchain; the onchain bounds
keep funds safe, and simulation catches the revert.

The plan adds standalone Midnight bundle authorization only if needed. It contains no token
approvals, signature requests or position snapshots. Restore and build it offline, then
simulate against current credit, liquidity and offer state before sending from the plan account.

## Midnight repayment through borrow offers

`prepareMidnightTakeRepayWithdrawCollateral` produces a `midnightTakeRepayWithdrawCollateral`
step. Pass the borrow-side fills from a Midnight book quote (`side: "asks"`), plus the
borrower's market, position and collateral prices from the same block. An assets target
sets the assets to pay and a minimum debt-unit reduction; a units target sets the debt
units to repay and a maximum asset cost. Use `maxUint256` units for the whole debt.
The bundle fills offers first, repays the unfilled remainder directly at par when
`repayEnabled` is true, then withdraws collateral to `collateralReceiver` (the account by
default). Without direct repayment, the offers must meet the target on their own.

Expiry defaults to one hour after the reference time and is enforced onchain. An explicit
`expiresAt` more than one hour after that time throws `MidnightTakeDeadlineTooFarError`.

An empty quote throws `EmptyMidnightTakeableOffersError`; offers from another market throw
`MidnightTakeableOfferMarketMismatchError`. A quote that cannot meet the target can throw
`MidnightTakeableOffersNotFillableError` or `MidnightTakeTargetUnreachableError`.
Preparation rejects a position owned by another account (`AccrualPositionUserMismatchError`),
a blocked collateral receiver (`MidnightContractReceiverError`), and withdrawals that leave
too little collateral (`WithdrawMakesPositionUnhealthyError`). This preparer takes encoded
fills, not a maker tree; maker mismatch and Rate V1 rate and tick errors apply when creating
or publishing the tree, not when restoring or building this repayment recipe.

The plan adds ERC-20 approval for any insufficient allowance and standalone bundle authorization
only as needed. Even with native ETH funding, allowance must cover the full wrapped-native pull.
There are no signature requests. The plan stores the fills and transaction inputs, not the
snapshots; simulate the restored steps before sending from the plan account to catch
cancellations, consumption or other changes since the quote.

## Midnight maker borrow offers

`prepareMidnightMakeBorrow` publishes resting sell offers through MidnightBundlesV2. It activates
a PriceRatifierV1 or RateRatifierV1 root for the sender and can cancel older groups in the same
bundle. Publication neither supplies collateral nor creates debt; the offers can only create debt
later if filled. Use non-reduce-only offers with no callback and the sender as both maker and seller
receiver. Cancelled groups must not appear in the new tree.

The SDK checks the connected chain, registered deployments and the offers' onchain state during
preparation. By default it also validates the tree with the Midnight API. Pass `validation: false`
to skip HTTP, for example on a peer-to-peer market that the API does not admit. Local checks still run.
An empty tree request throws `InvalidTreeError` (available from `@morpho-org/morpho-sdk/midnight/errors`).

```ts
import {
  buildTransactions, parseTransactionPlan, prepareMidnightMakeBorrow, serializeTransactionPlan,
} from "@morpho-org/morpho-sdk";
import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function buildPublication(maker: Address, sellOffers: readonly Offer[]) {
  const client = createPublicClient({ chain: base, transport: http() });
  // sellOffers is your proposed list of sell offers, each using the Base PriceRatifierV1.
  const offers = Tree.create({ type: "priceV1", entries: sellOffers.map(offer => ({ offer })) });
  const plan = await prepareMidnightMakeBorrow(client, {
    chainId: base.id, account: maker, offers, now: (await client.getBlock()).timestamp,
  });
  // Simulate, then send in order from maker on Base.
  return buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
}
```

The stored recipe carries the root, opaque encoded payload, ratifier route and address,
publication and cancellation groups, and the bundle deadline. `expiresAt` defaults to the earlier
of two hours after `now` and one second before the earliest offer expiry. The bundle accepts
execution at its deadline, so an explicit `expiresAt` at or after the earliest offer expiry
throws `InputExceedsMaxError` while every offer is still live at `now`. Local deadline checks run first: a positive `expiresAt` at or before `now` throws
`ExpiredDeadlineError` before any read, and so does a default deadline when the earliest offer
expires one second after `now`. Choose a later `expiresAt` only when the earliest offer expires
more than one second after `now`; otherwise rebuild the tree. Once those checks pass, the offers
are checked at the pinned block in tree order and the first failing check wins. An offer that has
expired at the pinned block throws `MidnightOfferExpiredError`. An offer that has expired at `now`
but is still live at the pinned block throws `ExpiredDeadlineError`, but only after every pinned
check passes. In both cases rebuild the offer tree rather than choosing a new `expiresAt`. Restoring and building do not need the tree,
RPC or a root signature. They check the stored recipe, not the authenticity or current validity of
the unsigned offers. Restore only plans from a trusted source and simulate before sending.
The action type is not bound to the payload: `midnightMakeBorrow`, `midnightMakeLend`,
`midnightMakeWithdraw` and `midnightMakeRepay` store the same recipe, so a stored step whose type
is changed to another of them still restores and builds the same calldata. Restore also does not check that the stored
`root` commits to the payload: it checks only the ratifier, ABI shape and bounds, and the bundle
activates `root` as a separate argument, so a tampered plan can pair a harmless payload with a
root for other offers. To know which offers a restored plan publishes, compare it with the trusted
original tree, or decode the payload with `Payload.decode` (from
`@morpho-org/morpho-sdk/midnight/utils`), recover each leaf's `allowedTaker` (and `rate` for
`rateV1`) with `PriceRatifierV1.decodeRatifierData` or `RateRatifierV1.decodeRatifierData`,
and rebuild the tree with `Tree.create`. Then confirm that its `root` equals the stored `root`
and that every offer names the stored `ratifier`. Do not trust the step type, label or the root
inside each item's ratifier data.

There are no token approvals or signature requests. If needed, send the standalone Midnight bundle
authorization before the publication. The bundle also authorizes the ratifier over the maker's
Midnight account. Both grants persist until revoked; the publication deadline does not expire
either grant, and a failed publication does not undo the standalone grant.

## Midnight maker lend offers

`prepareMidnightMakeLend` publishes non-reduce-only buy offers with no callback through
MidnightBundlesV2. The sender must be the maker and every market must use the specified loan
token. The bundle activates the root and can cancel previous groups, but does not pull or park
loan assets or fill any offer. Midnight core pulls loan tokens from the maker at fill time.
There is no approval to the bundle and no native ETH input; for wrapped native markets the
maker needs the ERC-20 balance when the offer fills.

```ts
import {
  buildTransactions, parseTransactionPlan, prepareMidnightMakeLend, serializeTransactionPlan,
} from "@morpho-org/morpho-sdk";
import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function buildLend(maker: Address, loanToken: Address, buyOffers: readonly Offer[]) {
  const client = createPublicClient({ chain: base, transport: http() });
  // Build a tree from the maker's proposed buy offers, each using the Base PriceRatifierV1.
  const offers = Tree.create({ type: "priceV1", entries: buyOffers.map(offer => ({ offer })) });
  const plan = await prepareMidnightMakeLend(client, {
    chainId: base.id, account: maker, offers, loanToken,
    loanAssets: 1_000_000n, reservedLoanAssets: 500_000n,
    now: (await client.getBlock()).timestamp,
  });
  // Simulate, then send in order from maker on Base.
  return buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
}
```

Preparation checks allowance to Midnight core against `loanAssets + reservedLoanAssets`,
in loan-token base units. Count a group's budget once for alternative offers and exclude
cancelled groups from the reserve. This threshold does not set fill caps or verify the maker's
balance. If allowance is insufficient, the plan adds a standalone ERC-20 approval
(`maxUint256`, subject to the token's cap). Only the approval step stores the token, spender
and approval amount; the allowance threshold and reserve are not publication inputs.
For the tokens on the SDK's approve-once allowlist, today Ethereum USDT and CRV, a positive but
insufficient allowance is first reset with a zero-amount approval step before that approval.
Other tokens that require a reset get no zero-amount step.
Existing allowance and bundle authorization are reused. There are no signature requests.
The approval and bundle grant remain in force even if publication fails or the plan expires.
The grant the bundle gives the ratifier also persists until revoked.

The publication recipe and deadline follow the [maker borrow rules](#midnight-maker-borrow-offers):
restore and build from the opaque payload without the tree or a root signature. The deadline
defaults to the earlier of two hours after `now` and one second before the earliest offer expiry;
an explicit deadline at or after offer expiry throws `InputExceedsMaxError` while every offer is still live at `now`.
Local deadline checks run first: a positive `expiresAt` at or before `now` throws
`ExpiredDeadlineError` before any read, and so does a default deadline when the earliest offer
expires one second after `now`. Choose a later `expiresAt` only when the earliest offer expires
more than one second after `now`; otherwise rebuild the tree. Once those checks pass, the offers
are checked at the pinned block in tree order and the first failing check wins. An offer that has
expired at the pinned block throws `MidnightOfferExpiredError`. An offer that has expired at `now`
but is still live at the pinned block throws `ExpiredDeadlineError`, but only after every pinned
check passes. In both cases rebuild the offer tree rather than choosing a new `expiresAt`. An empty or invalid
tree throws `InvalidTreeError` (from `@morpho-org/morpho-sdk/midnight/errors`). Wrong side,
reduce-only, wrong maker and mismatched loan token throw `MidnightOfferSideMismatchError`,
`MidnightOfferReduceOnlyError`, `MidnightOfferMakerMismatchError` and
`MidnightOfferMarketLoanTokenMismatchError`, respectively; as in the entity `makeLend`, the loan
token is compared after the offer-state reads and mempool validation. Malformed cancellation groups
throw `InvalidMidnightHexInputError` and cancellation overlap throws
`MidnightReplacementGroupCancelledError`, both before any RPC or API call. Pass `validation: false`
to skip only the optional mempool API call.

## Midnight maker withdrawal offers

`prepareMidnightMakeWithdraw` publishes resting reduce-only sell offers through MidnightBundlesV2
without reducing credit or transferring loan tokens. The maker receives proceeds only if a taker
later fills an offer. The bundle activates a PriceRatifierV1 or RateRatifierV1 root for the sender
and can cancel previous groups in the same transaction.

```ts
import {
  buildTransactions, parseTransactionPlan, prepareMidnightMakeWithdraw, serializeTransactionPlan,
} from "@morpho-org/morpho-sdk";
import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function buildExit(maker: Address, exitOffers: readonly Offer[]) {
  const client = createPublicClient({ chain: base, transport: http() });
  // Use the maker's proposed reduce-only sell offers naming the Base PriceRatifierV1.
  const offers = Tree.create({ type: "priceV1", entries: exitOffers.map(offer => ({ offer })) });
  const plan = await prepareMidnightMakeWithdraw(client, {
    chainId: base.id, account: maker, offers, now: (await client.getBlock()).timestamp,
  });
  // Simulate, then send in order from maker on Base.
  return buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
}
```

The sender must be the maker and seller receiver, with current credit in every offer's market.
A buy offer, a non-reduce-only offer, or a market without maker credit fails with
`MidnightOfferSideMismatchError`, `MidnightOfferNotReduceOnlyError`, or `MidnightOfferNoCreditError`,
respectively. An empty tree throws `InvalidTreeError` (from `@morpho-org/morpho-sdk/midnight/errors`).
Cancelled groups must not appear in the new tree. Set `validation: false` to skip the Midnight
API call, not the onchain checks.

As with [maker borrow offers](#midnight-maker-borrow-offers), the bundle deadline is strictly
before the earliest offer expiry. The default is two hours from `now` or one second before
that expiry, whichever is earlier. Build a trusted saved recipe from its opaque payload
without the API, tree, cache or root signature. There are no token approvals or signature
requests. The standalone bundle authorization, if needed, and the ratifier grant both
persist until revoked, even after the plan expires.

## Midnight maker repayment offers

`prepareMidnightMakeRepay` publishes resting reduce-only buy offers through MidnightBundlesV2.
It activates a PriceRatifierV1 or RateRatifierV1 root for the sender and can cancel old groups
atomically. Publication does not reduce debt or transfer tokens. Only a later fill can reduce debt.

```ts
import {
  buildTransactions, parseTransactionPlan, prepareMidnightMakeRepay, serializeTransactionPlan,
} from "@morpho-org/morpho-sdk";
import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function buildRepayOffers(maker: Address, loanToken: Address, exitOffers: readonly Offer[]) {
  const client = createPublicClient({ chain: base, transport: http() });
  // Build the tree from the maker's proposed reduce-only buy offers for Base PriceRatifierV1.
  const offers = Tree.create({ type: "priceV1", entries: exitOffers.map(offer => ({ offer })) });
  const plan = await prepareMidnightMakeRepay(client, {
    chainId: base.id, account: maker, offers, loanToken,
    loanAssets: 1_000_000n, reservedLoanAssets: 500_000n,
    now: (await client.getBlock()).timestamp,
  });
  // Simulate, then send in order from maker on Base.
  return buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
}
```

The maker needs current debt in every offer market, all using the specified loan token.
A sell offer, a non-reduce-only offer, or a market without maker debt throws
`MidnightOfferSideMismatchError`, `MidnightOfferNotReduceOnlyError`, or
`MidnightOfferNoDebtError`, respectively. In a tree creation request, a sell leaf with a zero
`receiverIfMakerIsSeller` throws `MidnightOfferSellerReceiverMismatchError` (or `MidnightOfferMakerMismatchError`
if it names another maker) before the side check. An empty tree throws `InvalidTreeError` (from
`@morpho-org/morpho-sdk/midnight/errors`). Cancelled groups must not appear in the new tree.
`validation: false` skips the optional mempool API call, not the onchain checks.

As with [maker lend offers](#midnight-maker-lend-offers), preparation checks the maker's ERC-20
allowance to Midnight core for `loanAssets + reservedLoanAssets`, not their token balance.
Count each alternative group's budget once and exclude cancelled groups from the reserve. There
is no native ETH funding or approval to the bundle, even for a wrapped-native loan token.
The plan adds a standalone ERC-20 approval and Midnight bundle authorization only when needed.
These steps and the ratifier grant persist until revoked; the plan deadline does not revoke them.
There are no signature requests.

The deadline defaults to the earlier of two hours after `now` and one second before the
earliest offer expiry; an explicit `expiresAt` at or after that expiry throws `InputExceedsMaxError`
while every offer is still live at `now`. Local deadline checks run first: a positive `expiresAt` at or before `now` throws
`ExpiredDeadlineError` before any read, and so does a default deadline when the earliest offer
expires one second after `now`. Choose a later `expiresAt` only when the earliest offer expires
more than one second after `now`; otherwise rebuild the tree. Once those checks pass, the offers
are checked at the pinned block in tree order and the first failing check wins. An offer that has
expired at the pinned block throws `MidnightOfferExpiredError`. An offer that has expired at `now`
but is still live at the pinned block throws `ExpiredDeadlineError`, but only after every pinned
check passes. In both cases rebuild the offer tree rather than choosing a new `expiresAt`.
The saved publication stores the root, opaque payload, groups, cancellations, ratifier route and
deadline, not the allowance threshold or tree. Restoring and building a trusted saved plan
needs no API, tree, cache or root signature.

## Midnight Blue-backed maker lend offers

`prepareMidnightSupplyBlueMakeLend` supplies loan assets on Blue for the maker's
BlueBuyCallback, optionally cancels old groups, and activates the new PriceRatifierV1 or
RateRatifierV1 root in one MidnightBundlesV2 call. It does not fill an offer.

```ts
import {
  buildTransactions, getMidnightBlueBuyCallbackAddress, getMidnightBlueBuyCallbackData,
  parseTransactionPlan, prepareMidnightSupplyBlueMakeLend, serializeTransactionPlan,
  type MidnightSupplyBlueMakeLendPlanParams,
} from "@morpho-org/morpho-sdk";
import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function buildBlueBackedLend(
  inputs: Pick<MidnightSupplyBlueMakeLendPlanParams, "account" | "blueMarket" | "callbackSalt">,
  createBuyOffers: (route: Pick<Offer, "callback" | "callbackData">) => readonly Offer[],
) {
  const client = createPublicClient({ chain: base, transport: http() });
  // The maker's strategy creates buy offers naming Base PriceRatifierV1 and this callback route.
  const offers = Tree.create({ type: "priceV1", entries: createBuyOffers({
    callback: getMidnightBlueBuyCallbackAddress({
      chainId: base.id, owner: inputs.account, salt: inputs.callbackSalt,
    }),
    callbackData: getMidnightBlueBuyCallbackData(inputs.blueMarket),
  }).map(offer => ({ offer })) });
  const plan = await prepareMidnightSupplyBlueMakeLend(client, {
    ...inputs, chainId: base.id, offers, assetsToPark: 1_000_000n,
    now: (await client.getBlock()).timestamp,
  });
  // Simulate and send the restored steps in order from inputs.account on Base.
  return buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
}
```

An empty tree throws `InvalidTreeError`; each offer must name the submitting maker or
preparation throws `MidnightOfferMakerMismatchError`. Every offer must use the selected market's
loan token, the maker's callback derived from the bytes32 salt, and the exact ABI-encoded
Blue market parameters. Mismatches throw `MidnightOfferMarketLoanTokenMismatchError`,
`MidnightOfferCallbackMismatchError`, or `MidnightOfferCallbackDataMismatchError`.
Rate V1 requests can throw `InvalidMidnightRateRatifierV1RateError` for a negative rate or
`InvalidMidnightRateRatifierV1TickError` for a tick below the minimum. `validation: false`
skips optional mempool admission, not route, cancellation, or onchain validation.
Preparation runs the entity `supplyBlueMakeLend` checks through a plan-side constructor:
every check above, plus the salt, parking amount and native funding, runs before any RPC read
or mempool API call.

The Blue market must already have supply shares, and the parking amount must mint nonzero
shares in the preview, which reads the Blue market at the block the offer-state reads are pinned
to, after their checks, and accrues it to that block's timestamp. For IRMs the SDK cannot
project, the preview uses the
market's last-updated totals without accruing interest. The bundle does not enforce a minimum share amount at execution.
Optional `nativeAmount` in wei can cover at most the parking amount and is available only when
the Blue loan token is wrapped native. The plan checks the allowance to MidnightBundlesV2 for
the **full** parking amount, even with native funding, and never adds a loan-token approval
to Midnight core. A short allowance gets a `maxUint256` approval (capped by the SDK); any
missing approval and bundle authorization are added as separate steps.
Allowances remain until spent or revoked and operator grants remain until revoked, even if
the final bundle is never sent or fails. Publishing also authorizes the selected PriceRatifierV1
or RateRatifierV1 on the maker's Midnight account; that authorization remains until revoked,
even after the plan's deadline.

The deadline defaults to the earlier of two hours after `now` and one second before the first
offer expiry. An explicit `expiresAt` at or after that expiry throws `InputExceedsMaxError` while every offer is still live at `now`.
Local deadline checks run first: a positive `expiresAt` at or before `now` throws
`ExpiredDeadlineError` before any read, and so does a default deadline when the earliest offer
expires one second after `now`. Choose a later `expiresAt` only when the earliest offer expires
more than one second after `now`; otherwise rebuild the tree. Once those checks pass, the offers
are checked at the pinned block in tree order and the first failing check wins. An offer that has
expired at the pinned block throws `MidnightOfferExpiredError`. An offer that has expired at `now`
but is still live at the pinned block throws `ExpiredDeadlineError`, but only after every pinned
check passes. In both cases rebuild the offer tree rather than choosing a new `expiresAt`.
The saved `midnightSupplyBlueMakeLend` action stores the Blue market, parking amount, salt,
optional native value, and publication inputs including the opaque payload. Building from
trusted storage needs no API, tree, cache, or root signature.

## Midnight collateral-backed maker borrow offers

`prepareMidnightSupplyCollateralMakeBorrow` supplies collateral, optionally cancels old offer
groups, and activates a PriceRatifierV1 or RateRatifierV1 root in one MidnightBundlesV2 call.
It does not fill an offer, increase debt, or transfer loan proceeds.

```ts
import {
  buildTransactions, parseTransactionPlan, prepareMidnightSupplyCollateralMakeBorrow,
  serializeTransactionPlan,
} from "@morpho-org/morpho-sdk";
import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function buildCollateralBackedOffers(maker: Address, first: Offer, rest: readonly Offer[]) {
  const client = createPublicClient({ chain: base, transport: http() });
  // Start with the maker's proposed sell offers for this market and Base PriceRatifierV1.
  const offers = Tree.create({ type: "priceV1", entries: [first, ...rest].map(offer => ({ offer })) });
  const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
    chainId: base.id, account: maker, offers,
    // Index 0 is the lowest-address collateral token, regardless of input order.
    collateral: { market: first.market, supplies: [{ collateralIndex: 0n, assets: 1_000_000n }] },
    now: (await client.getBlock()).timestamp,
  });
  // Simulate, then send all steps in order from maker on Base.
  return buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan)));
}
```

Supply at least one entry, with positive amounts in token base units for configured
collateral indexes. Indexes are zero-based positions in ascending collateral token address
order, regardless of the input order. Repeated indexes are summed, as in the entity
`supplyCollateralMakeBorrow`; an empty list throws `EmptyMidnightCollateralSuppliesError`.
An empty tree throws `InvalidTreeError`; every offer must name the submitting maker and
the supplied market, or preparation throws `MidnightOfferMakerMismatchError` or
`MarketIdMismatchError`. Rate V1 tree requests can throw
`InvalidMidnightRateRatifierV1RateError` for a negative rate or
`InvalidMidnightRateRatifierV1TickError` for a tick below the minimum. Preparation
runs the entity's checks through a plan-side constructor. Unlike the entity, its tree, maker
and ratifier binding, cancellation, market match, collateral and native funding checks run
before any RPC read or mempool API call. The check that no offer expires after its market's
maturity (`MidnightOfferExpiryAfterMaturityError`) runs after the publication-state reads.
Pass `validation: false` to skip the API, not the onchain checks.

`nativeAmount` is optional ETH in wei, capped at the wrapped-native collateral pull
and stored as `nativeAssets`.
The plan checks allowance to the bundle for the **full** pull of each token, including
wrapped native. When allowance is below the full pull, the plan approves `maxUint256`
(capped per token by the SDK), and unused allowance remains after publication. It adds
missing ERC-20 approvals and the standalone Midnight bundle authorization before the
atomic call. A successful publication also authorizes the selected Price or Rate Ratifier
on the maker's Midnight account. That grant is not limited to the offer root and persists
after the plan deadline. Allowances remain until spent or revoked; operator
grants remain until revoked. An already-submitted approval or standalone bundle grant
can remain if the atomic call fails. There are no signatures.

The deadline defaults to the earlier of `now + 2 hours` and one second before the
earliest offer expiry. While every offer is still live at `now`, an explicit `expiresAt` at or after
that expiry throws `InputExceedsMaxError`, a conservative SDK cutoff: the core still fills an offer at its expiry second.
A deadline at or before `now` throws `ExpiredDeadlineError`, and so does one at or before the pinned
onchain timestamp while every offer is live at the pinned block. An offer already expired at
`now` skips the `InputExceedsMaxError` cap. An offer that has expired at the pinned block skips
that early deadline check, and the offers are validated in tree order, so it throws
`MidnightOfferExpiredError` unless an earlier offer fails another check first. An offer that has
expired at `now` but is still live at the pinned block throws `ExpiredDeadlineError` after the
pinned checks. In both cases rebuild the tree rather than choosing a new `expiresAt`.
The saved recipe contains the collateral tuple and supplies, optional ETH value, and
publication bytes. Building a trusted restored plan needs no API, tree, cache, or root
signature; the payload is opaque and is not revalidated against the tree offline.

## Midnight repayment and collateral withdrawal

`prepareMidnightRepayWithdrawCollateral` repays the sender's debt directly in MidnightBundlesV2,
with no offer fills or referral fee. Specify an exact `repay.assets` amount (zero for withdrawal
only) or a full repayment with a positive `repay.maxBuyerAssets` cap. Both amounts are in the loan
token's smallest units and must be below `maxUint256`. Full repayment reverts if the debt at
execution exceeds the cap. It pulls the whole cap upfront and refunds the unused part, so the
sender's loan-token balance must cover the full cap, not just the debt. For a wrapped-native
loan, ETH sent as `nativeAmount` is wrapped first and counts toward it.

Withdrawals default to none and the receiver defaults to the sender. Each `collateralIndex` is
a zero-based index into `marketData.params.collateralParams` and `positionData.collateral`;
`assets` is in that collateral token's smallest units. Use `maxUint256` to withdraw the balance
remaining at that index at execution. When withdrawing, use a nonzero receiver that is not a
blocked Midnight protocol or market token contract.

Supply the market and owner-bound position snapshots from the same block. Preparation checks
repayment bounds and collateral balances. If debt remains after a withdrawal, it checks the
remaining collateral against the buffered LLTV. Supply `collateralPrices` as the raw values from `price()` on each
`marketData.params.collateralParams[i].oracle`, indexed like `positionData.collateral` and scaled by
`ORACLE_PRICE_SCALE` (1e36). Use prices from the snapshot block. No prices are needed when there
are no withdrawals or the repayment leaves no debt in the snapshot.

The recipe stores only the market tuple, repayment, optional `nativeAssets`, withdrawals,
receiver and deadline in addition to chain and account. `expiresAt` is in Unix seconds and defaults
to two hours after `now`, normally the latest block timestamp in Unix seconds. If `now` is omitted,
the SDK falls back to the device clock; that fallback is deprecated. The bundle enforces the deadline.
For a wrapped-native loan, pass `nativeAmount` in wei (stored as `nativeAssets`), up to the exact
repayment amount or full repayment cap. Omit it or pass `0n` for no ETH funding.
The ERC-20 allowance threshold is always the full repayment amount or cap. If allowance is
insufficient, the plan requests an unlimited (`maxUint256`, capped per token by
`MAX_TOKEN_APPROVALS`) ERC-20 approval to MidnightBundlesV2. Once granted, the approval persists
after the plan expires; the deadline applies only to the bundle call. In a full repayment, any
native funding above the debt paid stays in the sender's wallet as wrapped native, not as an ETH
refund. No allowance is read for a withdrawal-only plan. A separate bundle authorization is
added only if needed; there are no signature requests. Restore and build offline; this does not
refresh the health or repayment checks. Simulate against current state, then send in order from
the plan account on the plan chain.

For example, to repay an exact amount without withdrawing collateral, use the caller-fetched
position from `block` and a positive `assets` amount in loan token base units:

```ts
import { buildTransactions, prepareMidnightRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";

const plan = await prepareMidnightRepayWithdrawCollateral(client, {
  chainId,
  account,
  marketData: positionData.market,
  positionData,
  collateralPrices: [],
  now: block.timestamp,
  repay: { type: "assets", assets },
});
const transactions = buildTransactions(plan);
// Simulate, then send in order from plan.account on plan.chainId.
```

## Field mapping: prepare → stored inputs → entity and ABI

This maps fields for vault actions, Blue supply, Midnight collateral supply, redemption, direct
repayment with collateral withdrawal, offer cancellation, and related approval steps.
Shared intent rows describe vault preparers; derived approvals carry only their listed inputs.
Shared rows apply alongside each vault action's rows, with the exceptions stated below. The stored
column means `action.inputs` unless it explicitly says **top-level plan** or **request**.
The final mapping column distinguishes stable entity/action arguments from contract ABI names;
these protocol-native names are not stored-plan aliases. Builders need not call entity handles.
Midnight take plans default `expiresAt` to one hour from preparation and reject a later expiry.

Each preparer accepts the vault once: as an accrual snapshot, a share `Token`, or an explicit
`vaultAddress` for force-redeem. Stored vault fields remain addresses, never snapshots or tokens.

Quantities are bigint base units of the underlying asset, native currency (wei), or the relevant
vault's shares. RAY prices are scaled by `1e27` (asset base units per share base unit); WAD ratios
are scaled by `1e18`. Addresses, flags, timestamps and routing data have no asset/share denomination.
An em dash means the value is not stored or not encoded, not a zero-valued argument.

| Scope / action | Prepare params | Stored fields | Stable entity/action arguments → ABI arguments | Denomination / meaning |
| --- | --- | --- | --- | --- |
| All actions | `chainId` | `chainId`; also top-level plan `chainId` | Entity factory/action vault context `chainId` → chain selection, no calldata field | Integer chain ID |
| All actions | `account` | `account`; also top-level plan `account` | `userAddress` → bundle uses `msg.sender`; force-redeem uses `onBehalf` and `redeem.recipient`; Midnight redeem and `midnightCancelOffers` use `onBehalf` | Address; signer, sender and owner are the same account, except for `midnightCancelOffers`. A Midnight route that stores its own `receiver` (redeem, collateral withdrawal, take borrow, take withdraw) or `collateralReceiver` (repay and withdraw collateral) pays it independently of `account`, so check that field on its own. `midnightCancelOffers` stores the maker whose groups are cancelled as `account` (`onBehalf`); the maker or an operator the maker authorized on Midnight may send it, so its sender can differ from `account` |
| Vault actions except migration | `vault.address` (snapshot operations), `shareToken.address` (redemptions), or `vaultAddress: Address` (force-redeem) | `vault` | Entity factory/action vault address → ABI `vault` (force-redeem instead calls that vault directly) | Address derived from the supplied snapshot/token, or supplied directly for force-redeem |
| All actions | `expiresAt?` | `deadline = BigInt(expiresAt)`; top-level plan `expiresAt` stays a number; force-redeem, direct Midnight collateral supplies, collateral withdrawals and redemption, and `midnightCancelOffers` store only top-level expiry | `deadline` → ABI `deadline`; these exceptions have no deadline argument, so their transactions stay valid after `expiresAt` | Unix seconds; defaults to two hours from preparation, except that Midnight taker actions (`midnightTakeLend`, `midnightTakeBorrow`, `midnightSupplyCollateralTakeBorrow`, `midnightTakeWithdraw`, and `midnightTakeRepayWithdrawCollateral`) default to and are capped at one hour. Midnight maker publications (`midnightMakeBorrow`, `midnightMakeLend`, `midnightMakeWithdraw`, `midnightMakeRepay`, `midnightSupplyCollateralMakeBorrow`, and `midnightSupplyBlueMakeLend`) are capped at one second before the earliest offer expiry. |
| Midnight maker lend and repay | `loanToken`, `loanAssets`, `reservedLoanAssets?` | Approval step, if needed: `token`, `spender`, `assets`; not stored in publication | `allowance(maker, midnight)` is checked against `loanAssets + reservedLoanAssets` → `approve(midnight, assets)`; no publication ABI input | Loan-token base units |
| Deposits, withdrawals, redemptions, migration, force-withdraw, Blue supply | `referralFee?.bps`, `referralFee?.recipient` | `referralFeePct`, `referralFeeRecipient` | Same names → same ABI names | Basis points → WAD ratio (`BigInt(bps) * 10n ** 14n`); recipient address; defaults to zero fee/zero address |
| In-kind exits and force-redeem | No `referralFee` param | — | — | These plans do not route referral fees |
| All actions | `calldataOrigin?` | Top-level plan `calldataOrigin`, not an input | Related entity option `metadata.origin` accepts at most 4 bytes, optionally preceded by a 4-byte timestamp; plan builder appends `calldataOrigin` directly to transaction `data`, not an ABI argument | Plan accepts any non-empty, even-length hex attribution bytes |
| Preparers with optional permit support | `supportSignature?` | Not stored as a flag; determines approval steps or permit requests | Entity option `supportSignature` → referenced signature becomes action `requirementSignature` → `assetPermit` / `sharesPermit` | Boolean, default false; SDK never signs |
| Deposits and Blue supply | `deployless?` | — | Underlying/loan-token permit metadata reads honor entity option `supportDeployless` | Optional boolean; preparation-only read strategy |
| Deposits, withdrawals, force-withdraw, in-kind exits | `vault: AccrualVault` (V1) or `vault: AccrualVaultV2` (V2) | Snapshot is not stored; its address and derived fields below are kept | Entity `vaultData` → — | One caller-fetched V1/V2 accrual snapshot, not a quantity |
| Redemptions | `shareToken: Token` (required for both V1 and V2) | Token is not stored; its address is `vault` | Share-token metadata for permit resolution → — | No accrual snapshot or asset quote; an address-only Token is sufficient for V2 |
| `vaultV2Deposit` | `assets`, `funding?: {type: "erc20" \| "native"}` | Exactly one of `assets` / `nativeAssets` | Entity/action `amount` / `nativeAmount` → `vaultBundlesV1Deposit.assets`; native funding also sets `tx.value` | Gross asset/native base units before referral fee; native asset must wrap to the vault asset |
| `vaultV1Deposit` | `assets`, `funding?: {type: "erc20" \| "native"}` | Exactly one of `assets` / `nativeAssets` | Entity/action `amount` / `nativeAmount` → `vaultBundlesV1Deposit.assets`; native funding also sets `tx.value` | Gross asset/native base units before referral fee; native asset must wrap to the vault asset |
| Both deposits | `slippageTolerance?`; `vault.asset` | Derived `maxSharePrice`; `asset` | Entity `slippageTolerance` derives action `maxSharePrice` → ABI `maxSharePriceE27`; `asset` is action vault context, not a calldata argument | WAD tolerance → RAY maximum price; asset address |
| `blueSupply` | `marketId`, `marketData`, `assets`, `funding?` | Plain `marketParams` tuple, gross `assets`, optional `nativeAssets` | Stored `nativeAssets` maps to action `nativeAmount`; `blueBundlesV1Supply` takes the market tuple and gross assets; native funding also sets `tx.value` | Exclusive native funding requires a wrapped-native loan token and sets `nativeAssets = assets` |
| ERC-2612 Blue supply request | Derived from loan-token metadata and requirements; ERC-20 funding only | Action references the request via `signatureRequestIds.tokenPermit` | `requirementSignature` supplies the encoded loan-token permit to `blueBundlesV1Supply` | Signed amount equals gross `assets`; spender is BlueBundlesV1 |
| `midnightSupplyCollateral` | `market`, `collateralIndex?`, `collateralAssets` | Plain `market` struct, `collateralIndex`, `collateralAssets`; expiry only in top-level plan `expiresAt` | Midnight core `supplyCollateral(market, collateralIndex, assets, onBehalf)`; `collateralAssets` → `assets`, `account` → `onBehalf` | Token-address order for `collateralIndex` (default `0n`); collateral token base units; expiry is not enforced onchain; no signature request |
| `midnightSupplyCollateralBatch` | `market`, `collateralSupplies` | Plain `market` struct, `collateralSupplies[]` in order; expiry only in top-level plan `expiresAt` | One Midnight core `multicall` of `supplyCollateral(market, collateralIndex, assets, onBehalf)`, in list order; `account` → `onBehalf` | Nonempty, one entry per index (duplicates rejected, not summed); positive uint128 amounts; for each token whose allowance is below its total, the approval steps to Midnight core that the token requires (usually one unlimited approval, possibly a reset to zero first or a capped amount), so run every returned step in order; no signature request |
| `midnightSupplyCollateralWithNative` | `market`, `collateralIndex?`, `collateralAssets`, `nativeAmount` | Plain `market` struct, `collateralIndex`, `collateralAssets`, `nativeAssets`, `deadline` | MidnightBundlesV2 `midnightBundlesV2CancelAndMake` with only the collateral supply: `nativeAssets` → transaction value wrapped to wNative for `account`, then the full `collateralAssets` pulled from `account` (net wNative debit `collateralAssets - nativeAssets`), credited to `account` | wNative collateral only; `0 < nativeAssets ≤ collateralAssets`; approval to MidnightBundlesV2 covers the full `collateralAssets`, with no `reservedCollateralAssets` reserve; bundle authorization added when missing; no signature request |
| `midnightWithdrawCollateral` | `marketData`, `positionData`, `collateralPrices`, `collateralIndex?`, `assets`, `receiver?` | Plain `market` struct, `collateralIndex`, resolved `assets`, `receiver`; expiry only in top-level plan `expiresAt` | Midnight core `withdrawCollateral(market, collateralIndex, assets, onBehalf, receiver)`; `account` → `onBehalf` | `maxUint256` resolves to the snapshot balance before storing; balance and buffered health are checked against the snapshot only; `receiver` defaults to the account |
| `midnightWithdrawCollateralBatch` | `marketData`, `positionData`, `collateralPrices`, `collateralWithdrawals`, `receiver?` | Plain `market` struct, resolved `collateralWithdrawals[]` in order, `receiver` | One Midnight core `multicall` of `withdrawCollateral(market, collateralIndex, assets, onBehalf, receiver)`, in list order; `account` → `onBehalf` | Nonempty, one entry per index (duplicates rejected, not summed); each `maxUint256` resolves to that index's snapshot balance; balance and buffered health are checked against the snapshot only |
| `midnightRedeem` | `positionData`, `units?`, `receiver?` | Plain `market` tuple, fixed `units`, `receiver` | Direct Midnight `withdraw(market, units, onBehalf, receiver)` | `units` defaults to accrued face value; `receiver` defaults to the account |
| `midnightCancelOffers` | `groups` | `groups` | Stored `account` → action `onBehalf`; one group → Midnight `setConsumed(group, maxUint128, onBehalf)`, two or more → one Midnight core `multicall` of those calls, in list order | Nonempty, distinct 32-byte offer groups; full cancellation, no deadline or partial amount |
| `midnightRepayWithdrawCollateral` | `marketData`, `positionData`, `collateralPrices`, `repay`, `nativeAmount?`, `collateralWithdrawals?`, `collateralReceiver?` | Plain `market` tuple, `repay`, optional `nativeAssets`, resolved `collateralWithdrawals` and `collateralReceiver`, `deadline`; no snapshots or prices | MidnightBundlesV2 buy-with-assets target for `assets`, or buy-with-units target with `targetUnits = maxUint256` and the `maxBuyerAssets` cap for `full`; both use `repayEnabled` and no offer fills. `nativeAssets` maps to transaction value and selects `wrappedNative`. | Loan and collateral token base units; native value in wei; receiver defaults to `account` |
| `vaultV2Withdraw` | `assets` | `assets` | Entity/action `amount` → `vaultBundlesV1Withdraw.assets` (ABI `shares = 0`) | Gross asset base units before referral fee |
| `vaultV1Withdraw` | `assets` | `assets` | Entity/action `amount` → `vaultBundlesV1Withdraw.assets` (ABI `shares = 0`) | Gross asset base units before referral fee |
| Both withdrawals | Snapshot quote, no explicit allowance or slippage param | Derived `requiredShareAllowance` | Used only to resolve authorization, not an ABI limit | Share base units of the withdrawing vault; not a maximum-shares bound |
| `vaultV2Redeem` | `shares` | `shares` | Entity/action `shares` → `vaultBundlesV1Withdraw.shares` (ABI `assets = 0`) | Exact vault shares burned, no minimum-assets bound |
| `vaultV1Redeem` | `shares` | `shares` | Entity/action `shares` → `vaultBundlesV1Withdraw.shares` (ABI `assets = 0`) | Exact vault shares burned, no minimum-assets bound |
| `vaultV2ForceWithdraw` | `assets`; `slippageTolerance?` | `assets`; derived `minSharePriceE27` | Entity/action `exitAssets` → ABI `exitAssets`; entity `slippageTolerance` derives action/ABI `minSharePriceE27` | Penalty-inclusive assets debited from the position; WAD tolerance → RAY minimum realized exit price |
| Force-withdraw and V2 in-kind | `adapter?` (otherwise snapshot's sole eligible adapter) | Resolved `adapter` | Entity/action `adapter` → ABI `adapter` | Adapter address |
| `vaultV2ForceRedeem` | `shares`; `deallocations[].assets` | `redeem.shares`; `deallocations[].assets` | Entity/action `redeem.shares` → vault `redeem(shares, receiver, owner)`; entity/action `deallocations[].amount` → `forceDeallocate(adapter, data, assets, onBehalf)`, before redeem, in one `multicall` | Exact vault shares; ordered asset deallocations with caller's penalty buffer; no price floor |
| Force-redeem routing | `deallocations[].adapter`, optional `deallocations[].marketParams` | Same fields, copied as plain data | `adapter` → `forceDeallocate` adapter; `marketParams` → encoded `data` (empty bytes when omitted) | Adapter address; market tuple described below |
| `vaultV2InKindRedeem` | `assets`; `marketParamsList` | `assets`; `marketParamsList` | Entity/action `amount` → `vaultExitBundlesV1InKindRedemptionVaultV2.exitAssets`; same market list → ABI `marketParamsList` | Penalty-inclusive asset base units, not shares; ordered markets |
| `vaultV1InKindRedeem` | `assets`; `marketParamsList` | `assets`; `marketParamsList` | Entity/action `amount` → `vaultExitBundlesV1InKindRedemptionVaultV1.exitAssets`; same market list → ABI `marketParamsList` | Asset base units, not shares; ordered markets |
| `vaultV1MigrateToV2` | Exactly one of `assets` / `shares` | Selected `assets` / `shares` only | Same entity/action names → `vaultBundlesV1Migrate.assetsWithdrawn` / `sharesRedeemed`; unselected ABI quantity is zero | Source-vault underlying assets (gross, before referral fee), or exact source shares |
| Migration routing / snapshots | `sourceVault: AccrualVault`, `targetVault: AccrualVaultV2` | `vault = sourceVault.address`, `sourceVault = sourceVault.address`, `targetVault = targetVault.address`; source snapshot's `asset`; snapshots not stored | Source entity factory; entity `sourceVault` / `targetVault` take snapshots; action source vault / `targetVault` → ABI `sourceVault` / `destVault`; alias `vault` and `asset` are not additional ABI arguments | Vault and common-asset addresses; one caller-fetched snapshot per vault |
| Migration bound / authorization | `slippageTolerance?`; source/target quote | Derived `maxSharePrice`, `requiredShareAllowance` | Entity quote `maxSharePriceVaultV2` is stored as `maxSharePrice`, then mapped back to action `maxSharePriceVaultV2` → ABI `destMaxSharePriceE27`; allowance quote only resolves source-share authorization | WAD tolerance → destination RAY maximum price; source-vault share allowance, not an exit bound |
| Market tuples (in-kind / force-redeem) | `loanToken`, `collateralToken`, `oracle`, `irm`, `lltv` on each market | Same five plain fields, preserving list order | Same tuple fields → ABI struct, directly or in adapter `data` | Four addresses; WAD-scaled `lltv`; no class methods or cached/derived market IDs stored |
| `erc20Approval` (derived step, no preparer) | Derived token/spender/allowance | `token`, `spender`; exactly one of `assets` / `shares`, plus shared `chainId` / `account` | Encoder `token`, `spender`, `amount` → token target and `approve(spender, value)` | Underlying-asset or vault-share base units; deposits approve assets, exits/migration approve source shares; token/spender are addresses |
| ERC-2612 deposit request (not an action input) | Derived from underlying-token metadata and requirements; ERC-20 funding only | Request `args.amount`, `args.spender`, `args.deadline`, `args.nonce`, `typedData`, optional `signature`; action references it via `signatureRequestIds.tokenPermit` | `requirementSignature` → `assetPermit = {kind: ERC2612, data: abi.encode(deadline, v, r, s)}`; no nonce or value in this tuple; gross `assets` is a separate deposit ABI argument | Asset base units; signed `value` equals gross `assets`; nonce stays in the request/typed data; spender is an address, deadline is Unix seconds; protocol-native `amount` / `value` are not renamed |
| ERC-2612 exit / migration request (not an action input; no force-redeem permit) | Derived from vault-share metadata and requirements | Request `args.amount`, `args.spender`, `args.deadline`, `args.nonce`, `typedData`, optional `signature`; action references it via `signatureRequestIds.tokenPermit` | `requirementSignature` → `sharesPermit = {value, nonce, deadline, v, r, s}`; token/owner come from typed-data domain/message and the action context | Source-vault share base units; prepared permits authorize `maxUint256`; spender is an address, deadline is Unix seconds, nonce is a counter; protocol-native `amount` / `value` are not renamed |

Native deposits still take `assets` at preparation: select `funding: { type: "native" }` to store
`nativeAssets`. The vault asset must be the chain's wrapped-native token. Deposits accept
`slippageTolerance`, which derives the stored `maxSharePrice`. Ordinary withdrawals have no on-chain
share-price or maximum-shares bound; the allowance quote is not such a bound. Redemptions burn
exact shares without enforcing minimum assets received.

V1 and V2 deposits share preparation and validation. Supply the matching caller-fetched accrual
snapshot as `vault`; the preparer derives and stores its address without retaining the snapshot.

Force-withdraw plans derive their quote through shared pure helpers; optional `slippageTolerance`
uses the entity default when omitted. The resolved `minSharePriceE27` is stored, not the tolerance. There is no raw floor
override in plan preparation. Received assets exclude penalties and any referral fee; approvals
and unlimited share permits target VaultExitBundlesV1.

Force-redeem plans fix caller-supplied deallocations before the exact-share redeem in one vault
multicall. They need no snapshot, approval or signature request. They have no share-price floor;
expiry is plan metadata, not an on-chain deadline.

Midnight redemption uses a caller-fetched accrued position. The plan stores the market tuple
and fixed units, not the snapshot. No approval or signature is required. The default units are
the accrued face value, credit minus pending fee. Before maturity, the withdrawal also cuts the
pending fee in proportion to the units withdrawn. So when a fee is pending, a default redemption
can leave some credit even when it executes at the snapshot. To empty the position then, redeem
again after maturity: fetch a fresh accrued snapshot, since the first withdrawal changed the
position, and prepare a new plan.
A full exit still depends on the market having enough withdrawable liquidity.

## Stored format and validation

Preparers emit stored format `version: 2`. Parsing rejects a version that is missing or not a safe integer with
`InvalidTransactionPlanError`, and any other safe-integer version with
`UnsupportedTransactionPlanVersionError`, before stored action fields are interpreted. Version 1
field renames are listed in the package [CHANGELOG](../../CHANGELOG.md).

`parseTransactionPlan`, inspection and builders validate structure and internal consistency and
reject stored signatures from the wrong signer offline. Permits bind owner, token, spender, value, nonce, deadline
and chain; Morpho authorizations bind owner, authorized address, nonce, deadline and chain, not
operation amounts, markets or referral fees/recipients. Integrators must protect unsigned fields;
a successful parse does not prove intent or authorize submission. Validation checks that deadlines
are no earlier than `expiresAt`, but reads no clock or live state and does not establish that the
plan is still usable onchain. `applySignatures` verifies replacements and retained signatures.

## V1 asset withdrawals

Use `prepareVaultV1Withdraw` with an `AccrualVault` snapshot from `fetchAccrualVault`.
V1 and V2 withdrawals share preparation and structural validation.
Preparation takes gross `assets` and fixes `requiredShareAllowance` before resolving share
authorization. Sufficient allowance needs no prerequisite; otherwise an unlimited share approval
or ERC-2612 permit is required. V1 permit-domain metadata comes from the snapshot; read and
metadata errors propagate. There is no Permit2 or hidden snapshot fetch. Ordinary withdrawals
accept no slippage input and have no on-chain share-price or maximum-shares bound.

Sign `getPendingSignatureRequests(plan)` externally, then use synchronous `applySignatures` to
verify and attach without RPC. Builders return plain transactions without step IDs or kinds.
The ordinary withdrawal allowance quote uses `DEFAULT_SLIPPAGE_TOLERANCE` internally.

## Shared share spending

Both redemption preparers take exact `shares` and required `shareToken: Token` metadata, not an
accrual snapshot. An address-only Token is sufficient for V2. V1 and V2 redemptions and ordinary withdrawals share
authorization preparation. Independent chain, bytecode and requirement reads run in `Promise.all`,
matching V2 withdrawal. The requirement resolver validates the RPC chain before allowance or nonce
reads, and sufficient allowance skips nonce reads. Fixed shares impose no minimum-assets bound.

Migration fixes its quote before resolving share requirements through the same concurrent helper.
Its validator uses the shared vault schema and requires `vault` to equal `sourceVault`. Format-2
migration plans store the derived price bound as `maxSharePrice`.
Migration takes `sourceVault: AccrualVault` and `targetVault: AccrualVaultV2`, storing only their
addresses. It rejects different underlying assets or identical vault addresses. It has no `deployless`
option because its share-authorization reads do not use deployless calls.

V1 and V2 in-kind exits prepare and store `assets`, then map to the stable entity/action `amount`
(ABI `exitAssets`). They take a single `vault` snapshot (`AccrualVault` for V1, `AccrualVaultV2` for V2) and no `deployless`
option. They
have no share-price or maximum-shares bound. New in-kind plans use stored format 2, and their
share approvals use `shares`.
