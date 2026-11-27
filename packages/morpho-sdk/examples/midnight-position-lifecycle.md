# Store and resume a Midnight position lifecycle

The [consumer example](./midnight-position-lifecycle.ts) prepares a borrower's
collateral supply and borrow offer, a lender's partial fill of that offer, the
borrower's cancellation and full repayment (with collateral withdrawal), and the
lender's redemption. The fill is derived from the published tree (`offerIndex`
picks the offer, default 0), so all six plans act on one position. Before the
first plan, the recipe checks that `fillUnits` covers a units target's `units`, or
the larger of an assets target's `assets` and `minUnits`, and that the selected
leaf's `allowedTaker` is either the zero address or `lend.account`, and that
`lend.account` is not `supply.account`, since Midnight rejects a self-take. It
also checks that `maxRepayAssets` is a bigint from 1 to `maxUint256 - 1`, the range
the full repayment accepts, and that the default read budget of both clients (see
below) is a positive safe integer, so a `pollingInterval` of 0 fails before any
collateral is supplied. Other lend checks run only
when the lend plan is prepared, after the offer is published; if one fails, the
recipe stops before its cancellation plan, so cancel the published groups with
`prepareMidnightCancelOffers` yourself. With an open leaf (zero `allowedTaker`),
anyone can fill the offer while the recipe waits, and cancelling only consumes the
groups: it does not repay a fill that already landed. Once the cancellation
confirms, fetch the borrower's position and call
`prepareMidnightRepayWithdrawCollateral` to repay any outstanding debt and withdraw
the collateral. Decide from that position, not from whether this offer filled,
since another live offer in the market can add debt: only when its debt is zero,
pass `repay: { type: "assets", assets: 0n }` with the collateral withdrawal to get
the collateral back; otherwise repay the debt in the same call.
Preparing the borrow publication can itself fail after the collateral supply
confirms, for example when the earliest offer expiry passes while the supply is
confirming. Nothing is published then, so skip the cancellation: fetch the
borrower's position with `fetchAccrualPosition` from
`@morpho-org/morpho-sdk/midnight/fetch` and call
`prepareMidnightRepayWithdrawCollateral` the same way, repaying any debt that
another live offer added or, with no debt, passing
`repay: { type: "assets", assets: 0n }` with the collateral withdrawal. The repayment
withdraws the whole collateral balance at `collateralIndex`, so the recipe assumes
a fresh position; to keep existing collateral, change the example's withdrawal to an
explicit amount. The redemption likewise redeems the lender's whole accrued face
value in the market, not only the credit from this fill, so the recipe also assumes
a fresh lender position: existing credit is redeemed too, and the redemption fails
if the market's liquidity covers this fill but not the whole position. To keep
existing credit, pass explicit `units` to the example's redemption. `maxRepayAssets` is compared with the debt only when the
repayment is prepared, after the fill and cancellation have landed. The full
repayment reads the borrower's total debt in the market, so size the cap to cover
all of it at that point. Restricting every leaf's `allowedTaker` to `lend.account`
only controls who can fill this tree; it does not isolate the debt. A cap of the
filled units is enough only for a fresh position whose leaves are all restricted
that way, while the borrower has no other live offers in the market: another
offer that fills during the run adds to the debt and makes the repayment reject
that cap. An open leaf (zero `allowedTaker`) lets anyone fill the tree before the
cancellation lands, so with an open tree, size the cap and the borrower's
loan-token funding to every fill the tree allows.
The cap limits what the repayment spends but does not supply the tokens: a
discounted borrow offer pays the borrower fewer loan tokens than the debt it
creates, so hold enough extra loan tokens to cover that shortfall before starting.
The fork fixture fills a par offer, so its proceeds cover the debt.
Midnight cancels offers by
maker and group ID, and the recipe cancels every group in the published tree, so
use group IDs reserved for this lifecycle: a group shared with another live offer
is cancelled too. It uses the experimental TransactionPlan exports from
`@morpho-org/morpho-sdk` with two ordinary viem clients.

