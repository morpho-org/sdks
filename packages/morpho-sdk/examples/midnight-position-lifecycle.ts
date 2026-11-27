import {
  buildTransactions,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  MidnightOfferMakerMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
  NonIntegerInputError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareMidnightCancelOffers,
  prepareMidnightMakeBorrow,
  prepareMidnightRedeem,
  prepareMidnightRepayWithdrawCollateral,
  prepareMidnightSupplyCollateral,
  prepareMidnightTakeLend,
  serializeTransactionPlan,
  type TransactionPlan,
  validateClientChainId,
} from "@morpho-org/morpho-sdk";
import type { Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { RatifierV1TakerNotAllowedError } from "@morpho-org/morpho-sdk/midnight/errors";
import {
  fetchAccrualPosition,
  fetchMarket,
} from "@morpho-org/morpho-sdk/midnight/fetch";
import {
  MarketUtils,
  OfferUtils,
  PriceRatifierV1,
} from "@morpho-org/morpho-sdk/midnight/utils";
import {
  type Client,
  type Hex,
  isAddressEqual,
  maxUint256,
  zeroAddress,
} from "viem";
import { getBlock, getBlockNumber } from "viem/actions";

type SupplyParams = Parameters<typeof prepareMidnightSupplyCollateral>[1];
type BorrowParams = Parameters<typeof prepareMidnightMakeBorrow>[1];
type LendParams = Parameters<typeof prepareMidnightTakeLend>[1];

/**
 * Prepares the six plans of one Midnight position lifecycle: collateral supply, borrow offer,
 * partial lend fill of that offer, offer cancellation, full repayment with collateral
 * withdrawal, and redemption. Reads a fresh snapshot for each plan when the caller asks for it,
 * so send every transaction of a plan and require a receipt with `status === "success"` before
 * advancing. Wait for each receipt through the client that signed the plan: when the other client
 * takes the next snapshot, it first waits until its own reads reach the signing client's latest
 * block, so a lagging RPC cannot pin a snapshot before the preceding transaction. That latest block
 * is read from the signing client, not taken from the receipt, so the signing client's reads must
 * never fall behind a receipt it has already returned: a load-balanced signing RPC whose backends
 * disagree on the head can set the floor below the confirmed transaction. The wait gives up after
 * a fixed number of block reads (see {@link getBlockAtLeast}). The repayment withdraws the whole
 * collateral balance at `collateralIndex`, and the redemption redeems the lender's whole accrued
 * face value in the market, so both assume a fresh position: a lender's existing credit is redeemed
 * too, and the redemption fails if the market's liquidity covers this fill but not the whole
 * position.
 * @param params.maker - Client that signs as the borrower and maker.
 * @param params.taker - Client that signs as the lender and taker.
 * @param params.supply - Collateral supply inputs; `chainId`, `account`, `market` and
 *   `collateralIndex` also scope the borrow, cancel and repay plans.
 * @param params.borrow.offers - Price-ratified borrow-offer tree the maker publishes.
 * @param params.borrow.validation - Optional offer validation setting for the publication.
 * @param params.lend.account - Lender that fills the published offer.
 * @param params.lend.target - Fill target and its bounds.
 * @param params.lend.maxContinuousFee - Highest continuous fee the lender accepts.
 * @param params.lend.fillUnits - Units the fill proof grants against the published offer.
 * @param params.lend.offerIndex - Optional index of the published offer to fill; defaults to 0.
 * @param params.maxRepayAssets - Most loan assets the borrower spends to repay in full. Its range
 *   is checked before the first plan, but it is compared with the debt only when the repayment plan
 *   is prepared, after the fill and cancellation have landed. The full repayment reads the
 *   borrower's total debt in the market, so size the cap to cover all of it then. A cap of the
 *   filled units is enough only for a fresh position whose leaves all restrict `allowedTaker` to
 *   `lend.account`, while the borrower has no other live offers in the market. With an open leaf,
 *   anyone can fill the tree before the cancellation lands, so the cap and the borrower's loan
 *   tokens must cover every fill the tree allows.
 * @yields One plan per operation, in lifecycle order.
 * @throws {InvalidBigIntInputError} Before the first plan, if `lend.fillUnits` or
 *   `maxRepayAssets` is not a bigint.
 * @throws {NonPositiveInputError} Before the first plan, if `lend.fillUnits` or `maxRepayAssets`
 *   is not positive, or if the default read budget of `maker` or `taker` is not positive.
 * @throws {InputExceedsMaxError} Before the first plan, if `maxRepayAssets` is at least
 *   `maxUint256`, which the full repayment rejects whatever the debt.
 * @throws {RangeError} Before the first plan, if `lend.offerIndex` is outside the published tree.
 * @throws {RatifierV1TakerNotAllowedError} Before the first plan, if the selected leaf restricts
 *   fills to an `allowedTaker` other than `lend.account`.
 * @throws {MidnightTakeableOfferMarketMismatchError} Before the first plan, if a published offer
 *   belongs to another market than `supply.market`.
 * @throws {MidnightOfferMakerMismatchError} Before the first plan, if a published offer has
 *   another maker than `supply.account`.
 * @throws {MidnightTakeableOffersNotFillableError} Before the first plan, if `lend.account` is
 *   `supply.account`: Midnight rejects a self-take, so every published offer is listed as
 *   `"selfTake"`.
 * @throws {MidnightTakeTargetUnreachableError} Before the first plan, if `lend.fillUnits` is
 *   below the `units` of a units target, or below the larger of the `assets` and `minUnits` of
 *   an assets target. Other lend checks run only when the lend plan is prepared, after
 *   publication; if one fails, cancel the published groups with `prepareMidnightCancelOffers`,
 *   then, since an open leaf can be filled before the cancellation lands, fetch the borrower's
 *   position and repay any outstanding debt and withdraw the collateral with
 *   `prepareMidnightRepayWithdrawCollateral`; only when the fetched position has no debt, pass
 *   `repay: { type: "assets", assets: 0n }` to only withdraw.
 * @throws {NonIntegerInputError} Before the first plan, if the default read budget of `maker` or
 *   `taker` is not a safe integer, as when its `pollingInterval` is 0; see {@link getBlockAtLeast}.
 * @throws {ChainIdMismatchError} Before the first plan, if `maker` or `taker` declares or serves
 *   another chain than `supply.chainId`.
 * @throws {Error} If a client switch runs out of reads before the snapshot client reaches the
 *   signing client's block; see {@link getBlockAtLeast}. A timeout before the lend snapshot leaves
 *   the collateral supplied and the borrow offers live: cancel the published groups with
 *   `prepareMidnightCancelOffers`, then repay any debt from a fill that landed first and withdraw
 *   the collateral with `prepareMidnightRepayWithdrawCollateral` (`repay: { type: "assets",
 *   assets: 0n }` only when the fetched position has no debt). A timeout before the repayment snapshot comes after the
 *   cancellation but leaves the debt open: repay it with `prepareMidnightRepayWithdrawCollateral`.
 *   A timeout before the redemption snapshot leaves the lender's position to redeem with
 *   `prepareMidnightRedeem`.
 * @throws Propagates the errors of each `prepareMidnight*` preparer and of the snapshot reads.
 */
export async function* prepareMidnightLifecycle({
  maker,
  taker,
  supply,
  borrow,
  lend,
  maxRepayAssets,
}: {
  maker: Client;
  taker: Client;
  supply: Omit<SupplyParams, "now">;
  borrow: { offers: Tree<"priceV1">; validation?: BorrowParams["validation"] };
  lend: Pick<LendParams, "account" | "target" | "maxContinuousFee"> & {
    fillUnits: bigint;
    offerIndex?: number;
  };
  maxRepayAssets: bigint;
}): AsyncGenerator<TransactionPlan, void, undefined> {
  const { chainId, account, market, collateralIndex = 0n } = supply;
  const marketId = MarketUtils.toId(market);
  const makerIntent = { chainId, account };
  const { account: lendAccount, fillUnits, offerIndex = 0, target } = lend;
  const tree = borrow.offers;
  if (typeof fillUnits !== "bigint") {
    throw new InvalidBigIntInputError("lend.fillUnits", fillUnits);
  }
  if (fillUnits <= 0n) {
    throw new NonPositiveInputError("lend.fillUnits", fillUnits);
  }
  if (typeof maxRepayAssets !== "bigint") {
    throw new InvalidBigIntInputError("maxRepayAssets", maxRepayAssets);
  }
  if (maxRepayAssets <= 0n) {
    throw new NonPositiveInputError("maxRepayAssets", maxRepayAssets);
  }
  if (maxRepayAssets >= maxUint256) {
    throw new InputExceedsMaxError({
      field: "maxRepayAssets",
      value: maxRepayAssets,
      max: maxUint256 - 1n,
    });
  }
  const fills = priceRatifiedFills(tree, fillUnits);
  const fill = fills[offerIndex];
  if (!fill)
    throw new RangeError("lend.offerIndex is outside the published tree");
  const { allowedTaker } = tree.entries[offerIndex]!;
  if (
    !isAddressEqual(allowedTaker, zeroAddress) &&
    !isAddressEqual(allowedTaker, lendAccount)
  ) {
    throw new RatifierV1TakerNotAllowedError({
      taker: lendAccount,
      allowedTaker,
    });
  }
  for (const [index, { offer }] of fills.entries()) {
    const offerMarketId = MarketUtils.toId(offer.market);
    if (offerMarketId !== marketId) {
      throw new MidnightTakeableOfferMarketMismatchError({
        index,
        expectedMarket: marketId,
        actualMarket: offerMarketId,
      });
    }
    if (!isAddressEqual(offer.maker, account)) {
      throw new MidnightOfferMakerMismatchError({
        index,
        expectedMaker: account,
        actualMaker: offer.maker,
      });
    }
  }
  if (isAddressEqual(lendAccount, account)) {
    throw new MidnightTakeableOffersNotFillableError(
      fills.map((_, index) => ({ index, reason: "selfTake" })),
    );
  }
  const requiredUnits =
    target.type === "units"
      ? target.units
      : target.assets > target.minUnits
        ? target.assets
        : target.minUnits;
  if (fillUnits < requiredUnits) {
    throw new MidnightTakeTargetUnreachableError({
      field: "takeableOffers",
      value: fillUnits,
      limit: requiredUnits,
    });
  }
  readBudget(maker);
  readBudget(taker);
  await validateClientChainId(maker, chainId);
  await validateClientChainId(taker, chainId);

  yield await prepareMidnightSupplyCollateral(maker, {
    ...supply,
    now: (await getBlock(maker)).timestamp,
  });
  yield await prepareMidnightMakeBorrow(maker, {
    ...makerIntent,
    offers: tree,
    validation: borrow.validation,
    now: (await getBlock(maker)).timestamp,
  });
  const lendBlock = await getBlockAtLeast(taker, {
    minBlockNumber: await getBlockNumber(maker, { cacheTime: 0 }),
  });
  yield await prepareMidnightTakeLend(taker, {
    chainId,
    account: lendAccount,
    target,
    maxContinuousFee: lend.maxContinuousFee,
    marketData: await fetchMarket(taker, {
      marketId,
      blockNumber: lendBlock.number,
    }),
    takeableOffers: [fill],
    now: lendBlock.timestamp,
  });
  const groups: Hex[] = [];
  const seenGroups = new Set<string>();
  for (const { group } of tree.offers) {
    const key = group.toLowerCase();
    if (!seenGroups.has(key)) {
      seenGroups.add(key);
      groups.push(group);
    }
  }
  yield await prepareMidnightCancelOffers(maker, {
    ...makerIntent,
    groups,
    now: (await getBlock(maker)).timestamp,
  });

  const repayBlock = await getBlockAtLeast(maker, {
    minBlockNumber: await getBlockNumber(taker, { cacheTime: 0 }),
  });
  const borrower = await fetchAccrualPosition(maker, {
    marketId,
    user: account,
    blockNumber: repayBlock.number,
  });
  yield await prepareMidnightRepayWithdrawCollateral(maker, {
    ...makerIntent,
    marketData: borrower.market,
    positionData: borrower,
    collateralPrices: [],
    repay: { type: "full", maxBuyerAssets: maxRepayAssets },
    collateralWithdrawals: [{ collateralIndex, assets: maxUint256 }],
    now: repayBlock.timestamp,
  });

  const redeemBlock = await getBlockAtLeast(taker, {
    minBlockNumber: await getBlockNumber(maker, { cacheTime: 0 }),
  });
  const lender = await fetchAccrualPosition(taker, {
    marketId,
    user: lendAccount,
    blockNumber: redeemBlock.number,
  });
  yield await prepareMidnightRedeem(taker, {
    chainId,
    account: lendAccount,
    positionData: lender,
    now: redeemBlock.timestamp,
  });
}

/**
 * Reads the client's latest block once its reads have reached a block number, polling every
 * `client.pollingInterval` milliseconds until then, for at most `maxAttempts` reads. The limit is
 * a read count, not a deadline: the time each read takes is added to the polling delays, and
 * per-request timeouts come from the client's transport.
 * @param client - Client whose snapshot is about to be taken.
 * @param options.minBlockNumber - Lowest block number the snapshot may be pinned to.
 * @param options.maxAttempts - Most block reads before giving up; defaults to
 *   `Math.ceil(60_000 / client.pollingInterval)`, about a minute at the client's polling interval
 *   when reads are fast.
 * @returns The client's latest block, numbered at least `minBlockNumber`.
 * @throws {NonIntegerInputError} Before any read, if the resolved `maxAttempts` is not a safe
 *   integer, as when it is `NaN` or `client.pollingInterval` is 0.
 * @throws {NonPositiveInputError} Before any read, if the resolved `maxAttempts` is not positive.
 * @throws {Error} If the client is still below `minBlockNumber` after `maxAttempts` reads; the
 *   message names the required block and the last block seen.
 * @throws Propagates the errors of the block read.
 */
export async function getBlockAtLeast(
  client: Client,
  {
    minBlockNumber,
    maxAttempts,
  }: { minBlockNumber: bigint; maxAttempts?: number },
) {
  const budget = readBudget(client, maxAttempts);
  for (let attempt = 1; ; attempt++) {
    const block = await getBlock(client);
    if (block.number >= minBlockNumber) return block;
    if (attempt >= budget) {
      throw new Error(
        `Client did not reach block ${minBlockNumber} after ${attempt} reads; last block seen: ${block.number}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, client.pollingInterval));
  }
}

/**
 * Resolves and checks the read budget of {@link getBlockAtLeast}.
 * @param client - Client whose snapshot the budget bounds.
 * @param maxAttempts - Most block reads; defaults to `Math.ceil(60_000 / client.pollingInterval)`.
 * @returns The budget, a positive safe integer.
 * @throws {NonIntegerInputError} If the budget is not a safe integer.
 * @throws {NonPositiveInputError} If the budget is not positive.
 */
function readBudget(
  client: Client,
  maxAttempts = Math.ceil(60_000 / client.pollingInterval),
) {
  if (!Number.isSafeInteger(maxAttempts)) {
    throw new NonIntegerInputError("maxAttempts", maxAttempts);
  }
  if (maxAttempts <= 0) {
    throw new NonPositiveInputError("maxAttempts", BigInt(maxAttempts));
  }
  return maxAttempts;
}

/**
 * Adapts a published price-ratified tree to the taker's fill snapshot.
 * @param tree - Price-ratified offer tree the maker published.
 * @param units - Units each fill proof grants.
 * @returns One ABI-ready fill per offer, in tree order.
 */
export function priceRatifiedFills(
  tree: Parameters<typeof PriceRatifierV1.ratify>[0]["tree"],
  units: bigint,
) {
  return PriceRatifierV1.ratify({ tree }).map(({ offer, ratifierData }) => ({
    offer: OfferUtils.toStruct({ offer }),
    ratifierData,
    units,
  }));
}

/**
 * Stores the plan through the caller's storage and resumes without an RPC client. Parsing checks
 * structure, not authenticity: load from integrity-protected storage and verify each rebuilt
 * transaction against the original intent before sending it.
 * @param plan - Plan to serialize.
 * @param saveAndLoad - Saves the JSON and returns it as loaded back from storage.
 * @returns The restored plan and its transactions, built without a client.
 * @throws {InvalidTransactionPlanError} If the loaded JSON is not a valid plan.
 * @throws {UnsupportedTransactionPlanVersionError} If the stored version is unsupported.
 * @throws {UnsupportedTransactionPlanActionError} If a step names an unsupported action type.
 */
export async function storeAndBuildMidnightPlan(
  plan: TransactionPlan,
  saveAndLoad: (json: string) => Promise<string>,
) {
  const saved = await saveAndLoad(serializeTransactionPlan(plan));
  const restored = parseTransactionPlan(saved);
  return { restored, transactions: buildTransactions(restored) };
}
