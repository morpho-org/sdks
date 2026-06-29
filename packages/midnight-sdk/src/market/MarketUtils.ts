import {
  assertNonNegative,
  type BigIntish,
  MathLib,
} from "@morpho-org/morpho-ts";
import { concat, encodeAbiParameters, encodePacked, keccak256 } from "viem";
import {
  CBP,
  COLLATERAL_PARAMS_TYPEHASH,
  MARKET_TYPEHASH,
  SETTLEMENT_FEE_BREAKPOINTS,
} from "../constants.js";
import { InvalidMarketParameterError } from "../errors.js";
import {
  type CollateralParams,
  type ICollateralParams,
  type MarketInput,
  MarketParams,
  type SettlementFeeCbps,
} from "./Market.js";

const SSTORE2_PREFIX = "0x600b380380600b5f395ff3" as const;

const collateralParamsHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "token", type: "address" },
  { name: "lltv", type: "uint256" },
  { name: "liquidationCursor", type: "uint256" },
  { name: "oracle", type: "address" },
] as const;

const marketHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "midnight", type: "address" },
  { name: "loanToken", type: "address" },
  { name: "collateralParamsHash", type: "bytes32" },
  { name: "maturity", type: "uint256" },
  { name: "rcfThreshold", type: "uint256" },
  { name: "enterGate", type: "address" },
  { name: "liquidatorGate", type: "address" },
] as const;