The example yields one plan at a time. Use `storeAndBuildMidnightPlan` with
integrity-protected storage to save and reload the plan, then build without a
client. Parsing checks structure, not authenticity. Before submitting, verify
each rebuilt transaction against the trusted original intent, including its
recipient, amount and destination contract, as well as the wallet, network
and expiry. Send the transactions in order. Require each receipt to have
`status === "success"` before sending the next transaction or requesting the
next plan. Wait for each receipt through the client that signed the plan. When
the other client takes the next snapshot (the lend, repayment and redemption
plans), the recipe first waits until that client's reads reach the signing
client's latest block, so an RPC that lags behind cannot pin the snapshot before
the preceding transaction. The recipe reads that block number from the signing
client rather than from the receipt, so the signing client's reads must never fall
behind a receipt it has already returned. A load-balanced signing RPC whose
backends disagree on the head breaks this: it can return the receipt from one
backend and an older head from another, which sets the floor below the confirmed
transaction. Pin such a client to one backend, or use one that guarantees
read-your-writes.

The wait is bounded by a number of block reads, not by elapsed time: by default
`Math.ceil(60000 / pollingInterval)` reads, about a minute at the client's polling
interval when reads are fast. Each read adds its own RPC time, and per-request
timeouts come from the client's transport. When the reads run out, the recipe
throws an error naming the required block and the last block it saw, and what is
left to undo depends on where it stopped:

- Before the lend snapshot, the collateral is supplied and the borrow offers are
  live. Cancel the published groups with `prepareMidnightCancelOffers`. With an
  open leaf, someone may have filled the offer before the cancellation landed, so
  once it confirms, fetch the borrower's position and call
  `prepareMidnightRepayWithdrawCollateral` to repay any outstanding debt and
  withdraw the collateral. Only when the fetched position has no debt, pass
  `repay: { type: "assets", assets: 0n }` with the collateral withdrawal;
  otherwise repay the debt.
- Before the repayment snapshot, the offers are already cancelled but the debt
  from the fill is open. Repay it with `prepareMidnightRepayWithdrawCollateral`.
- Before the redemption snapshot, the borrower has repaid and the lender still
  holds the position. Redeem it with `prepareMidnightRedeem`.

Each snapshot is read at that explicit block number. Before the first plan, the recipe also checks that both
clients declare and serve `supply.chainId`, so a client on another chain fails
before any collateral is supplied.
Midnight uses onchain approvals and authorization, not plan signature requests.
The fork fixture supplies a price-ratified offer tree and its fill proof
directly; it does not use an external offer validation service.

Run the example through its [fork test](../test/e2e/transactionPlan/midnightPositionLifecycle.integration.test.ts).
With Anvil installed (see the fork prerequisites in
[CONTRIBUTING](../../../CONTRIBUTING.md)), set `BASE_RPC_URL` to a Base archive RPC or provide
`ERPC_SECRET` for Morpho's eRPC fallback. Run from the repository root:

```sh
bun run test run --project morpho-sdk-fork packages/morpho-sdk/test/e2e/transactionPlan/midnightPositionLifecycle.integration.test.ts
```

The runner submits only to local Anvil, forked at Base block **53,550,000**.
It verifies stable step IDs, no signature requests, identical rebuilt
transactions, and onchain state after each operation.

## Operation proofs

The lifecycle covers one route. The operation suites remain the place to check
alternate funding, authorization and offer branches:

| Operation | Focused fork proof |
| --- | --- |
| Supply collateral | [midnightSupplyCollateral](../test/e2e/transactionPlan/midnightSupplyCollateral.integration.test.ts) |
| Publish borrow offer | [midnightMakeBorrow](../test/e2e/transactionPlan/midnightMakeBorrow.integration.test.ts) |
| Fill with a lend plan | [midnightTakeLend](../test/e2e/transactionPlan/midnightTakeLend.integration.test.ts) |
| Cancel offer capacity | [midnightCancelOffers](../test/e2e/transactionPlan/midnightCancelOffers.integration.test.ts) |
| Repay and withdraw collateral | [midnightRepayWithdrawCollateral](../test/e2e/transactionPlan/midnightRepayWithdrawCollateral.integration.test.ts) |
| Redeem | [midnightRedeem](../test/e2e/transactionPlan/midnightRedeem.integration.test.ts) |
