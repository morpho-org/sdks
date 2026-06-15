import { assertNonNegative, type BigIntish } from "@morpho-org/morpho-ts";
import {
  type Account,
  type BlockTag,
  type Client,
  erc20Abi,
  type StateOverride,
} from "viem";
import { getBytecode, readContract } from "viem/actions";
import {
  ecrecoverRatifierAbi,
  midnightAbi,
  setterRatifierAbi,
} from "../abis.js";
import { MAX_COLLATERALS } from "../constants.js";
import {
  AccrualPosition,
  type IMarketParams,
  Market,
  MarketParams,
  Position,
} from "../market/index.js";
import { marketParamsToStruct } from "../market/Market.js";
import { ConsumableUnitsLib } from "../math/index.js";
import type { IOffer, Offer } from "../offers/index.js";
import { normalizeOffer } from "../offers/Offer.js";
import {
  abi as getConsumableUnitsInputsAbi,
  code as getConsumableUnitsInputsCode,
} from "../queries/GetConsumableUnitsInputs.js";
import {
  abi as getPositionAbi,
  code as getPositionCode,
} from "../queries/GetPosition.js";
import {
  type RatifierInfo,
  RatifierUtils,
} from "../signatures/RatifierUtils.js";

/**
 * Shared viem call parameters accepted by Midnight fetch helpers.
 *
 * @example
 * ```ts
 * import type { MidnightCallParameters } from "@morpho-org/midnight-sdk";
 *
 * const params: MidnightCallParameters = { blockTag: "latest" };
 * console.log(params.blockTag);
 * ```
 */
export interface MidnightCallParameters {
  /** Account used as the `from` field for the read. */
  readonly account?: Account | `0x${string}`;
  /** Block number used for the read. */
  readonly blockNumber?: bigint;
  /** Block tag used for the read. */
  readonly blockTag?: BlockTag;
  /** State override set used for the read. */
  readonly stateOverride?: StateOverride;
}

/**
 * Deployless read mode accepted by composite Midnight fetch helpers.
 *
 * @example
 * ```ts
 * import type { DeploylessFetchParameters } from "@morpho-org/midnight-sdk";
 *
 * const params: DeploylessFetchParameters = { deployless: "force" };
 * console.log(params.deployless);
 * ```
 */
export interface DeploylessFetchParameters extends MidnightCallParameters {
  /**
   * If `true`, composite fetchers use deployless reads and fall back to direct reads if they fail.
   *
   * If `"force"`, composite fetchers use deployless reads without fallback.
   *
   * If `false`, composite fetchers use direct reads.
   *
   * Default is `true`.
   */
  readonly deployless?: boolean | "force";
}

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
export interface MidnightFetchParams extends DeploylessFetchParameters {
  /** Viem client. */
  readonly client: Client;
  /** Core Midnight contract address. */
  readonly midnight: `0x${string}`;
}

const callParameters = (
  params: MidnightCallParameters,
): MidnightCallParameters => ({
  account: params.account,
  blockNumber: params.blockNumber,
  blockTag: params.blockTag,
  stateOverride: params.stateOverride,
});

const shouldUseDeployless = (params: DeploylessFetchParameters) =>
  params.deployless ?? true;

const bytecodeCallParameters = (params: MidnightCallParameters) => {
  if (params.blockNumber != null) return { blockNumber: params.blockNumber };
  if (params.blockTag != null) return { blockTag: params.blockTag };

  return {};
};

const marketStateFields = (
  state: readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ],
) => ({
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
  ] as const,
  continuousFee: state[11],
  tickSpacing: state[12],
});

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
    readonly authorizer: `0x${string}`;
    readonly authorized: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
export function fetchErc20Allowance(
  params: {
    readonly client: Client;
    readonly token: `0x${string}`;
    readonly owner: `0x${string}`;
    readonly spender: `0x${string}`;
  } & DeploylessFetchParameters,
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly market: IMarketParams | MarketParams | Market;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
    address: params.midnight,
    abi: midnightAbi,
    functionName: "toId",
    args: [marketParamsToStruct(params.market)],
  });
}

/**
 * Fetches immutable market params by id.
 *
 * @param params - Fetch parameters.
 * @returns Market params instance.
 * @example
 * ```ts
 * import { fetchMarketParams } from "@morpho-org/midnight-sdk";
 *
 * const params = await fetchMarketParams({} as never);
 * console.log(params.loanToken);
 * ```
 */
