import { assertNonNegative } from "@morpho-org/morpho-ts";
import type { Address, Client, Hex } from "viem";
import { getBytecode, readContract } from "viem/actions";

import { erc20Abi, midnightAbi } from "../abis.js";
import { MAX_COLLATERALS } from "../constants.js";
import {
  type IMarket,
  Market,
  MarketState,
  Position,
} from "../market/index.js";
import { ConsumableUnitsLib } from "../math/index.js";
import { type IOffer, Offer } from "../offers/index.js";
import { RatifierUtils } from "../signatures/index.js";
import type { BigIntish, RatifierInfo } from "../types.js";

/**
 * Shared viem fetch parameters for Midnight helpers.
 *
 * @example
 * ```ts
 * import type { MidnightFetchParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as MidnightFetchParams;
 * console.log(params.midnight);
 * ```
 */
export interface MidnightFetchParams {
  /** Viem client. */
  readonly client: Client;
  /** Core Midnight contract address. */
  readonly midnight: Address;
}

/**
 * Fetches whether an account has authorized a contract/account on Midnight.
 *
 * @param params - Fetch parameters.
 * @returns Authorization state.
 * @example
 * ```ts
 * import { fetchIsAuthorized } from "@morpho-org/midnight-sdk";
 *
 * const authorized = await fetchIsAuthorized({} as never);
 * console.log(authorized);
 * ```
 */
export function fetchIsAuthorized(
  params: MidnightFetchParams & {
    readonly authorizer: Address;
    readonly authorized: Address;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    args: [params.authorizer, params.authorized],
  });
}

/**
 * Fetches an ERC-20 allowance.
 *
 * @param params - Fetch parameters.
 * @returns Allowance.
 * @example
 * ```ts
 * import { fetchErc20Allowance } from "@morpho-org/midnight-sdk";
 *
 * const allowance = await fetchErc20Allowance({} as never);
 * console.log(allowance);
 * ```
 */
export function fetchErc20Allowance(params: {
  readonly client: Client;
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
}) {
  return readContract(params.client, {
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });
}

/**
 * Fetches the Midnight id for a market from the core contract.
 *
 * @param params - Fetch parameters.
 * @returns Market id.
 * @example
 * ```ts
 * import { fetchMarketId } from "@morpho-org/midnight-sdk";
 *
 * const id = await fetchMarketId({} as never);
 * console.log(id);
 * ```
 */
export function fetchMarketId(
  params: MidnightFetchParams & {
    readonly market: IMarket | Market;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "toId",
    args: [Market.from(params.market).toStruct()],
  });
}

/**
 * Fetches a market struct by id.
 *
 * @param params - Fetch parameters.
 * @returns Market instance.
 * @example
 * ```ts
 * import { fetchMarket } from "@morpho-org/midnight-sdk";
 *
 * const market = await fetchMarket({} as never);
 * console.log(market.loanToken);
 * ```
 */
export async function fetchMarket(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
  },
) {
  const market = await readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "toMarket",
    args: [params.marketId],
  });

  return new Market(market);
}

/**
 * Fetches a Midnight market state by id.
 *
 * @param params - Fetch parameters.
 * @returns Market state instance.
 * @example
 * ```ts
 * import { fetchMarketState } from "@morpho-org/midnight-sdk";
 *
 * const state = await fetchMarketState({} as never);
 * console.log(state.tickSpacing);
 * ```
 */
export async function fetchMarketState(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
  },
) {
  const state = await readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "marketState",
    args: [params.marketId],
  });

  return new MarketState({
    totalUnits: state[0],
    lossFactor: state[1],
    withdrawable: state[2],
    continuousFeeCredit: state[3],
    settlementFeeCbps: [
      state[4],
      state[5],
      state[6],
      state[7],
      state[8],
      state[9],
      state[10],
    ],
    continuousFee: state[11],
    tickSpacing: state[12],
  });
}

