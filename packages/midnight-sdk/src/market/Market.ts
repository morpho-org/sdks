import { assertNonNegative, type BigIntish } from "@morpho-org/morpho-ts";
import { encodeAbiParameters, encodePacked, keccak256 } from "viem";
import { CBP } from "../constants.js";

const SSTORE2_PREFIX = "0x600b380380600b5f395ff3" as const;

const SETTLEMENT_FEE_BREAKPOINTS = [
  0n,
  1n * 24n * 60n * 60n,
  7n * 24n * 60n * 60n,
  30n * 24n * 60n * 60n,
  90n * 24n * 60n * 60n,
  180n * 24n * 60n * 60n,
  360n * 24n * 60n * 60n,
] as const;

/**
 * Seven settlement-fee centibip buckets stored on a Midnight market.
 *
 * @example
 * ```ts
 * import type { SettlementFeeCbps } from "@morpho-org/midnight-sdk";
 *
 * const cbps: SettlementFeeCbps = [0, 0, 0, 0, 0, 0, 0];
 * console.log(cbps.length);
 * ```
 */
export type SettlementFeeCbps = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Plain collateral params input accepted by {@link MarketParams}.
 *
 * @example
 * ```ts
 * import type { ICollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params: ICollateralParams = {
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 770000000000000000n,
 *   maxLif: 1298701298701298701n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * ```
 */
export interface ICollateralParams {
  /** Collateral token address. */
  readonly token: `0x${string}` | string;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: BigIntish;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: BigIntish;
  /** Oracle address for this collateral. */
  readonly oracle: `0x${string}` | string;
}

/**
 * Normalized Midnight collateral params and ABI tuple shape.
 *
 * @example
 * ```ts
 * import type { CollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params: CollateralParams = {
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 770000000000000000n,
 *   maxLif: 1298701298701298701n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * console.log(params.lltv);
 * ```
 */
export interface CollateralParams {
  /** Collateral token address. */
  readonly token: `0x${string}`;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: bigint;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: bigint;
  /** Oracle address for this collateral. */
  readonly oracle: `0x${string}`;
}

/**
 * Plain input accepted by {@link MarketParams}.
 *
 * @example
 * ```ts
 * import type { IMarketParams } from "@morpho-org/midnight-sdk";
 *
 * const params: IMarketParams = {
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * };
 * ```
 */
export interface IMarketParams {
  /** Loan token address. */
  readonly loanToken: `0x${string}` | string;
  /** Collateral definitions sorted as expected by Midnight. */
  readonly collateralParams: readonly (ICollateralParams | CollateralParams)[];
  /** Market maturity timestamp. */
  readonly maturity: BigIntish;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: BigIntish;
  /** Optional entry gate. */
  readonly enterGate: `0x${string}` | string;
  /** Optional liquidation gate. */
  readonly liquidatorGate: `0x${string}` | string;
}

/**
 * Immutable Midnight market configuration.
 *
 * @example
 * ```ts
 * import { MarketParams } from "@morpho-org/midnight-sdk";
 *
 * const params = new MarketParams({
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * });
 * console.log(params.loanToken);
 * ```
 */
export class MarketParams {
  /** Loan token address. */
  public readonly loanToken: `0x${string}`;

  /** Collateral definitions. */
  public readonly collateralParams: readonly CollateralParams[];

  /** Market maturity timestamp. */
  public readonly maturity: bigint;

  /** Recovery close factor threshold. */
  public readonly rcfThreshold: bigint;

  /** Entry gate address. */
  public readonly enterGate: `0x${string}`;

  /** Liquidator gate address. */
  public readonly liquidatorGate: `0x${string}`;

  public constructor(params: IMarketParams) {
    this.loanToken = params.loanToken as `0x${string}`;
    this.collateralParams = params.collateralParams.map(
      normalizeCollateralParams,
    );
    this.maturity = BigInt(params.maturity);
    this.rcfThreshold = BigInt(params.rcfThreshold);
    this.enterGate = params.enterGate as `0x${string}`;
    this.liquidatorGate = params.liquidatorGate as `0x${string}`;
  }
}

