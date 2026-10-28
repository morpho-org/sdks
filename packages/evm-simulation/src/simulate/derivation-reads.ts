import { MathLib } from "@morpho-org/blue-sdk";
import { blueAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  erc4626Abi,
  type Hex,
} from "viem";
import { SlippageCheckUnavailableError } from "../errors.js";
import type { ResolvedSlippageOperation } from "./backends/resolve-assets.js";
import type { DerivationState } from "./derive-quote.js";
import type { StateRead } from "./state/contract.js";

/** Plan hidden before-only accrual and preview calls at the simulated block. @internal */
export function planDerivationReads(
  operations: readonly ResolvedSlippageOperation[],
  { morpho, owner }: { readonly morpho: Address; readonly owner: Address },
): readonly StateRead[] {
  const reads: StateRead[] = [];
  operations.forEach(({ limit, marketParams }, index) => {
    if (limit.inputs === undefined) return;
    const add = (
      name: string,
      { to, data }: { readonly to: Address; readonly data: Hex },
    ) =>
      reads.push({
        kind: "derivation",
        id: `derive:${index}:${name}`,
        operationIndex: index,
        subject:
          "marketId" in limit
            ? `marketId ${limit.marketId}`
            : limit.type === "vaultV1MigrateToV2"
              ? `sourceVault ${limit.sourceVault}, targetVault ${limit.targetVault}`
              : `vault ${limit.vault}`,
        to,
        data,
      });
    if ("marketId" in limit) {
      if (marketParams === undefined)
        throw new SlippageCheckUnavailableError(
          `Missing market parameters for "${limit.type}".`,
        );
      add("accrue", {
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "accrueInterest",
          args: [marketParams],
        }),
      });
      add("market", {
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "market",
          args: [limit.marketId],
        }),
      });
      add("position", {
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "position",
          args: [limit.marketId, limit.account ?? owner],
        }),
      });
    } else if (limit.type === "vaultV1MigrateToV2") {
      const shares = limit.inputs.shares;
      add("preview", {
        to: limit.sourceVault,
        data: encodeFunctionData({
          abi: erc4626Abi,
          functionName:
            shares === undefined ? "previewWithdraw" : "previewRedeem",
          args: [shares ?? limit.inputs.assets],
        }),
      });
      add("targetAccrual", {
        to: limit.targetVault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "accrueInterestView",
        }),
      });
      add("targetSupply", {
        to: limit.targetVault,
        data: encodeFunctionData({
          abi: erc4626Abi,
          functionName: "totalSupply",
        }),
      });
      add("targetVirtualShares", {
        to: limit.targetVault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "virtualShares",
        }),
      });
    } else {
      const redeem =
        limit.type === "vaultV1Redeem" || limit.type === "vaultV2Redeem";
      const deposit =
        limit.type === "vaultV1Deposit" || limit.type === "vaultV2Deposit";
      const amount = redeem ? limit.inputs.shares : limit.inputs.assets;
      const assets = deposit
        ? amount - MathLib.wMulDown(amount, limit.referralFee ?? 0n)
        : amount;
      add("preview", {
        to: limit.vault,
        data: encodeFunctionData({
          abi: erc4626Abi,
          functionName: deposit
            ? "previewDeposit"
            : redeem
              ? "previewRedeem"
              : "previewWithdraw",
          args: [assets],
        }),
      });
    }
  });
  return reads;
}

/** Decode one operation's hidden before-state values, failing closed on malformed data. @internal */
export function decodeDerivationState(
  index: number,
  data: ReadonlyMap<string, Hex>,
): DerivationState {
  try {
    const market = data.get(`derive:${index}:market`);
    const position = data.get(`derive:${index}:position`);
    const preview = data.get(`derive:${index}:preview`);
    const targetAccrual = data.get(`derive:${index}:targetAccrual`);
    const targetSupply = data.get(`derive:${index}:targetSupply`);
    const targetVirtualShares = data.get(`derive:${index}:targetVirtualShares`);
    let targetVault: DerivationState["targetVault"];
    if (
      targetAccrual !== undefined &&
      targetSupply !== undefined &&
      targetVirtualShares !== undefined
    ) {
      const [totalAssets, performanceFeeShares, managementFeeShares] =
        decodeFunctionResult({
          abi: vaultV2Abi,
          functionName: "accrueInterestView",
          data: targetAccrual,
        });
      targetVault = {
        totalAssets,
        totalSupply:
          decodeFunctionResult({
            abi: erc4626Abi,
            functionName: "totalSupply",
            data: targetSupply,
          }) +
          performanceFeeShares +
          managementFeeShares,
        virtualShares: decodeFunctionResult({
          abi: vaultV2Abi,
          functionName: "virtualShares",
          data: targetVirtualShares,
        }),
      };
    }
    const totals =
      market === undefined
        ? undefined
        : decodeFunctionResult({
            abi: blueAbi,
            functionName: "market",
            data: market,
          });
    return {
      targetVault,
      market:
        totals === undefined
          ? undefined
          : {
              totalSupplyAssets: totals[0],
              totalSupplyShares: totals[1],
              totalBorrowAssets: totals[2],
              totalBorrowShares: totals[3],
            },
      borrowShares:
        position === undefined
          ? undefined
          : decodeFunctionResult({
              abi: blueAbi,
              functionName: "position",
              data: position,
            })[1],
      preview:
        preview === undefined
          ? undefined
          : decodeFunctionResult({
              abi: erc4626Abi,
              functionName: "previewDeposit",
              data: preview,
            }),
    };
  } catch (cause) {
    throw new SlippageCheckUnavailableError(
      `Cannot decode before-state derivation for operation "${index}". Check the subject and RPC response.`,
      { cause },
    );
  }
}