/**
 * Fetches a Midnight position by id and user.
 *
 * The Solidity storage getter does not return the fixed collateral array, so
 * this helper reads each collateral slot before returning the position.
 *
 * @param params - Fetch parameters.
 * @returns Position instance.
 * @example
 * ```ts
 * import { fetchPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = await fetchPosition({} as never);
 * console.log(position.debt);
 * ```
 */
export async function fetchPosition(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
    readonly user: Address;
  },
) {
  const position = await readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "position",
    args: [params.marketId, params.user],
  });
  const collateral = await Promise.all(
    Array.from({ length: Number(MAX_COLLATERALS) }, (_, collateralIndex) =>
      fetchCollateral({
        client: params.client,
        midnight: params.midnight,
        marketId: params.marketId,
        user: params.user,
        collateralIndex: BigInt(collateralIndex),
      }),
    ),
  );

  return new Position({
    credit: position[0],
    pendingFee: position[1],
    lastLossFactor: position[2],
    lastAccrual: position[3],
    debt: position[4],
    collateralBitmap: position[5],
    collateral,
  });
}

/**
 * Fetches a collateral balance.
 *
 * @param params - Fetch parameters.
 * @returns Collateral assets.
 * @example
 * ```ts
 * import { fetchCollateral } from "@morpho-org/midnight-sdk";
 *
 * const collateral = await fetchCollateral({} as never);
 * console.log(collateral);
 * ```
 */
export function fetchCollateral(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
    readonly user: Address;
    readonly collateralIndex: BigIntish;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "collateral",
    args: [params.marketId, params.user, BigInt(params.collateralIndex)],
  });
}

/**
 * Fetches user credit.
 *
 * @param params - Fetch parameters.
 * @returns Credit.
 * @example
 * ```ts
 * import { fetchCredit } from "@morpho-org/midnight-sdk";
 *
 * const credit = await fetchCredit({} as never);
 * console.log(credit);
 * ```
 */
export function fetchCredit(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
    readonly user: Address;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "creditOf",
    args: [params.marketId, params.user],
  });
}

/**
 * Fetches user debt.
 *
 * @param params - Fetch parameters.
 * @returns Debt.
 * @example
 * ```ts
 * import { fetchDebt } from "@morpho-org/midnight-sdk";
 *
 * const debt = await fetchDebt({} as never);
 * console.log(debt);
 * ```
 */
export function fetchDebt(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
    readonly user: Address;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "debtOf",
    args: [params.marketId, params.user],
  });
}

/**
 * Fetches market withdrawable assets.
 *
 * @param params - Fetch parameters.
 * @returns Withdrawable assets.
 * @example
 * ```ts
 * import { fetchWithdrawable } from "@morpho-org/midnight-sdk";
 *
 * const withdrawable = await fetchWithdrawable({} as never);
 * console.log(withdrawable);
 * ```
 */
export function fetchWithdrawable(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "withdrawable",
    args: [params.marketId],
  });
}

/**
 * Fetches whether a borrower is healthy.
 *
 * @param params - Fetch parameters.
 * @returns Health state.
 * @example
 * ```ts
 * import { fetchIsHealthy } from "@morpho-org/midnight-sdk";
 *
 * const healthy = await fetchIsHealthy({} as never);
 * console.log(healthy);
 * ```
 */
export function fetchIsHealthy(
  params: MidnightFetchParams & {
    readonly market: IMarket | Market;
    readonly marketId: Hex;
    readonly borrower: Address;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "isHealthy",
    args: [
      Market.from(params.market).toStruct(),
      params.marketId,
      params.borrower,
    ],
  });
}

/**
 * Fetches market tick spacing.
 *
 * @param params - Fetch parameters.
 * @returns Tick spacing.
 * @example
 * ```ts
 * import { fetchTickSpacing } from "@morpho-org/midnight-sdk";
 *
 * const spacing = await fetchTickSpacing({} as never);
 * console.log(spacing);
 * ```
 */
export function fetchTickSpacing(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "tickSpacing",
    args: [params.marketId],
  });
}