/**
 * ABI tuple shape for Midnight market params.
 *
 * @example
 * ```ts
 * import type { MarketParamsStruct } from "@morpho-org/midnight-sdk";
 *
 * const params: MarketParamsStruct = {
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * };
 * console.log(params.maturity);
 * ```
 */
export interface MarketParamsStruct {
  /** Loan token address. */
  readonly loanToken: `0x${string}`;
  /** Collateral definitions. */
  readonly collateralParams: readonly CollateralParams[];
  /** Market maturity timestamp. */
  readonly maturity: bigint;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: bigint;
  /** Entry gate address. */
  readonly enterGate: `0x${string}`;
  /** Liquidator gate address. */
  readonly liquidatorGate: `0x${string}`;
}

/**
 * Plain input accepted by {@link Market}.
 *
 * @example
 * ```ts
 * import type { IMarket } from "@morpho-org/midnight-sdk";
 *
 * const market: IMarket = {
 *   id: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *   params: {
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [],
 *     maturity: 1n,
 *     rcfThreshold: 0n,
 *     enterGate: "0x0000000000000000000000000000000000000000",
 *     liquidatorGate: "0x0000000000000000000000000000000000000000",
 *   },
 *   totalUnits: 0n,
 *   lossFactor: 0n,
 *   withdrawable: 0n,
 *   continuousFeeCredit: 0n,
 *   settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
 *   continuousFee: 0,
 *   tickSpacing: 4,
 * };
 * ```
 */
export interface IMarket {
  /** Market id. */
  readonly id: `0x${string}`;
  /** Immutable market configuration. */
  readonly params: IMarketParams | MarketParams;
  /** Total market units. */
  readonly totalUnits: BigIntish;
  /** Current loss factor. */
  readonly lossFactor: BigIntish;
  /** Withdrawable assets. */
  readonly withdrawable: BigIntish;
  /** Continuous-fee credit. */
  readonly continuousFeeCredit: BigIntish;
  /** Seven settlement-fee cbp buckets. */
  readonly settlementFeeCbps: SettlementFeeCbps;
  /** Continuous fee per second. */
  readonly continuousFee: number;
  /** Market tick spacing. */
  readonly tickSpacing: number;
}

/**
 * Hydrated Midnight market configuration plus state.
 *
 * @example
 * ```ts
 * import { Market } from "@morpho-org/midnight-sdk";
 *
 * const market = new Market({} as never);
 * console.log(market.timeToMaturity(0n));
 * ```
 */
export class Market {
  /** Market id. */
  public readonly id: `0x${string}`;

  /** Immutable market configuration. */
  public readonly params: MarketParams;

  /** Total market units. */
  public readonly totalUnits: bigint;

  /** Current loss factor. */
  public readonly lossFactor: bigint;

  /** Withdrawable assets. */
  public readonly withdrawable: bigint;

  /** Continuous-fee credit. */
  public readonly continuousFeeCredit: bigint;

  /** Seven settlement-fee cbp buckets. */
  public readonly settlementFeeCbps: SettlementFeeCbps;

  /** Continuous fee per second. */
  public readonly continuousFee: number;

  /** Market tick spacing. */
  public readonly tickSpacing: number;

  public constructor(market: IMarket) {
    this.id = market.id;
    this.params = normalizeMarketParams(market.params);
    this.totalUnits = BigInt(market.totalUnits);
    this.lossFactor = BigInt(market.lossFactor);
    this.withdrawable = BigInt(market.withdrawable);
    this.continuousFeeCredit = BigInt(market.continuousFeeCredit);
    this.settlementFeeCbps = [...market.settlementFeeCbps] as SettlementFeeCbps;
    this.continuousFee = market.continuousFee;
    this.tickSpacing = market.tickSpacing;
  }

