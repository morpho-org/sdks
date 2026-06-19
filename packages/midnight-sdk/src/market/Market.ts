import { assertNonNegative, type BigIntish } from "@morpho-org/morpho-ts";
import type { Address, Hash } from "viem";
import { MarketUtils } from "./MarketUtils.js";

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
 *   maxLif: 1061007957559681697n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * ```
 */
export interface ICollateralParams {
  /** Collateral token address. */
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: BigIntish;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: BigIntish;
  /** Oracle address for this collateral. */
  readonly oracle: Address;
}

/**
 * Normalized Midnight collateral params.
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
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: bigint;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: bigint;
  /** Oracle address for this collateral. */
  readonly oracle: Address;
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
  readonly loanToken: Address;
  /** Collateral definitions sorted as expected by Midnight. */
  readonly collateralParams: readonly (ICollateralParams | CollateralParams)[];
  /** Market maturity timestamp. */
  readonly maturity: BigIntish;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: BigIntish;
  /** Optional entry gate. */
  readonly enterGate: Address;
  /** Optional liquidation gate. */
  readonly liquidatorGate: Address;
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
  public readonly loanToken: Address;

  /** Collateral definitions. */
  public readonly collateralParams: readonly CollateralParams[];

  /** Market maturity timestamp. */
  public readonly maturity: bigint;

  /** Recovery close factor threshold. */
  public readonly rcfThreshold: bigint;

  /** Entry gate address. */
  public readonly enterGate: Address;

  /** Liquidator gate address. */
  public readonly liquidatorGate: Address;

  public constructor(params: IMarketParams) {
    this.loanToken = params.loanToken;
    this.collateralParams = params.collateralParams.map(
      MarketUtils.toCollateralParams,
    );
    this.maturity = BigInt(params.maturity);
    this.rcfThreshold = BigInt(params.rcfThreshold);
    this.enterGate = params.enterGate;
    this.liquidatorGate = params.liquidatorGate;
  }

  /**
   * Returns market params from a params object or hydrated market.
   *
   * Use at boundaries that accept either a standalone market config or a full
   * market object. Existing `MarketParams` instances are returned as-is.
   *
   * @param market - Market params or hydrated market.
   * @returns Market params instance.
   * @example
   * ```ts
   * import { MarketParams } from "@morpho-org/midnight-sdk";
   *
   * const params = MarketParams.from({
   *   loanToken: "0x0000000000000000000000000000000000006000",
   *   collateralParams: [
   *     {
   *       token: "0x0000000000000000000000000000000000007000",
   *       lltv: 770000000000000000n,
   *       maxLif: 1061007957559681697n,
   *       oracle: "0x0000000000000000000000000000000000008000",
   *     },
   *   ],
   *   maturity: 54_000n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * console.log(params.loanToken);
   * ```
   */
  public static from(market: MarketInput): MarketParams {
    if ("params" in market) return MarketParams.from(market.params);
    return market instanceof MarketParams ? market : new MarketParams(market);
  }
}

/**
 * Plain input accepted by {@link Market}.
 *
 * @example
 * ```ts
 * import type { IMarket } from "@morpho-org/midnight-sdk";
 *
 * const market: IMarket = {
 *   chainId: 31337,
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
  /** EIP-155 chain id used to derive the market id. */
  readonly chainId: BigIntish;
  /** Immutable market configuration. */
  readonly params: IMarketParams;
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
 * Plain market params or hydrated market object accepted by market helpers.
 *
 * @example
 * ```ts
 * import type { MarketInput } from "@morpho-org/midnight-sdk";
 *
 * const market: MarketInput = {
 *   loanToken: "0x0000000000000000000000000000000000006000",
 *   collateralParams: [],
 *   maturity: 54_000n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * };
 * console.log(market.loanToken);
 * ```
 */
export type MarketInput = IMarketParams | IMarket;

/**
 * Hydrated Midnight market configuration plus state.
 *
 * @example
 * ```ts
 * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
 * import { Market } from "@morpho-org/midnight-sdk";
 *
 * registerCustomAddresses({
 *   addresses: {
 *     31337: {
 *       morpho: "0x0000000000000000000000000000000000000001",
 *       bundler3: {
 *         bundler3: "0x0000000000000000000000000000000000000002",
 *         generalAdapter1: "0x0000000000000000000000000000000000000003",
 *       },
 *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
 *       midnight: "0x0000000000000000000000000000000000001000",
 *     },
 *   },
 * });
 *
 * const market = new Market({
 *   chainId: 31337,
 *   params: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         maxLif: 1061007957559681697n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: "0x0000000000000000000000000000000000000000",
 *     liquidatorGate: "0x0000000000000000000000000000000000000000",
 *   },
 *   totalUnits: 1_000n,
 *   lossFactor: 0n,
 *   withdrawable: 500n,
 *   continuousFeeCredit: 0n,
 *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
 *   continuousFee: 10,
 *   tickSpacing: 4,
 * });
 * console.log(market.timeToMaturity(0n));
 * ```
 */
export class Market {
  /** Market id. */
  public readonly id: Hash;

  /** EIP-155 chain id used to derive the market id. */
  public readonly chainId: bigint;

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
    this.chainId = BigInt(market.chainId);
    this.params = MarketParams.from(market.params);
    this.id = MarketUtils.toId({ market: this.params, chainId: this.chainId });
    this.totalUnits = BigInt(market.totalUnits);
    this.lossFactor = BigInt(market.lossFactor);
    this.withdrawable = BigInt(market.withdrawable);
    this.continuousFeeCredit = BigInt(market.continuousFeeCredit);
    this.settlementFeeCbps = [...market.settlementFeeCbps] as SettlementFeeCbps;
    this.continuousFee = market.continuousFee;
    this.tickSpacing = market.tickSpacing;
  }

  /**
   * Returns the non-negative time remaining before maturity.
   *
   * @param timestamp - Timestamp to compare.
   * @returns Seconds until maturity, floored to zero.
   * @throws {NegativeValueError} when `timestamp` is negative.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const market = new Market({
   *   chainId: 31337,
   *   params: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   totalUnits: 1_000n,
   *   lossFactor: 0n,
   *   withdrawable: 500n,
   *   continuousFeeCredit: 0n,
   *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *   continuousFee: 10,
   *   tickSpacing: 4,
   * });
   * console.log(market.timeToMaturity(0n));
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
   * @throws {NegativeValueError} when `timeToMaturity` is negative.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const market = new Market({
   *   chainId: 31337,
   *   params: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   totalUnits: 1_000n,
   *   lossFactor: 0n,
   *   withdrawable: 500n,
   *   continuousFeeCredit: 0n,
   *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *   continuousFee: 10,
   *   tickSpacing: 4,
   * });
   * console.log(market.getSettlementFee(0n));
   * ```
   */
  public getSettlementFee(timeToMaturity: BigIntish) {
    return MarketUtils.getSettlementFee({
      settlementFeeCbps: this.settlementFeeCbps,
      timeToMaturity,
    });
  }

  /**
   * Returns collateral params by numeric index.
   *
   * @param index - Collateral index.
   * @returns Collateral params, or undefined when the index is not configured.
   * @example
   * ```ts
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const market = new Market({
   *   chainId: 31337,
   *   params: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   totalUnits: 1_000n,
   *   lossFactor: 0n,
   *   withdrawable: 500n,
   *   continuousFeeCredit: 0n,
   *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *   continuousFee: 10,
   *   tickSpacing: 4,
   * });
   * const params = market.getCollateralParamsByIndex(0);
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
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const collateralToken = "0x0000000000000000000000000000000000007000";
   * const market = new Market({
   *   chainId: 31337,
   *   params: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: collateralToken,
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   totalUnits: 1_000n,
   *   lossFactor: 0n,
   *   withdrawable: 500n,
   *   continuousFeeCredit: 0n,
   *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *   continuousFee: 10,
   *   tickSpacing: 4,
   * });
   * const index = market.getCollateralIndexByToken(collateralToken);
   * console.log(index);
   * ```
   */
  public getCollateralIndexByToken(token: Address) {
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
   * import { registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     31337: {
   *       morpho: "0x0000000000000000000000000000000000000001",
   *       bundler3: {
   *         bundler3: "0x0000000000000000000000000000000000000002",
   *         generalAdapter1: "0x0000000000000000000000000000000000000003",
   *       },
   *       adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
   *       midnight: "0x0000000000000000000000000000000000001000",
   *     },
   *   },
   * });
   *
   * const collateralToken = "0x0000000000000000000000000000000000007000";
   * const market = new Market({
   *   chainId: 31337,
   *   params: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: collateralToken,
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   totalUnits: 1_000n,
   *   lossFactor: 0n,
   *   withdrawable: 500n,
   *   continuousFeeCredit: 0n,
   *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *   continuousFee: 10,
   *   tickSpacing: 4,
   * });
   * const params = market.getCollateralParamsByToken(collateralToken);
   * console.log(params?.lltv);
   * ```
   */
  public getCollateralParamsByToken(token: Address) {
    const index = this.getCollateralIndexByToken(token);

    return index == null ? undefined : this.params.collateralParams[index];
  }
}
