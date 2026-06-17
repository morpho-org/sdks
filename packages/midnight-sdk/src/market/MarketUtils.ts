import {
  type BigIntish,
  getChainAddress,
  MathLib,
} from "@morpho-org/morpho-ts";
import { concat, encodeAbiParameters, encodePacked, keccak256 } from "viem";
import {
  ALLOWED_LLTVS,
  COLLATERAL_PARAMS_TYPEHASH,
  MARKET_TYPEHASH,
} from "../constants.js";
import {
  type CollateralParams,
  type CollateralParamsStruct,
  type ICollateralParams,
  type IMarket,
  type IMarketParams,
  MarketParams,
  type MarketParamsStruct,
  marketParamsAbiParameter,
} from "./Market.js";

const SSTORE2_PREFIX = "0x600b380380600b5f395ff3" as const;

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

type CollateralParamsInput =
  | ICollateralParams
  | CollateralParams
  | CollateralParamsStruct;

/**
 * Plain market params or hydrated market object accepted by market utilities.
 *
 * @example
 * ```ts
 * import type { MarketInput } from "@morpho-org/midnight-sdk";
 *
 * const market = {} as MarketInput;
 * console.log(market);
 * ```
 */
export type MarketInput = IMarketParams | IMarket;

/**
 * Domain helpers for Midnight markets.
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
   * Normalizes collateral params from a plain input or ABI tuple.
   *
   * @param params - Collateral params input.
   * @returns Normalized collateral params.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const collateral = MarketUtils.normalizeCollateralParams({
   *   token: "0x0000000000000000000000000000000000000001",
   *   lltv: 770000000000000000n,
   *   maxLiquidationIncentiveFactor: 1061007957559681697n,
   *   oracle: "0x0000000000000000000000000000000000000002",
   * });
   * console.log(collateral.maxLiquidationIncentiveFactor);
   * ```
   */
  export function normalizeCollateralParams(
    params: CollateralParamsInput,
  ): CollateralParams {
    const maxLiquidationIncentiveFactor =
      "maxLif" in params ? params.maxLif : params.maxLiquidationIncentiveFactor;

    return {
      token: params.token,
      lltv: BigInt(params.lltv),
      maxLiquidationIncentiveFactor: BigInt(maxLiquidationIncentiveFactor),
      oracle: params.oracle,
    };
  }

  /**
   * Normalizes market params from config or hydrated market input.
   *
   * @param market - Market params or hydrated market.
   * @returns Market params instance.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const params = MarketUtils.normalizeMarketParams({} as never);
   * console.log(params.loanToken);
   * ```
   */
  export function normalizeMarketParams(market: MarketInput) {
    if ("params" in market) return normalizeMarketParams(market.params);
    return market instanceof MarketParams ? market : new MarketParams(market);
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
   * const struct = MarketUtils.toStruct({} as never);
   * console.log(struct.maturity);
   * ```
   */
  export function toStruct(market: MarketInput): MarketParamsStruct {
    const params = normalizeMarketParams(market);

    return {
      loanToken: params.loanToken,
      collateralParams: params.collateralParams.map((collateralParams) => ({
        token: collateralParams.token,
        lltv: collateralParams.lltv,
        maxLif: collateralParams.maxLiquidationIncentiveFactor,
        oracle: collateralParams.oracle,
      })),
      maturity: params.maturity,
      rcfThreshold: params.rcfThreshold,
      enterGate: params.enterGate,
      liquidatorGate: params.liquidatorGate,
    };
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
    const lltvValue = BigInt(lltv);
    return ALLOWED_LLTVS.some((allowed) => allowed === lltvValue);
  }

  /**
   * Returns the liquidation incentive factor for an LLTV and liquidation cursor.
   *
   * @param input - WAD-scaled LLTV or collateral params carrying an LLTV.
   * @param cursor - WAD-scaled liquidation cursor, usually `LIQUIDATION_CURSOR_LOW` or `LIQUIDATION_CURSOR_HIGH`.
   * @returns WAD-scaled liquidation incentive factor.
   * @example
   * ```ts
   * import { LIQUIDATION_CURSOR_LOW, MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const liquidationIncentiveFactor = MarketUtils.getLiquidationIncentiveFactor(
   *   770000000000000000n,
   *   LIQUIDATION_CURSOR_LOW,
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
   * Computes the HashLib market params struct hash.
   *
   * @param market - Market to hash.
   * @returns EIP-712 market struct hash.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * const hash = MarketUtils.hash({
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
  export function hash(market: MarketInput) {
    const marketStruct = toStruct(market);
    const collateralParamHashes = marketStruct.collateralParams.map((params) =>
      keccak256(
        encodeAbiParameters(collateralParamsHashParams, [
          COLLATERAL_PARAMS_TYPEHASH,
          params.token,
          params.lltv,
          params.maxLif,
          params.oracle,
        ]),
      ),
    );
    const collateralParamsHash = keccak256(concat(collateralParamHashes));

    return keccak256(
      encodeAbiParameters(marketHashParams, [
        MARKET_TYPEHASH,
        marketStruct.loanToken,
        collateralParamsHash,
        marketStruct.maturity,
        marketStruct.rcfThreshold,
        marketStruct.enterGate,
        marketStruct.liquidatorGate,
      ]),
    );
  }

  /**
   * Computes the Midnight id for a market using `IdLib.toId`.
   *
   * @param market - Market to hash.
   * @param chainId - EIP-155 chain id used to resolve the core Midnight address from the registry.
   * @returns Market id.
   * @throws {UnsupportedChainIdError} when no address registry exists for `chainId`.
   * @throws {UnknownAddressError} when the registry has no Midnight address for `chainId`.
   * @example
   * ```ts
   * import { ChainId, registerCustomAddresses } from "@morpho-org/morpho-ts";
   * import { MarketUtils } from "@morpho-org/midnight-sdk";
   *
   * registerCustomAddresses({
   *   addresses: {
   *     [ChainId.BaseMainnet]: {
   *       midnight: "0x0000000000000000000000000000000000000001",
   *     },
   *   },
   * });
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
   *   chainId: ChainId.BaseMainnet,
   * });
   * console.log(id);
   * ```
   */
  export function toId(params: {
    readonly market: MarketInput;
    readonly chainId: BigIntish;
  }) {
    const chainId = BigInt(params.chainId);
    const midnight = getChainAddress(Number(chainId), "midnight");
    const encodedMarket = encodeAbiParameters(
      [marketParamsAbiParameter],
      [toStruct(params.market)],
    );
    const creationHash = keccak256(concat([SSTORE2_PREFIX, encodedMarket]));

    return keccak256(
      encodePacked(
        ["uint8", "address", "uint256", "bytes32"],
        [255, midnight, chainId, creationHash],
      ),
    );
  }
}
