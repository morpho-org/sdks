import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";

import {
  ALLOWED_LLTVS,
  COLLATERAL_PARAMS_TYPEHASH,
  LIQUIDATION_CURSOR_LOW,
  MARKET_TYPEHASH,
  MAX_SETTLEMENT_FEES,
  WAD,
} from "../constants.js";
import { InvalidSettlementFeeIndexError } from "../errors.js";
import { mulDivDown, toBigInt } from "../internal.js";
import type { BigIntish } from "../types.js";
import {
  type IMarket,
  type Market,
  type MarketStruct,
  normalizeMarket,
} from "./Market.js";

const collateralParamsHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "token", type: "address" },
  { name: "lltv", type: "uint256" },
  { name: "maxLif", type: "uint256" },
  { name: "oracle", type: "address" },
] as const;

const marketHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "loanToken", type: "address" },
  { name: "collateralParamsHash", type: "bytes32" },
  { name: "maturity", type: "uint256" },
  { name: "rcfThreshold", type: "uint256" },
  { name: "enterGate", type: "address" },
  { name: "liquidatorGate", type: "address" },
] as const;

const hashCollateralParams = (
  params: MarketStruct["collateralParams"][number],
) =>
  keccak256(
    encodeAbiParameters(collateralParamsHashParams, [
      COLLATERAL_PARAMS_TYPEHASH,
      params.token,
      params.lltv,
      params.maxLif,
      params.oracle,
    ]),
  );

const hashPackedBytes32 = (values: readonly Hex[]) =>
  keccak256(`0x${values.map((value) => value.slice(2)).join("")}`);

/**
 * Domain helpers for normalized Midnight markets.
 *
 * @example
 * ```ts
 * import { MarketUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(MarketUtils.isLltvAllowed(770000000000000000n));
 * ```
 */
export namespace MarketUtils {
  /**
   * Returns the maximum settlement fee for an index.
   *
   * @param index - Settlement fee bucket index.
   * @returns Max WAD-scaled fee.
   * @throws InvalidSettlementFeeIndexError when the index is outside the fee table.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const max = MarketUtils.getMaxSettlementFee(0);
   * console.log(max);
   * ```
   */
  export function getMaxSettlementFee(index: number) {
    const fee = MAX_SETTLEMENT_FEES[index];
    if (fee == null) throw new InvalidSettlementFeeIndexError(index);

    return fee;
  }

  /**
   * Checks whether an LLTV is allowed by Midnight ConstantsLib.
   *
   * @param lltv - WAD-scaled LLTV.
   * @returns Whether the LLTV is in the deployed tier list.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(MarketUtils.isLltvAllowed(770000000000000000n));
   * ```
   */
  export function isLltvAllowed(lltv: BigIntish) {
    const normalized = toBigInt(lltv, "lltv");
    return ALLOWED_LLTVS.some((allowed) => allowed === normalized);
  }

  /**
   * Returns the maximum liquidation incentive factor for an LLTV and cursor.
   *
   * @param lltv - WAD-scaled LLTV.
   * @param cursor - WAD-scaled liquidation cursor.
   * @returns WAD-scaled maximum LIF.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const maxLif = MarketUtils.getMaxLif(770000000000000000n);
   * console.log(maxLif);
   * ```
   */
  export function getMaxLif(
    lltv: BigIntish,
    cursor: BigIntish = LIQUIDATION_CURSOR_LOW,
  ) {
    const normalizedLltv = toBigInt(lltv, "lltv");
    const normalizedCursor = toBigInt(cursor, "cursor");
    const denominator =
      WAD - mulDivDown(normalizedCursor, WAD - normalizedLltv, WAD);

    return mulDivDown(WAD, WAD, denominator);
  }

  /**
   * Computes the HashLib market struct hash.
   *
   * @param market - Market to hash.
   * @returns EIP-712 market struct hash.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const hash = MarketUtils.hashMarket({
   *   loanToken: "0x0000000000000000000000000000000000000001",
   *   collateralParams: [],
   *   maturity: 1n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * });
   * console.log(hash);
   * ```
   */
  export function hashMarket(market: IMarket | Market) {
    const normalized = normalizeMarket(market).toStruct();
    const collateralParamsHash = hashPackedBytes32(
      normalized.collateralParams.map(hashCollateralParams),
    );

    return keccak256(
      encodeAbiParameters(marketHashParams, [
        MARKET_TYPEHASH,
        normalized.loanToken,
        collateralParamsHash,
        normalized.maturity,
        normalized.rcfThreshold,
        normalized.enterGate,
        normalized.liquidatorGate,
      ]),
    );
  }

  /**
   * Computes the Midnight id for a market using `IdLib.toId`.
   *
   * @param market - Market to hash.
   * @param chainId - Midnight initial chain id.
   * @param midnight - Core Midnight contract address.
   * @returns Market id.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const id = MarketUtils.toId({
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
  export function toId(params: {
    readonly market: IMarket | Market;
    readonly chainId: BigIntish;
    readonly midnight: Address | string;
  }) {
    return normalizeMarket(params.market).toId(params.chainId, params.midnight);
  }
}