const marketParamsAbiParameter = {
  type: "tuple",
  components: [
    { name: "chainId", type: "uint256" },
    { name: "midnight", type: "address" },
    { name: "loanToken", type: "address" },
    {
      name: "collateralParams",
      type: "tuple[]",
      components: [
        { name: "token", type: "address" },
        { name: "lltv", type: "uint256" },
        { name: "liquidationCursor", type: "uint256" },
        { name: "oracle", type: "address" },
      ],
    },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
} as const;

type CollateralParamsInput = ICollateralParams | CollateralParams;

/**
 * Domain helpers for Midnight markets.
 *
 * @example
 * ```ts
 * import { MarketUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof MarketUtils.hash);
 * ```
 */
export namespace MarketUtils {
  /**
   * Converts collateral params from a plain input or ABI tuple.
   *
   * @param params.token - Collateral token address.
   * @param params.lltv - WAD-scaled liquidation loan-to-value.
   * @param params.liquidationCursor - WAD-scaled liquidation cursor.
   * @param params.oracle - Oracle address used to price this collateral.
   * @returns Collateral params with bigint fields.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const collateral = MarketUtils.toCollateralParams({
   *   token: "0x0000000000000000000000000000000000000001",
   *   lltv: 770000000000000000n,
   *   liquidationCursor: 250000000000000000n,
   *   oracle: "0x0000000000000000000000000000000000000002",
   * });
   * console.log(collateral.liquidationCursor);
   * ```
   */
  export function toCollateralParams(
    params: CollateralParamsInput,
  ): CollateralParams {
    let lltv: bigint;
    let liquidationCursor: bigint;
    try {
      lltv = BigInt(params.lltv);
      liquidationCursor = BigInt(params.liquidationCursor);
    } catch (cause) {
      throw new InvalidMarketParameterError({
        parameter: "collateralParams",
        value: params,
        instruction:
          "Provide bigint-compatible lltv and liquidationCursor values.",
        cause,
      });
    }

    return {
      token: params.token,
      lltv,
      liquidationCursor,
      oracle: params.oracle,
    };
  }

  /**
   * Converts market params into the tuple object expected by viem ABI encoders.
   *
   * @param market - Market params or hydrated market.
   * @returns ABI-compatible market params.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const struct = MarketUtils.toStruct({
   *   chainId: 8453,
   *   midnight: "0x0000000000000000000000000000000000001000",
   *   loanToken: "0x0000000000000000000000000000000000006000",
   *   collateralParams: [
   *     {
   *       token: "0x0000000000000000000000000000000000007000",
   *       lltv: 770000000000000000n,
   *       liquidationCursor: 250000000000000000n,
   *       oracle: "0x0000000000000000000000000000000000008000",
   *     },
   *   ],
   *   maturity: 54_000n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * console.log(struct.maturity);
   * ```
   */
  export function toStruct(market: MarketInput): MarketParams {
    const params = MarketParams.from(market);

    return {
      chainId: params.chainId,
      midnight: params.midnight,
      loanToken: params.loanToken,
      collateralParams: params.collateralParams.map((collateral) => ({
        token: collateral.token,
        lltv: collateral.lltv,
        liquidationCursor: collateral.liquidationCursor,
        oracle: collateral.oracle,
      })),
      maturity: params.maturity,
      rcfThreshold: params.rcfThreshold,
      enterGate: params.enterGate,
      liquidatorGate: params.liquidatorGate,
    };
  }

  /**
   * Returns the liquidation incentive factor for an LLTV and liquidation cursor.
   *
   * @param input - WAD-scaled LLTV or collateral params carrying an LLTV.
   * @param cursor - WAD-scaled liquidation cursor.
   * @returns WAD-scaled liquidation incentive factor.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const liquidationIncentiveFactor = MarketUtils.getLiquidationIncentiveFactor(
   *   770000000000000000n,
   *   250000000000000000n,
   * );
   * console.log(liquidationIncentiveFactor);
   * ```
   */
  export function getLiquidationIncentiveFactor(
    input: BigIntish | Pick<CollateralParamsInput, "lltv">,
    cursor: BigIntish,
  ) {
    const lltv = typeof input === "object" ? input.lltv : input;
    const cursorValue = BigInt(cursor);
    const denominator =
      MathLib.WAD -
      MathLib.mulDiv(
        cursorValue,
        MathLib.WAD - BigInt(lltv),
        MathLib.WAD,
        "Down",
      );

    return MathLib.mulDiv(MathLib.WAD, MathLib.WAD, denominator, "Down");
  }

  /**
   * Computes the Midnight settlement fee from market cbp buckets and time to maturity.
   *
   * This mirrors Midnight `settlementFee`: cbp buckets are scaled by {@link CBP},
   * values are linearly interpolated between {@link SETTLEMENT_FEE_BREAKPOINTS},
   * and any time to maturity at or above 360 days uses the last bucket.
   *
   * @param params.settlementFeeCbps - Seven settlement-fee centibip buckets from the market state.
   * @param params.timeToMaturity - Seconds until market maturity.
   * @returns WAD-scaled settlement fee.
   * @throws {NegativeValueError} when `timeToMaturity` is negative.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const fee = MarketUtils.getSettlementFee({
   *   settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *   timeToMaturity: 12n * 60n * 60n,
   * });
   * console.log(fee);
   * ```
   */
  export function getSettlementFee(params: {
    readonly settlementFeeCbps: SettlementFeeCbps;
    readonly timeToMaturity: BigIntish;
  }) {
    const timeToMaturity = BigInt(params.timeToMaturity);
    assertNonNegative("timeToMaturity", timeToMaturity);

    const lastIndex = SETTLEMENT_FEE_BREAKPOINTS.length - 1;
    const lastBreakpoint = SETTLEMENT_FEE_BREAKPOINTS[lastIndex]!;
    if (timeToMaturity >= lastBreakpoint) {
      return BigInt(params.settlementFeeCbps[lastIndex]!) * CBP;
    }

    const upperIndex = SETTLEMENT_FEE_BREAKPOINTS.findIndex(
      (breakpoint) => timeToMaturity < breakpoint,
    );
    const lowerIndex = upperIndex - 1;
    const start = SETTLEMENT_FEE_BREAKPOINTS[lowerIndex]!;
    const end = SETTLEMENT_FEE_BREAKPOINTS[upperIndex]!;
    const feeLower = BigInt(params.settlementFeeCbps[lowerIndex]!) * CBP;
    const feeUpper = BigInt(params.settlementFeeCbps[upperIndex]!) * CBP;

    return (
      (feeLower * (end - timeToMaturity) +
        feeUpper * (timeToMaturity - start)) /
      (end - start)
    );
  }

  /**
   * Computes the HashLib market params struct hash.
   *
   * Hashing canonicalizes non-empty collateral params by token order and
   * preserves the protocol-zero empty market used for tree padding. It does
   * not validate every market creation rule. Use {@link MarketParams} when
   * constructing user-facing market params.
   *
   * @param market - Market to hash.
   * @returns EIP-712 market struct hash.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const hash = MarketUtils.hash({
   *   chainId: 8453,
   *   midnight: "0x0000000000000000000000000000000000001000",
   *   loanToken: "0x0000000000000000000000000000000000000001",
   *   collateralParams: [
   *     {
   *       token: "0x0000000000000000000000000000000000000002",
   *       lltv: 770000000000000000n,
   *       liquidationCursor: 250000000000000000n,
   *       oracle: "0x0000000000000000000000000000000000000003",
   *     },
   *   ],
   *   maturity: 1n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * console.log(hash);
   * ```
   */
  export function hash(market: MarketInput) {
    const marketParams = "params" in market ? market.params : market;
    const collateralParams =
      marketParams.collateralParams.length === 0
        ? marketParams.collateralParams
        : [...marketParams.collateralParams].sort((a, b) =>
            a.token.toLowerCase() < b.token.toLowerCase() ? -1 : 1,
          );
    const collateralParamHashes = collateralParams.map((params) =>
      keccak256(
        encodeAbiParameters(collateralParamsHashParams, [
          COLLATERAL_PARAMS_TYPEHASH,
          params.token,
          BigInt(params.lltv),
          BigInt(params.liquidationCursor),
          params.oracle,
        ]),
      ),
    );
    const collateralParamsHash = keccak256(concat(collateralParamHashes));

    return keccak256(
      encodeAbiParameters(marketHashParams, [
        MARKET_TYPEHASH,
        BigInt(marketParams.chainId),
        marketParams.midnight,
        marketParams.loanToken,
        collateralParamsHash,
        BigInt(marketParams.maturity),
        BigInt(marketParams.rcfThreshold),
        marketParams.enterGate,
        marketParams.liquidatorGate,
      ]),
    );
  }

  /**
   * Computes the Midnight id for a market using `IdLib.toId`.
   *
   * @param market - Market to hash.
   * @returns Market id.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const id = MarketUtils.toId({
   *   chainId: 8453,
   *   midnight: "0x0000000000000000000000000000000000001000",
   *   loanToken: "0x0000000000000000000000000000000000000001",
   *   collateralParams: [
   *     {
   *       token: "0x0000000000000000000000000000000000000002",
   *       lltv: 770000000000000000n,
   *       liquidationCursor: 250000000000000000n,
   *       oracle: "0x0000000000000000000000000000000000000003",
   *     },
   *   ],
   *   maturity: 1n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * console.log(id);
   * ```
   */
  export function toId(market: MarketInput) {
    const marketParams = MarketParams.from(market);
    const encodedMarket = encodeAbiParameters(
      [marketParamsAbiParameter],
      [toStruct(marketParams)],
    );
    const creationHash = keccak256(concat([SSTORE2_PREFIX, encodedMarket]));

    return keccak256(
      encodePacked(
        ["uint8", "address", "uint256", "bytes32"],
        [255, marketParams.midnight, 0n, creationHash],
      ),
    );
  }
}
