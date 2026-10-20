import {
  DEFAULT_TICK_SPACING,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  type Offer,
  RateRatifierV1,
  type Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress, MathLib } from "@morpho-org/morpho-ts";
import { type Address, type Client, maxUint256, zeroAddress } from "viem";
import { getBlock, getBlockNumber, getCode, multicall } from "viem/actions";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  MidnightMarketLiquidationCursorNotEnabledError,
  MidnightMarketLltvNotEnabledError,
  MidnightMarketMaturityTooFarError,
  MidnightMarketOracleWithoutCodeError,
  MidnightOfferCallbackNotSupportedError,
  MidnightOfferContinuousFeeCapBelowMarketFeeError,
  MidnightOfferExpiredError,
  MidnightOfferExpiryAfterMaturityError,
  MidnightOfferGroupConsumedError,
  MidnightOfferNoCreditError,
  MidnightOfferNoDebtError,
  MidnightOfferRateBoundUnreachableError,
  MidnightOfferTickSpacingError,
  MidnightOfferZeroPriceSellError,
} from "../../types/midnightPublicationError.js";

// Midnight.sol `touchMarket` rejects markets maturing more than 100 years after creation.
const MAX_TIME_TO_MATURITY = 100n * 365n * 86_400n;

/** @internal */
export const offerMarketParams = (offer: Offer) =>
  "params" in offer.market ? offer.market.params : offer.market;

/** Onchain state used to validate one Midnight maker offer before publication.
 *
 * `market` supplies the market id for errors, the maturity used for Rate V1 sell-overflow timing,
 * and the market input to `RateRatifierV1.isPriceAcceptable`.
 *
 * @internal
 * @example
 * ```ts
 * const state: MidnightMakerOfferState = {
 *   consumed: 0n,
 *   tickSpacing: 4,
 *   continuousFee: 0n,
 *   credit: 0n,
 *   debt: 0n,
 *   market,
 *   lltvEnabled: [],
 *   liquidationCursorEnabled: [],
 *   oracleHasCode: [],
 * };
 * console.log(state.tickSpacing);
 * ```
 */
export interface MidnightMakerOfferState {
  /** Units or assets already consumed from the offer group. */
  readonly consumed: bigint;
  /** Onchain tick spacing; zero means the market is not created. */
  readonly tickSpacing: number;
  /** Current market continuous fee. */
  readonly continuousFee: bigint;
  /** Maker's credit in this market. */
  readonly credit: bigint;
  /** Maker's debt in this market. */
  readonly debt: bigint;
  /** Market snapshot used for error market ids and Rate V1 maturity validation. */
  readonly market: Market;
  /** LLTV enablement results for uncreated-market collateral parameters. */
  readonly lltvEnabled: readonly boolean[];
  /** Liquidation-cursor enablement results for uncreated-market collateral parameters. */
  readonly liquidationCursorEnabled: readonly boolean[];
  /** Oracle-code results for uncreated-market collateral parameters. */
  readonly oracleHasCode: readonly boolean[];
}

/**
 * Rejects the first maker offer that cannot be filled at or after publication.
 *
 * Checks expiry, market maturity, group capacity, tick spacing, continuous fee,
 * zero-price sells, Rate V1 reachability, reduce-only position state, and
 * uncreated-market constraints in protocol order. Partial group consumption
 * remains valid; every offer in that group shares its remaining cap.
 *
 * @internal
 * @param params.tree - Price V1 or Rate V1 maker tree.
 * @param params.states - Pinned onchain state corresponding to each tree offer.
 * @param params.now - Timestamp from the same block as the state reads.
 * @param params.marketCreationTime - Latest market creation time for uncreated markets; defaults to each offer's expiry.
 * @returns Nothing when every offer can be published.
 * @throws {MidnightOfferExpiredError} when expiry is not later than `now`.
 * @throws {MidnightOfferExpiryAfterMaturityError} when expiry exceeds market maturity.
 * @throws {MidnightOfferGroupConsumedError} when the group's remaining cap is zero.
 * @throws {MidnightOfferTickSpacingError} when the tick is inaccessible.
 * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds the offer cap.
 * @throws {MidnightOfferZeroPriceSellError} when a sell offer has tick zero.
 * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 bound cannot become fillable.
 * @throws {MidnightOfferNoDebtError} when a reduce-only buy has no maker debt.
 * @throws {MidnightOfferNoCreditError} when a reduce-only sell has no maker credit.
 * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the selected creation time.
 * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market's LLTV is disabled.
 * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market's cursor is disabled.
 * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
 * @example
 * ```ts
 * validateMidnightMakerOfferStates({ tree, states, now: block.timestamp });
 * ```
 */