  /**
   * Computes the Midnight id for this market's params.
   *
   * @param chainId - Chain id used by Midnight's `INITIAL_CHAIN_ID`.
   * @param midnight - Core Midnight contract address.
   * @returns Market id matching `IdLib.toId`.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * const id = new Market({} as never).toId(8453, "0x0000000000000000000000000000000000000002");
   * console.log(id);
   * ```
   */
  public toId(chainId: BigIntish, midnight: `0x${string}` | string) {
    return computeMarketId({ market: this.params, chainId, midnight });
  }

  /**
   * Returns whether a timestamp is at or past maturity.
   *
   * @param timestamp - Timestamp to compare.
   * @returns Whether the market has reached maturity.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * console.log(new Market({} as never).isMature(0n));
   * ```
   */
  public isMature(timestamp: BigIntish) {
    const normalizedTimestamp = BigInt(timestamp);
    assertNonNegative("timestamp", normalizedTimestamp);

    return normalizedTimestamp >= this.params.maturity;
  }

  /**
   * Returns the non-negative time remaining before maturity.
   *
   * @param timestamp - Timestamp to compare.
   * @returns Seconds until maturity, floored to zero.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * console.log(new Market({} as never).timeToMaturity(0n));
   * ```
   */
  public timeToMaturity(timestamp: BigIntish) {
    const normalizedTimestamp = BigInt(timestamp);
    assertNonNegative("timestamp", normalizedTimestamp);

    return normalizedTimestamp >= this.params.maturity
      ? 0n
      : this.params.maturity - normalizedTimestamp;
  }

  /**
   * Computes the settlement fee for a time to maturity from the hydrated market state.
   *
   * @param timeToMaturity - Seconds until maturity.
   * @returns WAD-scaled settlement fee.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * console.log(new Market({} as never).getSettlementFee(0n));
   * ```
   */
  public getSettlementFee(timeToMaturity: BigIntish) {
    const ttm = BigInt(timeToMaturity);
    assertNonNegative("timeToMaturity", ttm);

    const lastIndex = SETTLEMENT_FEE_BREAKPOINTS.length - 1;
    const lastBreakpoint = SETTLEMENT_FEE_BREAKPOINTS[lastIndex]!;
    if (ttm >= lastBreakpoint) return this.getSettlementFeeAtIndex(lastIndex);

    const upperIndex = SETTLEMENT_FEE_BREAKPOINTS.findIndex(
      (breakpoint) => ttm < breakpoint,
    );
    const lowerIndex = upperIndex - 1;
    const start = SETTLEMENT_FEE_BREAKPOINTS[lowerIndex]!;
    const end = SETTLEMENT_FEE_BREAKPOINTS[upperIndex]!;
    const feeLower = this.getSettlementFeeAtIndex(lowerIndex);
    const feeUpper = this.getSettlementFeeAtIndex(upperIndex);

    return (feeLower * (end - ttm) + feeUpper * (ttm - start)) / (end - start);
  }

  /**
   * Returns collateral params by numeric index.
   *
   * @param index - Collateral index.
   * @returns Collateral params, or undefined when the index is not configured.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * const params = new Market({} as never).getCollateralParamsByIndex(0);
   * console.log(params?.token);
   * ```
   */
  public getCollateralParamsByIndex(index: BigIntish) {
    const normalizedIndex = BigInt(index);
    if (
      normalizedIndex < 0n ||
      normalizedIndex > BigInt(Number.MAX_SAFE_INTEGER)
    )
      return undefined;

    return this.params.collateralParams[Number(normalizedIndex)];
  }

  /**
   * Returns the configured collateral index for a token.
   *
   * @param token - Collateral token address.
   * @returns Collateral index, or undefined when the token is not configured.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * const index = new Market({} as never).getCollateralIndexByToken("0x0000000000000000000000000000000000000001");
   * console.log(index);
   * ```
   */
  public getCollateralIndexByToken(token: `0x${string}` | string) {
    const expectedToken = token.toLowerCase();
    const index = this.params.collateralParams.findIndex(
      (params) => params.token.toLowerCase() === expectedToken,
    );

    return index === -1 ? undefined : index;
  }

