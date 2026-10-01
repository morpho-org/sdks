import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { type Address, type Client, erc4626Abi } from "viem";
import { readContract } from "viem/actions";
import { ExternalServiceError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";

/** Caller-selected operation with only the quoted wallet assets resolved. @internal */
export interface ResolvedSlippageOperation {
  readonly limit: OperationLimit;
  readonly assetsPaid?: Address;
  readonly assetsReceived?: Address;
}

/**
 * Resolve underlying tokens only when an asset quote lacks an explicit token.
 * Share-only quotes need no RPC reads; vault versions and factories are not discovered.
 * @param params - Caller operations, Morpho address, client, and pinned state block.
 * @returns Operations with the token addresses required by their asset quotes.
 * @throws {ExternalServiceError} When a required metadata read fails.
 * @internal
 */
export async function resolveAssets(params: {
  readonly client: Client;
  readonly morpho: Address;
  readonly operations: readonly OperationLimit[];
  readonly blockNumber: bigint;
}): Promise<readonly ResolvedSlippageOperation[]> {
  const { client, morpho, operations, blockNumber } = params;
  const tokens = new Map<string, readonly [Address, Address]>();
  const resolved: ResolvedSlippageOperation[] = [];
  for (const limit of operations) {
    const paid = limit.quote.assetsPaid !== undefined;
    const received = limit.quote.assetsReceived !== undefined;
    if (!paid && !received) {
      resolved.push({ limit });
      continue;
    }
    let loan = limit.asset;
    let collateral = limit.asset;
    if (loan === undefined) {
      const marketId =
        "marketId" in limit
          ? limit.marketId
          : "sourceMarketId" in limit
            ? limit.sourceMarketId
            : undefined;
      const vault =
        "vault" in limit
          ? limit.vault
          : "sourceVault" in limit
            ? limit.sourceVault
            : undefined;
      const key = (marketId ?? vault)?.toLowerCase();
      let pair = key === undefined ? undefined : tokens.get(key);
      if (pair === undefined) {
        try {
          if (marketId !== undefined) {
            const values = await readContract(client, {
              address: morpho,
              abi: blueAbi,
              functionName: "idToMarketParams",
              args: [marketId],
              blockNumber,
            });
            pair = [values[0], values[1]];
          } else if (vault !== undefined) {
            const asset = await readContract(client, {
              address: vault,
              abi: erc4626Abi,
              functionName: "asset",
              blockNumber,
            });
            pair = [asset, asset];
          }
        } catch (cause) {
          throw new ExternalServiceError(
            "Cannot resolve the quoted asset. Supply the asset explicitly or check the RPC endpoint.",
            { cause },
          );
        }
        if (key !== undefined && pair !== undefined) tokens.set(key, pair);
      }
      [loan, collateral] = pair ?? [undefined, undefined];
    }
    const collateralOnly =
      limit.type === "blueSupplyCollateral" ||
      limit.type === "blueWithdrawCollateral";
    resolved.push({
      limit,
      ...(paid
        ? {
            assetsPaid:
              collateralOnly || limit.type === "blueSupplyCollateralBorrow"
                ? collateral
                : loan,
          }
        : {}),
      ...(received
        ? {
            assetsReceived:
              collateralOnly || limit.type === "blueRepayWithdrawCollateral"
                ? collateral
                : loan,
          }
        : {}),
    });
  }
  return resolved;
}
