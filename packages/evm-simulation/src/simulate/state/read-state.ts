import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  type Hex,
  isAddressEqual,
} from "viem";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
} from "../../errors.js";
import type { OperationLimit, SlippageQuote } from "../../limits.js";
import type { ResolvedSlippageOperation } from "../backends/resolve-assets.js";
import type { StateRead } from "./contract.js";

/** One quoted amount's observation source. @internal */
export type SlippageMeasurement = {
  readonly field: keyof SlippageQuote;
} & (
  | { readonly type: "native"; readonly account: Address }
  | { readonly type: "balance"; readonly readId: string }
  | {
      readonly type: "position";
      readonly readId: string;
      readonly shares: "supplyShares" | "borrowShares";
    }
);

/** Caller quote paired with exactly the observations it needs. @internal */
export interface SlippageOperationReads {
  readonly limit: OperationLimit;
  readonly measurements: readonly SlippageMeasurement[];
}

/** Scalar balance or the two share counts returned by Morpho.position. @internal */
export type StateValue =
  | bigint
  | { readonly supplyShares: bigint; readonly borrowShares: bigint };

/**
 * Plan only quoted balance and position reads, deduplicating contract calls.
 * Native deltas use the execution's transfer traces and require no view call.
 * @param params - Resolved caller operations and the transaction sender/Morpho address.
 * @returns Read calls and their mapping to each quoted amount; empty without limits.
 * @throws {MissingVerificationEvidenceError} When the selected subject cannot measure a quote.
 * @internal
 */
export function planStateReads(params: {
  readonly operations: readonly ResolvedSlippageOperation[];
  readonly owner: Address;
  readonly morpho: Address;
}): {
  readonly reads: readonly StateRead[];
  readonly operations: readonly SlippageOperationReads[];
} {
  const reads = new Map<string, StateRead>();
  const operations = params.operations.map(
    ({ limit, assetsPaid, assetsReceived }) => {
      const measurements: SlippageMeasurement[] = [];
      const account = limit.account ?? params.owner;
      for (const field of [
        "assetsReceived",
        "assetsPaid",
        "sharesMinted",
        "sharesBurned",
      ] as const) {
        if (limit.quote[field] === undefined) continue;
        const assetField = field === "assetsReceived" || field === "assetsPaid";
        let token = field === "assetsReceived" ? assetsReceived : assetsPaid;
        const holder = assetField
          ? field === "assetsReceived"
            ? (limit.receiver ?? params.owner)
            : params.owner
          : account;
        if (!assetField) {
          const marketId =
            "marketId" in limit
              ? limit.marketId
              : "sourceMarketId" in limit
                ? field === "sharesMinted"
                  ? limit.targetMarketId
                  : limit.sourceMarketId
                : undefined;
          if (
            marketId !== undefined &&
            limit.type !== "blueSupplyCollateral" &&
            limit.type !== "blueWithdrawCollateral"
          ) {
            const id = `position:${marketId}:${account}`.toLowerCase();
            reads.set(id, {
              kind: "morpho.position",
              id,
              to: params.morpho,
              morpho: params.morpho,
              marketId,
              owner: account,
              data: encodeFunctionData({
                abi: blueAbi,
                functionName: "position",
                args: [marketId, account],
              }),
            });
            measurements.push({
              field,
              type: "position",
              readId: id,
              shares:
                limit.type === "blueSupply" || limit.type === "blueWithdraw"
                  ? "supplyShares"
                  : "borrowShares",
            });
            continue;
          }
          token =
            "vault" in limit
              ? limit.vault
              : "sourceVault" in limit
                ? field === "sharesMinted"
                  ? limit.targetVault
                  : limit.sourceVault
                : undefined;
        }
        if (token === undefined) {
          throw new MissingVerificationEvidenceError(
            `Cannot measure "${limit.type}.${field}". Supply an observable subject or omit this quoted amount.`,
          );
        }
        if (assetField && isAddressEqual(token, ethAddress)) {
          measurements.push({ field, type: "native", account: holder });
          continue;
        }
        const id = `balance:${token}:${holder}`.toLowerCase();
        reads.set(id, {
          kind: "erc20.balance",
          id,
          to: token,
          token,
          account: holder,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [holder],
          }),
        });
        measurements.push({ field, type: "balance", readId: id });
      }
      return { limit, measurements };
    },
  );
  return { reads: [...reads.values()], operations };
}

/**
 * Decode one requested balance or position without reconstructing protocol entities.
 * @param read - Planned view call.
 * @param data - Return data from its simulated execution.
 * @returns Raw balance or supply/borrow share counts.
 * @throws {InvalidSimulationResponseError} When return data cannot be decoded.
 * @internal
 */
export function decodeStateRead(read: StateRead, data: Hex): StateValue {
  try {
    if (read.kind === "erc20.balance")
      return decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data,
      });
    const [supplyShares, borrowShares] = decodeFunctionResult({
      abi: blueAbi,
      functionName: "position",
      data,
    });
    return { supplyShares, borrowShares };
  } catch (cause) {
    throw new InvalidSimulationResponseError(
      `Cannot decode slippage observation "${read.id}". Check the selected contract and RPC response.`,
      { cause },
    );
  }
}