export function validateMidnightMakerOfferStates(params: {
  readonly tree: Tree<"priceV1"> | Tree<"rateV1">;
  readonly states: readonly MidnightMakerOfferState[];
  readonly now: bigint;
  readonly marketCreationTime?: "expiry" | "now";
}): void {
  const rateEntries = params.tree.type === "rateV1" ? params.tree.entries : [];

  params.tree.offers.forEach((offer, index) => {
    const state = params.states[index]!;
    const expiry = BigInt(offer.expiry);
    const offerMarket = offerMarketParams(offer);
    const maturity = BigInt(offerMarket.maturity);
    const marketId = state.market.id;

    if (expiry <= params.now) {
      throw new MidnightOfferExpiredError({
        index,
        expiry,
        now: params.now,
      });
    }
    if (expiry > maturity) {
      throw new MidnightOfferExpiryAfterMaturityError({
        index,
        expiry,
        maturity,
      });
    }

    const capacity =
      BigInt(offer.maxAssets) > 0n
        ? BigInt(offer.maxAssets)
        : BigInt(offer.maxUnits);
    if (state.consumed >= capacity) {
      throw new MidnightOfferGroupConsumedError({
        index,
        group: offer.group,
        consumed: state.consumed,
      });
    }
    const tickSpacing = state.tickSpacing || Number(DEFAULT_TICK_SPACING);
    if (BigInt(offer.tick) % BigInt(tickSpacing) !== 0n) {
      throw new MidnightOfferTickSpacingError({
        index,
        tick: BigInt(offer.tick),
        tickSpacing,
      });
    }
    if (BigInt(offer.continuousFeeCap) < state.continuousFee) {
      throw new MidnightOfferContinuousFeeCapBelowMarketFeeError({
        index,
        marketId,
        continuousFeeCap: BigInt(offer.continuousFeeCap),
        continuousFee: state.continuousFee,
      });
    }
    if (!offer.buy && BigInt(offer.tick) === 0n) {
      throw new MidnightOfferZeroPriceSellError({ index });
    }

    if (params.tree.type === "rateV1") {
      const rate = BigInt(rateEntries[index]!.rate);
      let timestamp = offer.buy
        ? expiry
        : MathLib.max(params.now, BigInt(offer.start));
      if (!offer.buy && rate > 0n) {
        const maxTimeToMaturity =
          (maxUint256 - MathLib.WAD * MathLib.WAD - MathLib.WAD + 1n) / rate;
        const marketMaturity = state.market.params.maturity;
        timestamp = MathLib.max(timestamp, marketMaturity - maxTimeToMaturity);
        if (timestamp > expiry || timestamp > marketMaturity) {
          throw new MidnightOfferRateBoundUnreachableError({
            index,
            rate,
            tick: BigInt(offer.tick),
          });
        }
      }
      if (
        !RateRatifierV1.isPriceAcceptable({
          offer: { ...offer, market: state.market },
          rate,
          timestamp,
        })
      ) {
        throw new MidnightOfferRateBoundUnreachableError({
          index,
          rate,
          tick: BigInt(offer.tick),
        });
      }
    }

    if (offer.reduceOnly && offer.buy && state.debt === 0n) {
      throw new MidnightOfferNoDebtError({ index, marketId });
    }
    if (offer.reduceOnly && !offer.buy && state.credit === 0n) {
      throw new MidnightOfferNoCreditError({ index, marketId });
    }

    if (state.tickSpacing === 0) {
      const marketCreationTimestamp =
        params.marketCreationTime === "now" ? params.now : expiry;
      const maxMaturity = marketCreationTimestamp + MAX_TIME_TO_MATURITY;
      if (maturity > maxMaturity) {
        throw new MidnightMarketMaturityTooFarError({
          index,
          maturity,
          maxMaturity,
        });
      }
      for (const [
        collateralIndex,
        collateral,
      ] of offerMarket.collateralParams.entries()) {
        if (!state.lltvEnabled[collateralIndex]) {
          throw new MidnightMarketLltvNotEnabledError({
            index,
            lltv: BigInt(collateral.lltv),
          });
        }
        if (!state.liquidationCursorEnabled[collateralIndex]) {
          throw new MidnightMarketLiquidationCursorNotEnabledError({
            index,
            liquidationCursor: BigInt(collateral.liquidationCursor),
          });
        }
        if (!state.oracleHasCode[collateralIndex]) {
          throw new MidnightMarketOracleWithoutCodeError({
            index,
            oracle: collateral.oracle,
          });
        }
      }
    }
  });
}