export async function fetchMarketParams(
  params: MidnightFetchParams & {
    readonly marketId: `0x${string}`;
  },
) {
  const market = await readContract(params.client, {
    ...callParameters(params),
    address: params.midnight,
    abi: midnightAbi,
    functionName: "toMarket",
    args: [params.marketId],
  });

  return new MarketParams(market);
}

/**
 * Fetches a hydrated market by id.
 *
 * @param params - Fetch parameters.
 * @returns Market instance.
 * @example
 * ```ts
 * import { fetchMarket } from "@morpho-org/midnight-sdk";
 *
 * const market = await fetchMarket({} as never);
 * console.log(market.params.loanToken);
 * ```
 */
export async function fetchMarket(
  params: MidnightFetchParams & {
    readonly marketId: `0x${string}`;
  },
) {
  const [marketParams, state] = await Promise.all([
    fetchMarketParams(params),
    readContract(params.client, {
      ...callParameters(params),
      address: params.midnight,
      abi: midnightAbi,
      functionName: "marketState",
      args: [params.marketId],
    }),
  ]);

  return new Market({
    id: params.marketId,
    params: marketParams,
    ...marketStateFields(state),
  });
}

/**
 * Fetches a Midnight position by id and user.
 *
 * The Solidity storage getter does not return the fixed collateral array, so
 * this helper reads each collateral slot before returning the position.
 *
 * @param params - Fetch parameters.
 * @returns Normalized position object.
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
    readonly marketId: `0x${string}`;
    readonly user: `0x${string}`;
  },
): Promise<Position> {
  if (shouldUseDeployless(params)) {
    try {
      const position = await readContract(params.client, {
        ...callParameters(params),
        abi: getPositionAbi,
        code: getPositionCode,
        functionName: "query",
        args: [params.midnight, params.marketId, params.user],
      });

      const collateral = position.collateral as readonly BigIntish[];

      return new Position({
        credit: position.credit,
        pendingFee: position.pendingFee,
        lastLossFactor: position.lastLossFactor,
        lastAccrual: position.lastAccrual,
        debt: position.debt,
        collateralBitmap: position.collateralBitmap,
        collateral: collateral.map((assets) => BigInt(assets)),
      });
    } catch (error) {
      if (params.deployless === "force") throw error;
      // Fallback to direct reads if deployless execution is unavailable.
    }
  }

  const position = await readContract(params.client, {
    ...callParameters(params),
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
        ...callParameters(params),
        deployless: false,
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
    collateral: [...collateral],
  });
}

/**
 * Fetches a Midnight position paired with its hydrated market.
 *
 * @param params - Fetch parameters.
 * @returns Accrual position instance.
 * @example
 * ```ts
 * import { fetchAccrualPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = await fetchAccrualPosition({} as never);
 * console.log(position.market.id);
 * ```
 */
