import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  BaseError,
  type Client,
  erc4626Abi,
  HttpRequestError,
  isAddressEqual,
  TimeoutError,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import {
  ExternalServiceError,
  MissingVerificationEvidenceError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import { operationMeasurementPlan } from "../measurement-plan.js";

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
 * @throws {ExternalServiceError} For transport failures during a required metadata read.
 * @throws {MissingVerificationEvidenceError} For reverted, malformed, or empty metadata.
 * @internal
 */
export async function resolveAssets(params: {
  readonly client: Client;
  readonly morpho: Address;
  readonly operations: readonly OperationLimit[];
  readonly blockNumber: bigint;
  readonly signal?: AbortSignal;
}): Promise<readonly ResolvedSlippageOperation[]> {
  const { client, morpho, operations, blockNumber, signal } = params;
  const tokens = new Map<string, readonly [Address, Address]>();
  const resolved: ResolvedSlippageOperation[] = [];
  for (const limit of operations) {
    const plan = operationMeasurementPlan(limit);
    const result: {
      limit: OperationLimit;
      assetsPaid?: Address;
      assetsReceived?: Address;
    } = { limit };
    for (const field of ["assetsPaid", "assetsReceived"] as const) {
      if (limit.quote[field] === undefined) continue;
      const explicit =
        field === "assetsPaid" ? limit.assetPaid : limit.assetReceived;
      if (explicit !== undefined) {
        result[field] = explicit;
        continue;
      }
      const source = plan[field];
      const key =
        source.type === "market"
          ? `market:${source.marketId.toLowerCase()}`
          : `vault:${source.vault.toLowerCase()}`;
      let pair = tokens.get(key);
      if (pair === undefined) {
        try {
          if (source.type === "market") {
            const values = await readContract(client, {
              address: morpho,
              abi: blueAbi,
              functionName: "idToMarketParams",
              args: [source.marketId],
              blockNumber,
            });
            pair = [values[0], values[1]];
          } else {
            const asset = await readContract(client, {
              address: source.vault,
              abi: erc4626Abi,
              functionName: "asset",
              blockNumber,
            });
            pair = [asset, asset];
          }
        } catch (cause) {
          if (
            (cause instanceof BaseError &&
              cause.walk(
                (error) =>
                  error instanceof HttpRequestError ||
                  error instanceof TimeoutError,
              ) !== null) ||
            signal?.aborted ||
            (cause instanceof Error && cause.name === "AbortError")
          ) {
            throw new ExternalServiceError(
              "Cannot resolve the quoted asset because its metadata request failed. Check the RPC endpoint.",
              { cause },
            );
          }
          throw new MissingVerificationEvidenceError(
            `Cannot resolve verification evidence for "${limit.type}" asset source "${key}".`,
            { cause },
          );
        }
        if (
          isAddressEqual(pair[0], zeroAddress) ||
          isAddressEqual(pair[1], zeroAddress)
        ) {
          throw new MissingVerificationEvidenceError(
            `Cannot resolve verification evidence for "${limit.type}" asset source "${key}": the resolved token address is zero.`,
          );
        }
        tokens.set(key, pair);
      }
      result[field] =
        source.type === "market"
          ? pair[source.asset === "loan" ? 0 : 1]
          : pair[0];
    }
    resolved.push(result);
  }
  return resolved;
}
