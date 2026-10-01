import type { MarketId } from "@morpho-org/blue-sdk";
import {
  blueAbi,
  blueAdaptiveCurveIrmAbi,
  blueOracleAbi,
  bluePreLiquidationAbi,
} from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  zeroAddress,
} from "viem";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { MorphoAuthorizationState, SignatureNonce } from "../../result.js";
import type { DecodedStateRead, StateRead } from "./contract.js";
import { badRead } from "./erc20.js";

/** Morpho subjects to observe. @internal */
export interface MorphoSubjects {
  readonly morpho: Address;
  readonly markets: readonly {
    readonly marketId: MarketId;
    readonly params: {
      readonly loanToken: Address;
      readonly collateralToken: Address;
      readonly oracle: Address;
      readonly irm: Address;
      readonly lltv: bigint;
    };
    readonly preLiquidation?: Address;
  }[];
  /** Markets read without a decoded binding (e.g. Vault V1 queue markets): `market` + `idToMarketParams` are emitted. */
  readonly queueMarkets?: readonly MarketId[];
  readonly positions: readonly {
    readonly marketId: MarketId;
    readonly owner: Address;
  }[];
  readonly authorizations: readonly {
    readonly authorizer: Address;
    readonly authorized: Address;
  }[];
  readonly nonceOwners: readonly Address[];
}

/** Decoded `market()` tuple. @internal */
export interface MorphoMarketTuple {
  readonly totalSupplyAssets: bigint;
  readonly totalSupplyShares: bigint;
  readonly totalBorrowAssets: bigint;
  readonly totalBorrowShares: bigint;
  readonly lastUpdate: bigint;
  readonly fee: bigint;
}

/** Decoded `position()` tuple. @internal */
export interface MorphoPositionTuple {
  readonly supplyShares: bigint;
  readonly borrowShares: bigint;
  readonly collateral: bigint;
}

/**
 * Encode every Morpho-related view call: `market`, `position`,
 * `isAuthorized`, `nonce`, oracle `price`, IRM `rateAtTarget` /
 * `borrowRateView`, and `preLiquidationParams`.
 * @internal
 */