export async function fetchAccrualPosition(
  params: MidnightFetchParams & {
    readonly marketId: `0x${string}`;
    readonly user: `0x${string}`;
  },
) {
  const [position, market] = await Promise.all([
    fetchPosition(params),
    fetchMarket(params),
  ]);

  return new AccrualPosition(position, market);
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
    readonly marketId: `0x${string}`;
    readonly user: `0x${string}`;
    readonly collateralIndex: BigIntish;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly marketId: `0x${string}`;
    readonly user: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly marketId: `0x${string}`;
    readonly user: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly marketId: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly market: IMarketParams | MarketParams | Market;
    readonly marketId: `0x${string}`;
    readonly borrower: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
    address: params.midnight,
    abi: midnightAbi,
    functionName: "isHealthy",
    args: [
      marketParamsToStruct(params.market),
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
    readonly marketId: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly marketId: `0x${string}`;
    readonly timeToMaturity: BigIntish;
  },
) {
  const timeToMaturity = BigInt(params.timeToMaturity);
  assertNonNegative("timeToMaturity", timeToMaturity);

  return readContract(params.client, {
    ...callParameters(params),
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
    readonly user: `0x${string}`;
    readonly group: `0x${string}`;
  },
) {
  return readContract(params.client, {
    ...callParameters(params),
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
    readonly marketId: `0x${string}`;
    readonly offer: IOffer | Offer;
    readonly timeToMaturity: BigIntish;
  },
) {
  const offer = normalizeOffer(params.offer);
  assertNonNegative("offer.maxUnits", offer.maxUnits);
  assertNonNegative("offer.maxAssets", offer.maxAssets);
  const needsSettlementFee = offer.maxUnits === 0n;
  const timeToMaturity = needsSettlementFee
    ? BigInt(params.timeToMaturity)
    : 0n;
  if (needsSettlementFee) {
    assertNonNegative("timeToMaturity", timeToMaturity);
  }

  const consumedParams = {
    client: params.client,
    midnight: params.midnight,
    user: offer.maker,
    group: offer.group,
    ...callParameters(params),
  };

  if (shouldUseDeployless(params)) {
    let inputs:
      | {
          readonly consumed: bigint;
          readonly settlementFee: bigint;
        }
      | undefined;

    try {
      inputs = await readContract(params.client, {
        ...callParameters(params),
        abi: getConsumableUnitsInputsAbi,
        code: getConsumableUnitsInputsCode,
        functionName: "query",
        args: [
          params.midnight,
          params.marketId,
          offer.maker,
          offer.group,
          timeToMaturity,
          needsSettlementFee,
        ],
      });
    } catch (error) {
      if (params.deployless === "force") throw error;
      // Fallback to direct reads if deployless execution is unavailable.
    }

    if (inputs != null) {
      return ConsumableUnitsLib.consumableUnits({
        offer,
        consumed: inputs.consumed,
        settlementFee: inputs.settlementFee,
      });
    }
  }

  const [consumed, settlementFee] = needsSettlementFee
    ? await Promise.all([
        fetchConsumed({ ...consumedParams, deployless: false }),
        fetchSettlementFee({
          client: params.client,
          midnight: params.midnight,
          marketId: params.marketId,
          timeToMaturity,
          ...callParameters(params),
          deployless: false,
        }),
      ])
    : [await fetchConsumed({ ...consumedParams, deployless: false }), 0n];

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
export async function fetchRatifierInfo(
  params: {
    readonly client: Client;
    readonly maker: `0x${string}`;
    readonly ecrecoverRatifier: `0x${string}`;
    readonly setterRatifier: `0x${string}`;
  } & MidnightCallParameters,
): Promise<RatifierInfo> {
  const bytecode = await getBytecode(params.client, {
    ...bytecodeCallParameters(params),
    address: params.maker,
  });

  return RatifierUtils.getRatifierInfo({
    bytecode,
    ecrecoverRatifier: params.ecrecoverRatifier,
    setterRatifier: params.setterRatifier,
  });
}

/**
 * Fetches whether an EcrecoverRatifier root has been canceled for a maker.
 *
 * @param params - Fetch parameters.
 * @returns Root cancellation state.
 * @example
 * ```ts
 * import { fetchIsRootCanceled } from "@morpho-org/midnight-sdk";
 *
 * const canceled = await fetchIsRootCanceled({} as never);
 * console.log(canceled);
 * ```
 */
export function fetchIsRootCanceled(
  params: {
    readonly client: Client;
    readonly ecrecoverRatifier: `0x${string}`;
    readonly maker: `0x${string}`;
    readonly root: `0x${string}`;
  } & MidnightCallParameters,
) {
  return readContract(params.client, {
    ...callParameters(params),
    address: params.ecrecoverRatifier,
    abi: ecrecoverRatifierAbi,
    functionName: "isRootCanceled",
    args: [params.maker, params.root],
  });
}

/**
 * Fetches whether a SetterRatifier root has been ratified for a maker.
 *
 * @param params - Fetch parameters.
 * @returns Root ratification state.
 * @example
 * ```ts
 * import { fetchIsRootRatified } from "@morpho-org/midnight-sdk";
 *
 * const ratified = await fetchIsRootRatified({} as never);
 * console.log(ratified);
 * ```
 */
export function fetchIsRootRatified(
  params: {
    readonly client: Client;
    readonly setterRatifier: `0x${string}`;
    readonly maker: `0x${string}`;
    readonly root: `0x${string}`;
  } & MidnightCallParameters,
) {
  return readContract(params.client, {
    ...callParameters(params),
    address: params.setterRatifier,
    abi: setterRatifierAbi,
    functionName: "isRootRatified",
    args: [params.maker, params.root],
  });
}