/**
 * Fetches settlement fee for a time-to-maturity.
 *
 * @param params - Fetch parameters.
 * @returns WAD-scaled settlement fee.
 * @throws NegativeValueError when `timeToMaturity` is negative.
 * @example
 * ```ts
 * import { fetchSettlementFee } from "@morpho-org/midnight-sdk";
 *
 * const fee = await fetchSettlementFee({} as never);
 * console.log(fee);
 * ```
 */
export function fetchSettlementFee(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
    readonly timeToMaturity: BigIntish;
  },
) {
  const timeToMaturity = BigInt(params.timeToMaturity);
  assertNonNegative("timeToMaturity", timeToMaturity);

  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "settlementFee",
    args: [params.marketId, timeToMaturity],
  });
}

/**
 * Fetches consumed amount for a maker/group pair.
 *
 * @param params - Fetch parameters.
 * @returns Consumed amount.
 * @example
 * ```ts
 * import { fetchConsumed } from "@morpho-org/midnight-sdk";
 *
 * const consumed = await fetchConsumed({} as never);
 * console.log(consumed);
 * ```
 */
export function fetchConsumed(
  params: MidnightFetchParams & {
    readonly user: Address;
    readonly group: Hex;
  },
) {
  return readContract(params.client, {
    address: params.midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [params.user, params.group],
  });
}

/**
 * Fetches and computes remaining consumable units for an offer.
 *
 * For unit-capped offers this only reads `consumed`, matching the Solidity
 * library's early return before any settlement-fee lookup. For asset-capped
 * offers, pass the time to maturity for the same block context as the quote.
 *
 * @param params - Fetch parameters.
 * @returns Consumable units.
 * @throws NegativeValueError when asset-capped `timeToMaturity` or SDK math inputs are negative.
 * @throws DivisionByZeroError when the delegated units conversion divides by zero.
 * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
 * @example
 * ```ts
 * import { fetchConsumableUnits } from "@morpho-org/midnight-sdk";
 *
 * const units = await fetchConsumableUnits({} as never);
 * console.log(units);
 * ```
 */
export async function fetchConsumableUnits(
  params: MidnightFetchParams & {
    readonly marketId: Hex;
    readonly offer: IOffer | Offer;
    readonly timeToMaturity: BigIntish;
  },
) {
  const offer = Offer.from(params.offer);
  assertNonNegative("offer.maxUnits", offer.maxUnits);
  assertNonNegative("offer.maxAssets", offer.maxAssets);

  const consumedParams = {
    client: params.client,
    midnight: params.midnight,
    user: offer.maker,
    group: offer.group,
  };

  if (offer.maxUnits > 0n) {
    return ConsumableUnitsLib.consumableUnits({
      offer,
      consumed: await fetchConsumed(consumedParams),
      settlementFee: 0n,
    });
  }

  const [consumed, settlementFee] = await Promise.all([
    fetchConsumed(consumedParams),
    fetchSettlementFee({
      client: params.client,
      midnight: params.midnight,
      marketId: params.marketId,
      timeToMaturity: params.timeToMaturity,
    }),
  ]);

  return ConsumableUnitsLib.consumableUnits({
    offer,
    consumed,
    settlementFee,
  });
}

/**
 * Fetches maker bytecode and classifies the ratifier route.
 *
 * @param params - Fetch parameters.
 * @returns Ratifier information.
 * @example
 * ```ts
 * import { fetchRatifierInfo } from "@morpho-org/midnight-sdk";
 *
 * const info = await fetchRatifierInfo({} as never);
 * console.log(info.type);
 * ```
 */
export async function fetchRatifierInfo(params: {
  readonly client: Client;
  readonly maker: Address;
  readonly ecrecoverRatifier: Address;
  readonly setterRatifier: Address;
}): Promise<RatifierInfo> {
  const bytecode = await getBytecode(params.client, { address: params.maker });

  return RatifierUtils.getRatifierInfo({
    bytecode,
    ecrecoverRatifier: params.ecrecoverRatifier,
    setterRatifier: params.setterRatifier,
  });
}