  /**
   * Returns collateral params by token address.
   *
   * @param token - Collateral token address.
   * @returns Collateral params, or undefined when the token is not configured.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * const params = new Market({} as never).getCollateralParamsByToken("0x0000000000000000000000000000000000000001");
   * console.log(params?.lltv);
   * ```
   */
  public getCollateralParamsByToken(token: `0x${string}` | string) {
    const index = this.getCollateralIndexByToken(token);

    return index == null ? undefined : this.params.collateralParams[index];
  }

  private getSettlementFeeAtIndex(index: number) {
    return BigInt(this.settlementFeeCbps[index]!) * CBP;
  }
}

/**
 * @internal Normalizes a collateral params input.
 *
 * @param params - Collateral params input.
 * @returns Normalized collateral params.
 */
export function normalizeCollateralParams(
  params: ICollateralParams | CollateralParams,
): CollateralParams {
  return {
    token: params.token as `0x${string}`,
    lltv: BigInt(params.lltv),
    maxLif: BigInt(params.maxLif),
    oracle: params.oracle as `0x${string}`,
  };
}

/**
 * @internal Normalizes market params from config or hydrated market input.
 *
 * @param market - Market params or hydrated market.
 * @returns Market params instance.
 */
export function normalizeMarketParams(
  market: IMarketParams | MarketParams | Market,
) {
  if (market instanceof Market) return market.params;
  return market instanceof MarketParams ? market : new MarketParams(market);
}

/**
 * @internal Converts market params into the tuple object expected by viem ABI encoders.
 *
 * @param market - Market params or hydrated market.
 * @returns ABI-compatible market params.
 */
export function marketParamsToStruct(
  market: IMarketParams | MarketParams | Market,
): MarketParamsStruct {
  const params = normalizeMarketParams(market);

  return {
    loanToken: params.loanToken,
    collateralParams: params.collateralParams.map((collateralParams) => ({
      token: collateralParams.token,
      lltv: collateralParams.lltv,
      maxLif: collateralParams.maxLif,
      oracle: collateralParams.oracle,
    })),
    maturity: params.maturity,
    rcfThreshold: params.rcfThreshold,
    enterGate: params.enterGate,
    liquidatorGate: params.liquidatorGate,
  };
}

/**
 * @internal ABI parameter for the canonical Solidity `Market` tuple.
 */
export const marketParamsAbiParameter = {
  type: "tuple",
  components: [
    { name: "loanToken", type: "address" },
    {
      name: "collateralParams",
      type: "tuple[]",
      components: [
        { name: "token", type: "address" },
        { name: "lltv", type: "uint256" },
        { name: "maxLif", type: "uint256" },
        { name: "oracle", type: "address" },
      ],
    },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
} as const;

/**
 * Computes the Midnight id for market params using Solidity `IdLib.toId`.
 *
 * @param market - Market params to hash.
 * @param chainId - Chain id used by Midnight.
 * @param midnight - Midnight contract address.
 * @returns Market id.
 * @example
 * ```ts
 * import { computeMarketId } from "@morpho-org/midnight-sdk";
 *
 * const id = computeMarketId({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [],
 *     maturity: 1n,
 *     rcfThreshold: 0n,
 *     enterGate: "0x0000000000000000000000000000000000000000",
 *     liquidatorGate: "0x0000000000000000000000000000000000000000",
 *   },
 *   chainId: 8453,
 *   midnight: "0x0000000000000000000000000000000000000002",
 * });
 * console.log(id);
 * ```
 */
export function computeMarketId(params: {
  readonly market: IMarketParams | MarketParams | Market;
  readonly chainId: BigIntish;
  readonly midnight: `0x${string}` | string;
}) {
  const encodedMarket = encodeAbiParameters(
    [marketParamsAbiParameter],
    [marketParamsToStruct(params.market)],
  );
  const creationHash = keccak256(`${SSTORE2_PREFIX}${encodedMarket.slice(2)}`);

  return keccak256(
    encodePacked(
      ["uint8", "address", "uint256", "bytes32"],
      [
        255,
        params.midnight as `0x${string}`,
        BigInt(params.chainId),
        creationHash,
      ],
    ),
  );
}