export function morphoReads(subjects: MorphoSubjects): StateRead[] {
  const { morpho } = subjects;
  const reads: StateRead[] = [];

  for (const market of subjects.markets) {
    const { marketId, params } = market;
    reads.push({
      kind: "morpho.market",
      id: `morpho.market:${marketId}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "market",
        args: [marketId],
      }),
      morpho,
      marketId,
    });
    const { oracle, irm } = params;
    if (oracle !== zeroAddress) {
      reads.push({
        kind: "morpho.oraclePrice",
        id: `morpho.oraclePrice:${oracle}`,
        to: oracle,
        data: encodeFunctionData({
          abi: blueOracleAbi,
          functionName: "price",
        }),
        oracle,
      });
    }
    if (irm !== zeroAddress) {
      reads.push({
        kind: "morpho.irmRateAtTarget",
        id: `morpho.irmRateAtTarget:${irm}:${marketId}`,
        to: irm,
        data: encodeFunctionData({
          abi: blueAdaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId],
        }),
        irm,
        marketId,
      });
    }
    if (market.preLiquidation != null) {
      reads.push({
        kind: "preLiquidation.params",
        id: `preLiquidation.params:${market.preLiquidation}`,
        to: market.preLiquidation,
        data: encodeFunctionData({
          abi: bluePreLiquidationAbi,
          functionName: "preLiquidationParams",
        }),
        preLiquidation: market.preLiquidation,
        marketId,
      });
    }
  }

  for (const marketId of subjects.queueMarkets ?? []) {
    reads.push({
      kind: "morpho.market",
      id: `morpho.market:${marketId}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "market",
        args: [marketId],
      }),
      morpho,
      marketId,
    });
    reads.push({
      kind: "morpho.marketParams",
      id: `morpho.marketParams:${marketId}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [marketId],
      }),
      morpho,
      marketId,
    });
  }

  for (const { marketId, owner } of subjects.positions) {
    reads.push({
      kind: "morpho.position",
      id: `morpho.position:${marketId}:${owner}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "position",
        args: [marketId, owner],
      }),
      morpho,
      marketId,
      owner,
    });
  }

  for (const { authorizer, authorized } of subjects.authorizations) {
    reads.push({
      kind: "morpho.isAuthorized",
      id: `morpho.isAuthorized:${authorizer}:${authorized}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "isAuthorized",
        args: [authorizer, authorized],
      }),
      morpho,
      authorizer,
      authorized,
    });
  }

  for (const owner of subjects.nonceOwners) {
    reads.push({
      kind: "morpho.nonce",
      id: `morpho.nonce:${owner}`,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "nonce",
        args: [owner],
      }),
      morpho,
      owner,
    });
  }

  return reads;
}

/**
 * Decode a Morpho read's return data into its typed tuple or scalar.
 * @internal
 */
export function decodeMorphoValue(
  read: StateRead,
  data: Hex,
):
  | MorphoMarketTuple
  | MorphoPositionTuple
  | bigint
  | boolean
  | {
      loanToken: Address;
      collateralToken: Address;
      oracle: Address;
      irm: Address;
      lltv: bigint;
    }
  | { preLltv: bigint; preLCF: bigint; preLIF: bigint } {
  try {
    switch (read.kind) {
      case "morpho.market": {
        const [
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee,
        ] = decodeFunctionResult({
          abi: blueAbi,
          functionName: "market",
          data,
        });
        return {
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee,
        };
      }
      case "morpho.position": {
        const [supplyShares, borrowShares, collateral] = decodeFunctionResult({
          abi: blueAbi,
          functionName: "position",
          data,
        });
        return { supplyShares, borrowShares, collateral };
      }
      case "morpho.isAuthorized":
        return decodeFunctionResult({
          abi: blueAbi,
          functionName: "isAuthorized",
          data,
        });
      case "morpho.nonce":
        return decodeFunctionResult({
          abi: blueAbi,
          functionName: "nonce",
          data,
        });
      case "morpho.marketParams": {
        const [loanToken, collateralToken, oracle, irm, lltv] =
          decodeFunctionResult({
            abi: blueAbi,
            functionName: "idToMarketParams",
            data,
          });
        return { loanToken, collateralToken, oracle, irm, lltv };
      }
      case "morpho.oraclePrice":
        return decodeFunctionResult({
          abi: blueOracleAbi,
          functionName: "price",
          data,
        });
      case "morpho.irmRateAtTarget":
        return decodeFunctionResult({
          abi: blueAdaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          data,
        });
      case "preLiquidation.params": {
        const params = decodeFunctionResult({
          abi: bluePreLiquidationAbi,
          functionName: "preLiquidationParams",
          data,
        });
        return {
          preLltv: params.preLltv,
          preLCF: params.preLCF1,
          preLIF: params.preLIF1,
        };
      }
      default:
        throw new InvalidSimulationResponseError(
          `State read "${read.id}" is not a Morpho read`,
        );
    }
  } catch (error) {
    if (error instanceof InvalidSimulationResponseError) throw error;
    return badRead(read.id, error);
  }
}

/**
 * Project decoded Morpho reads into positions/markets/authorizations/nonces.
 * Markets and positions stay tuples here — `read-state` derives liquidity,
 * utilization, risk metrics and share-price fields when assembling the
 * `SimulationState`.
 * @internal
 */
export function parseMorpho(reads: readonly DecodedStateRead[]): {
  readonly positions: readonly (MorphoPositionTuple & {
    readonly marketId: MarketId;
    readonly owner: Address;
  })[];
  readonly markets: readonly (MorphoMarketTuple & {
    readonly marketId: MarketId;
  })[];
  readonly marketParams: ReadonlyMap<
    MarketId,
    {
      readonly loanToken: Address;
      readonly collateralToken: Address;
      readonly oracle: Address;
      readonly irm: Address;
      readonly lltv: bigint;
    }
  >;
  readonly oraclePrices: ReadonlyMap<Address, bigint>;
  readonly irmRates: ReadonlyMap<MarketId, { readonly rateAtTarget?: bigint }>;
  readonly preLiquidations: ReadonlyMap<
    MarketId,
    { readonly address: Address; readonly preLltvWad: bigint }
  >;
  readonly authorizations: MorphoAuthorizationState[];
  readonly nonces: SignatureNonce[];
} {
  const positions: (MorphoPositionTuple & {
    marketId: MarketId;
    owner: Address;
  })[] = [];
  const markets: (MorphoMarketTuple & { marketId: MarketId })[] = [];
  const marketParams = new Map<
    MarketId,
    {
      loanToken: Address;
      collateralToken: Address;
      oracle: Address;
      irm: Address;
      lltv: bigint;
    }
  >();
  const oraclePrices = new Map<Address, bigint>();
  const irmRates = new Map<MarketId, { rateAtTarget?: bigint }>();
  const preLiquidations = new Map<
    MarketId,
    { address: Address; preLltvWad: bigint }
  >();
  const authorizations: MorphoAuthorizationState[] = [];
  const nonces: SignatureNonce[] = [];

  const irmEntry = (marketId: MarketId) => {
    let entry = irmRates.get(marketId);
    if (entry == null) {
      entry = {};
      irmRates.set(marketId, entry);
    }
    return entry as { rateAtTarget?: bigint };
  };

  for (const { read, value } of reads) {
    switch (read.kind) {
      case "morpho.position": {
        const tuple = value as MorphoPositionTuple;
        positions.push({
          marketId: read.marketId,
          owner: read.owner,
          ...tuple,
        });
        break;
      }
      case "morpho.market": {
        const tuple = value as MorphoMarketTuple;
        markets.push({ marketId: read.marketId, ...tuple });
        break;
      }
      case "morpho.marketParams": {
        const tuple = value as {
          loanToken: Address;
          collateralToken: Address;
          oracle: Address;
          irm: Address;
          lltv: bigint;
        };
        marketParams.set(read.marketId, tuple);
        break;
      }
      case "morpho.oraclePrice":
        if (typeof value !== "bigint") badRead(read.id);
        oraclePrices.set(read.oracle, value);
        break;
      case "morpho.irmRateAtTarget":
        if (typeof value !== "bigint") badRead(read.id);
        irmEntry(read.marketId).rateAtTarget = value;
        break;
      case "preLiquidation.params": {
        const params = value as { preLltv: bigint };
        preLiquidations.set(read.marketId, {
          address: read.preLiquidation,
          preLltvWad: params.preLltv,
        });
        break;
      }
      case "morpho.isAuthorized":
        if (typeof value !== "boolean") badRead(read.id);
        authorizations.push({
          authorizer: read.authorizer,
          authorized: read.authorized,
          isAuthorized: value,
        });
        break;
      case "morpho.nonce":
        if (typeof value !== "bigint") badRead(read.id);
        nonces.push({
          type: "blueAuthorization",
          verifyingContract: read.morpho,
          owner: read.owner,
          nonce: value,
        });
        break;
      default:
        break;
    }
  }

  return {
    positions,
    markets,
    marketParams,
    oraclePrices,
    irmRates,
    preLiquidations,
    authorizations,
    nonces,
  };
}