/**
 * Reads pinned Midnight state for each offer, deduplicating markets and groups.
 *
 * The reader uses a single block for contract reads and returns that block's
 * timestamp as `now`; oracle code checks use the same block number.
 *
 * @internal
 * @param params.client - Viem client used for state reads.
 * @param params.chainId - Chain whose Midnight deployment is read.
 * @param params.tree - Maker tree whose offer state is fetched.
 * @param params.blockNumber - Optional block to pin the reads to.
 * @returns Per-offer states plus the timestamp of the pinned block.
 * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
 *   another chain than `params.chainId`.
 * @throws {viem.BaseError} when block, multicall, or oracle-code reads fail.
 * @example
 * ```ts
 * const { states, now } = await fetchMidnightMakerOfferStates({
 *   client,
 *   chainId: 8453,
 *   tree,
 * });
 * ```
 */
export async function fetchMidnightMakerOfferStates(params: {
  readonly client: Client;
  readonly chainId: number;
  readonly tree: Tree<"priceV1"> | Tree<"rateV1">;
  readonly blockNumber?: bigint;
}): Promise<{
  readonly states: readonly MidnightMakerOfferState[];
  readonly now: bigint;
}> {
  await validateClientChainId(params.client, params.chainId);
  const blockNumber =
    params.blockNumber ?? (await getBlockNumber(params.client));
  const block = await getBlock(params.client, { blockNumber });
  const midnight = getChainAddress(params.chainId, "midnight");
  const markets = [
    ...new Map(
      params.tree.offers.map((offer) => {
        const market = MarketParams.from(offerMarketParams(offer));
        const id = MarketUtils.toId(market);
        return [id.toLowerCase(), { id, market }] as const;
      }),
    ).values(),
  ];
  const groups = [
    ...new Map(
      params.tree.offers.map((offer) => [
        `${offer.maker.toLowerCase()}:${offer.group.toLowerCase()}`,
        { maker: offer.maker, group: offer.group },
      ]),
    ).values(),
  ];
  const owners = [
    ...new Map(
      params.tree.offers.map((offer) => {
        const id = MarketUtils.toId(offer.market);
        return [
          `${id.toLowerCase()}:${offer.maker.toLowerCase()}`,
          { id, maker: offer.maker },
        ] as const;
      }),
    ).values(),
  ];
  const collaterals = markets.flatMap(({ id, market }) =>
    market.collateralParams.map((collateral, index) => ({
      key: `${id.toLowerCase()}:${index}`,
      collateral,
      oracleKey: collateral.oracle.toLowerCase(),
    })),
  );
  const defaultFeeTokens = [
    ...new Map(
      markets.map(({ market }) => [
        market.loanToken.toLowerCase(),
        market.loanToken,
      ]),
    ).values(),
  ];
  const [
    marketStates,
    consumedValues,
    creditValues,
    debtValues,
    defaultFees,
    lltvEnabledByCollateral,
    liquidationCursorEnabledByCollateral,
  ] = await Promise.all([
    multicall(params.client, {
      contracts: markets.map(({ id }) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "marketState" as const,
        args: [id] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
    multicall(params.client, {
      contracts: groups.map(({ maker, group }) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed" as const,
        args: [maker, group] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
    multicall(params.client, {
      contracts: owners.map(({ id, maker }) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit" as const,
        args: [id, maker] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
    multicall(params.client, {
      contracts: owners.map(({ id, maker }) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt" as const,
        args: [id, maker] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
    multicall(params.client, {
      contracts: defaultFeeTokens.map((loanToken) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "defaultContinuousFee" as const,
        args: [loanToken] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
    multicall(params.client, {
      contracts: collaterals.map(({ collateral }) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "isLltvEnabled" as const,
        args: [collateral.lltv] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
    multicall(params.client, {
      contracts: collaterals.map(({ collateral }) => ({
        address: midnight,
        abi: midnightAbi,
        functionName: "isLiquidationCursorEnabled" as const,
        args: [collateral.liquidationCursor] as const,
      })),
      allowFailure: false,
      blockNumber,
    }),
  ]);
  const defaultFeeByLoanToken = new Map(
    defaultFeeTokens.map((loanToken, index) => [
      loanToken.toLowerCase(),
      defaultFees[index]!,
    ]),
  );
  const marketById = new Map(
    markets.map(({ id, market: marketParams }, index) => {
      const [
        totalUnits,
        lossFactor,
        withdrawable,
        continuousFeeCredit,
        fee0,
        fee1,
        fee2,
        fee3,
        fee4,
        fee5,
        fee6,
        continuousFee,
        tickSpacing,
      ] = marketStates[index]!;
      const effectiveContinuousFee =
        tickSpacing === 0
          ? defaultFeeByLoanToken.get(marketParams.loanToken.toLowerCase())!
          : continuousFee;
      return [
        id.toLowerCase(),
        new Market({
          params: marketParams,
          totalUnits,
          lossFactor,
          withdrawable,
          continuousFeeCredit,
          settlementFeeCbps: [fee0, fee1, fee2, fee3, fee4, fee5, fee6],
          continuousFee: effectiveContinuousFee,
          tickSpacing,
        }),
      ] as const;
    }),
  );
  const consumedByGroup = new Map(
    groups.map(({ maker, group }, index) => [
      `${maker.toLowerCase()}:${group.toLowerCase()}`,
      consumedValues[index]!,
    ]),
  );
  const positionByOwner = new Map(
    owners.map(({ id, maker }, index) => [
      `${id.toLowerCase()}:${maker.toLowerCase()}`,
      {
        credit: creditValues[index]!,
        debt: debtValues[index]!,
      },
    ]),
  );
  const collateralStateByKey = new Map(
    collaterals.map(({ key }, index) => [
      key,
      {
        lltvEnabled: lltvEnabledByCollateral[index]!,
        liquidationCursorEnabled: liquidationCursorEnabledByCollateral[index]!,
      },
    ]),
  );
  const collateralStateByMarket = new Map(
    markets.map(({ id, market }) => [
      id.toLowerCase(),
      market.collateralParams.map(
        (_, index) => collateralStateByKey.get(`${id.toLowerCase()}:${index}`)!,
      ),
    ]),
  );
  const codeByOracle = new Map(
    await Promise.all(
      [...new Set(collaterals.map(({ oracleKey }) => oracleKey))].map(
        async (oracleKey) =>
          [
            oracleKey,
            await getCode(params.client, {
              address: collaterals.find(
                ({ oracleKey: key }) => key === oracleKey,
              )!.collateral.oracle,
              blockNumber,
            }),
          ] as const,
      ),
    ),
  );
  const states = params.tree.offers.map((offer) => {
    const id = MarketUtils.toId(offer.market);
    const market = marketById.get(id.toLowerCase())!;
    const groupKey = `${offer.maker.toLowerCase()}:${offer.group.toLowerCase()}`;
    const owner = positionByOwner.get(
      `${id.toLowerCase()}:${offer.maker.toLowerCase()}`,
    )!;
    const uncreated = market.tickSpacing === 0;
    const collateralStates = uncreated
      ? collateralStateByMarket.get(id.toLowerCase())!
      : [];
    return {
      consumed: consumedByGroup.get(groupKey)!,
      tickSpacing: market.tickSpacing,
      continuousFee: BigInt(market.continuousFee),
      credit: owner.credit,
      debt: owner.debt,
      market,
      lltvEnabled: collateralStates.map(({ lltvEnabled }) => lltvEnabled),
      liquidationCursorEnabled: collateralStates.map(
        ({ liquidationCursorEnabled }) => liquidationCursorEnabled,
      ),
      oracleHasCode: uncreated
        ? offerMarketParams(offer).collateralParams.map(
            (collateral) =>
              codeByOracle.get(collateral.oracle.toLowerCase()) !== undefined &&
              codeByOracle.get(collateral.oracle.toLowerCase()) !== "0x",
          )
        : [],
    };
  });
  return { states, now: block.timestamp };
}

/**
 * Rejects offers with callbacks that the selected maker flow cannot execute.
 *
 * `supplyBlueMakeLend` is excluded because it binds a Blue buy callback itself.
 *
 * @internal
 * @param offers - Offers to validate.
 * @returns Nothing when every callback is the zero address.
 * @throws {MidnightOfferCallbackNotSupportedError} when an offer callback is nonzero.
 * @example
 * ```ts
 * validateMidnightMakerOfferCallbacks(tree.offers);
 * ```
 */
export function validateMidnightMakerOfferCallbacks(
  offers: readonly { readonly callback: Address }[],
): void {
  offers.forEach((offer, index) => {
    if (offer.callback !== zeroAddress) {
      throw new MidnightOfferCallbackNotSupportedError({
        index,
        callback: offer.callback,
      });
    }
  });
}
