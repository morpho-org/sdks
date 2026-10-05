import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { type Address, type Client, isAddressEqual, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import {
  ExternalServiceError,
  MissingVerificationEvidenceError,
} from "../../errors.js";
import type { PositionHealthLimit } from "../../limits.js";
import type { SimulationMode } from "../../params.js";
import { isTransportFailure } from "./resolve-assets.js";

/** Request chain, mode and pinned block, attached to thrown errors. @internal */
export interface RequestContext {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly blockNumber: bigint;
}

/** Market params needed to accrue interest, price collateral and read the LLTV. @internal */
export interface HealthMarket {
  readonly marketId: MarketId;
  readonly params: {
    readonly loanToken: Address;
    readonly collateralToken: Address;
    readonly oracle: Address;
    readonly irm: Address;
    readonly lltv: bigint;
  };
}

/**
 * Read the params of every market named in `limits.positions` at the pinned block.
 * @throws {ExternalServiceError} For transport failures.
 * @throws {MissingVerificationEvidenceError} When the market is not created or the read reverts.
 * @internal
 */
export async function resolveHealthMarkets(params: {
  readonly client: Client;
  readonly morpho: Address;
  readonly positions: readonly PositionHealthLimit[];
  readonly context: RequestContext;
}): Promise<readonly HealthMarket[]> {
  const { client, morpho, positions, context } = params;
  const markets = new Map<string, HealthMarket>();
  for (const { marketId } of positions) {
    const key = marketId.toLowerCase();
    if (markets.has(key)) continue;
    const field = `market:${key}`;
    let values: readonly [Address, Address, Address, Address, bigint];
    try {
      values = await readContract(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [marketId],
        blockNumber: context.blockNumber,
      });
    } catch (cause) {
      if (isTransportFailure(cause))
        throw new ExternalServiceError(
          "Cannot resolve the market params of a checked position because the request failed. Check the RPC endpoint.",
          { cause },
        );
      throw new MissingVerificationEvidenceError(
        `Cannot resolve the market params of "${marketId}".`,
        { cause, context: { stage: "verification", ...context, field } },
      );
    }
    const [loanToken, collateralToken, oracle, irm, lltv] = values;
    if (isAddressEqual(oracle, zeroAddress))
      throw new MissingVerificationEvidenceError(
        `Cannot check positions on "${marketId}": the market is not created or has no oracle.`,
        { context: { stage: "verification", ...context, field } },
      );
    markets.set(key, {
      marketId,
      params: { loanToken, collateralToken, oracle, irm, lltv },
    });
  }
  return [...markets.values()];
}
