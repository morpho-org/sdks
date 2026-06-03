import {
  type Address,
  encodeAbiParameters,
  encodePacked,
  keccak256,
} from "viem";

import { deepFreeze, normalizeAddress, toBigInt } from "../internal.js";
import type { BigIntish } from "../types.js";
import {
  type CollateralParams,
  type CollateralParamsStruct,
  type ICollateralParams,
  normalizeCollateralParams,
} from "./CollateralParams.js";

const SSTORE2_PREFIX = "0x600b380380600b5f395ff3" as const;

/**
 * Plain input accepted by {@link Market}.
 *
 * @example
 * ```ts
 * import type { IMarket } from "@morpho-org/midnight-sdk";
 *
 * const market: IMarket = {
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * };
 * ```
 */
export interface IMarket {
  /** Loan token address. */
  readonly loanToken: Address | string;
  /** Collateral definitions sorted as expected by Midnight. */
  readonly collateralParams: readonly (ICollateralParams | CollateralParams)[];
  /** Market maturity timestamp. */
  readonly maturity: BigIntish;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: BigIntish;
  /** Optional entry gate. */
  readonly enterGate: Address | string;
  /** Optional liquidation gate. */
  readonly liquidatorGate: Address | string;
}

/**
 * ABI-compatible Midnight market.
 *
 * @example
 * ```ts
 * import { Market } from "@morpho-org/midnight-sdk";
 *
 * const market = new Market({
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * });
 * console.log(market.toStruct().maturity);
 * ```
 */
export class Market {
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

  public constructor(market: IMarket) {
    this.loanToken = normalizeAddress(market.loanToken);
    this.collateralParams = deepFreeze(
      market.collateralParams.map(normalizeCollateralParams),
    );
    this.maturity = toBigInt(market.maturity, "maturity");
    this.rcfThreshold = toBigInt(market.rcfThreshold, "rcfThreshold");
    this.enterGate = normalizeAddress(market.enterGate);
    this.liquidatorGate = normalizeAddress(market.liquidatorGate);
    deepFreeze(this);
  }

  /**
   * Converts the class into the tuple object expected by viem ABI encoders.
   *
   * @returns ABI-compatible market.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * const tuple = new Market({
   *   loanToken: "0x0000000000000000000000000000000000000001",
   *   collateralParams: [],
   *   maturity: 1n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * }).toStruct();
   * console.log(tuple.loanToken);
   * ```
   */
  public toStruct(): MarketStruct {
    return {
      loanToken: this.loanToken,
      collateralParams: this.collateralParams.map((params) =>
        params.toStruct(),
      ),
      maturity: this.maturity,
      rcfThreshold: this.rcfThreshold,
      enterGate: this.enterGate,
      liquidatorGate: this.liquidatorGate,
    };
  }

  /**
   * Computes the Midnight id for this market.
   *
   * @param chainId - Chain id used by Midnight's `INITIAL_CHAIN_ID`.
   * @param midnight - Core Midnight contract address.
   * @returns Market id matching `IdLib.toId`.
   * @example
   * ```ts
   * import { Market } from "@morpho-org/midnight-sdk";
   *
   * const id = new Market({
   *   loanToken: "0x0000000000000000000000000000000000000001",
   *   collateralParams: [],
   *   maturity: 1n,
   *   rcfThreshold: 0n,
   *   enterGate: "0x0000000000000000000000000000000000000000",
   *   liquidatorGate: "0x0000000000000000000000000000000000000000",
   * }).toId(8453, "0x0000000000000000000000000000000000000002");
   * console.log(id);
   * ```
   */
  public toId(chainId: BigIntish, midnight: Address | string) {
    return computeMarketId({ market: this, chainId, midnight });
  }
}

/**
 * ABI tuple shape for `Market`.
 *
 * @example
 * ```ts
 * import type { MarketStruct } from "@morpho-org/midnight-sdk";
 *
 * const market: MarketStruct = {
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * };
 * ```
 */
export interface MarketStruct {
  /** Loan token address. */
  readonly loanToken: Address;
  /** Collateral definitions. */
  readonly collateralParams: readonly CollateralParamsStruct[];
  /** Market maturity timestamp. */
  readonly maturity: bigint;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: bigint;
  /** Entry gate address. */
  readonly enterGate: Address;
  /** Liquidator gate address. */
  readonly liquidatorGate: Address;
}

/**
 * Normalizes a market into an immutable class.
 *
 * @param market - Plain or class market.
 * @returns Normalized market.
 * @example
 * ```ts
 * import { normalizeMarket } from "@morpho-org/midnight-sdk";
 *
 * const market = normalizeMarket({
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralParams: [],
 *   maturity: 1n,
 *   rcfThreshold: 0n,
 *   enterGate: "0x0000000000000000000000000000000000000000",
 *   liquidatorGate: "0x0000000000000000000000000000000000000000",
 * });
 * console.log(market.loanToken);
 * ```
 */
export function normalizeMarket(market: IMarket | Market) {
  return market instanceof Market ? market : new Market(market);
}

const marketAbiParameter = {
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
 * Computes the Midnight id for a market using Solidity `IdLib.toId`.
 *
 * @param market - Market to hash.
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
  readonly market: IMarket | Market;
  readonly chainId: BigIntish;
  readonly midnight: Address | string;
}) {
  const encodedMarket = encodeAbiParameters(
    [marketAbiParameter],
    [normalizeMarket(params.market).toStruct()],
  );
  const creationHash = keccak256(`${SSTORE2_PREFIX}${encodedMarket.slice(2)}`);

  return keccak256(
    encodePacked(
      ["uint8", "address", "uint256", "bytes32"],
      [
        255,
        normalizeAddress(params.midnight),
        toBigInt(params.chainId, "chainId"),
        creationHash,
      ],
    ),
  );
}
