import type { MarketId } from "@morpho-org/blue-sdk";
import { ethAddress } from "viem";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { FeeEvidence, PermissionEvidence } from "../../domain/evidence.js";
import type { VerifiedOperation } from "../../domain/result.js";
import {
  brandVerified,
  type CompleteEvidence,
  type ValidatedAuthorizations,
  type VerifiedEffects,
} from "../../domain/stages.js";
import { UnsupportedOperationError } from "../../errors.js";
import type { SimulationLogger, Transfer } from "../../types.js";
import { accrueSnapshot } from "./accrue.js";
import { checkUnrelatedState, verifyBlueOperation } from "./blue.js";
import { toMarketEntity } from "./market-entity.js";
import { verifyPermissions } from "./permissions.js";
import { buildSnapshot, diffSnapshots } from "./snapshot.js";
import { verifyVaultOperation } from "./vault.js";
import { verifyWallet } from "./wallet.js";

/**
 * Run every effect check on complete evidence: snapshot overlay, modeled
 * accrual, total/action diffs, permission transitions, wallet balance
 * changes, per-operation verification and unrelated-state checks.
 *
 * @internal
 * @param evidence - Probe- and preparation-complete execution evidence.
 * @param validated - The policy-checked request carrying pinned inputs and
 *   effective limits.
 * @param params.transfers - User-facing transfers parsed from the user calls.
 * @returns The branded {@link VerifiedEffects} stage output.
 */
// biome-ignore lint/complexity/useMaxParams: stage contract requires evidence, validated inputs, transfers and logger
export function verifyEffects(
  evidence: CompleteEvidence,
  validated: ValidatedAuthorizations,
  transfers: readonly Transfer[],
  logger?: SimulationLogger,
): VerifiedEffects {
  const { inputs, limits } = validated;
  const { bundle } = inputs;

  const context: SimulationErrorContext = {
    stage: "verification",
    chainId: bundle.request.chainId,
    mode: bundle.request.mode,
  };

  const before = inputs.before;
  const after = buildSnapshot(before, evidence.probeReads.after);
  const accruedBefore = accrueSnapshot(
    before,
    evidence.context.blockTimestamp,
    inputs,
  );
  const totalDiff = diffSnapshots(before, after);
  const actionDiff = diffSnapshots(accruedBefore, after);

  const permissionEvidence: readonly PermissionEvidence[] = verifyPermissions({
    validated,
    evidence,
    before,
    after,
  });

  const fundingDebitOverrides = new Map<string, bigint>();
  for (const op of bundle.operations) {
    if (
      (op.type !== "blueRepay" && op.type !== "blueRepayWithdrawCollateral") ||
      op.funding.type === "none"
    )
      continue;
    const marketState = accruedBefore.markets.find(
      (m) => m.market.marketId === op.market.marketId,
    );
    if (marketState == null) continue;
    const entity = toMarketEntity(marketState);
    const paid =
      op.repay.type === "assets"
        ? op.repay.assets
        : entity.toBorrowAssets(op.repay.shares, "Up");
    const token = op.funding.type === "erc20" ? op.funding.token : ethAddress;
    const key = `${bundle.owner.toLowerCase()}:${token.toLowerCase()}`;
    fundingDebitOverrides.set(
      key,
      (fundingDebitOverrides.get(key) ?? 0n) + paid,
    );
  }

  const wallet = verifyWallet({
    bundle,
    totalDiff,
    actionDiff,
    transfers,
    logger,
    fundingDebitOverrides,
  });

  const touchedMarketIds = new Set<MarketId>();
  const operations: VerifiedOperation[] = [];
  const fees: FeeEvidence[] = [];

  for (const operation of bundle.operations) {
    switch (operation.type) {
      case "blueSupply":
      case "blueWithdraw":
      case "blueSupplyCollateral":
      case "blueBorrow":
      case "blueSupplyCollateralBorrow":
      case "blueRepay":
      case "blueWithdrawCollateral":
      case "blueRepayWithdrawCollateral":
      case "blueRefinance":
      case "blueAuthorization": {
        if ("market" in operation)
          touchedMarketIds.add(operation.market.marketId);
        if (operation.type === "blueRefinance") {
          touchedMarketIds.add(operation.sourceMarket.marketId);
          touchedMarketIds.add(operation.targetMarket.marketId);
        }
        operations.push(
          verifyBlueOperation({
            bundle,
            operation,
            before,
            accruedBefore,
            after,
            actionDiff,
            limits,
            context,
          }),
        );
        break;
      }
      case "vaultV1Deposit":
      case "vaultV2Deposit":
      case "vaultV1Withdraw":
      case "vaultV2Withdraw":
      case "vaultV1Redeem":
      case "vaultV2Redeem":
      case "vaultV1MigrateToV2":
      case "vaultV2ForceWithdraw":
      case "vaultV2ForceRedeem":
      case "vaultV1InKindRedeem":
      case "vaultV2InKindRedeem": {
        if (
          operation.type === "vaultV1InKindRedeem" ||
          operation.type === "vaultV2InKindRedeem"
        )
          for (const leg of operation.markets)
            touchedMarketIds.add(leg.marketId);
        if (operation.type === "vaultV2ForceRedeem")
          for (const leg of operation.deallocations)
            if (leg.marketId != null) touchedMarketIds.add(leg.marketId);
        const verified = verifyVaultOperation({
          bundle,
          operation,
          inputs,
          before,
          accruedBefore,
          after,
          actionDiff,
          limits,
          context,
        });
        operations.push(verified.operation);
        if (verified.referralEvidence != null)
          fees.push(verified.referralEvidence);
        break;
      }
      default:
        throw new UnsupportedOperationError(
          `Operation type has no verification contract`,
          context,
        );
    }
  }

  checkUnrelatedState({ accruedBefore, after, touchedMarketIds, context });

  const verificationBase = {
    ...evidence.context,
    limits,
    operations,
    before,
    after,
    diff: totalDiff,
    actionDiff,
    assetChanges: wallet.assetChanges,
    conversions: [],
    fees,
    permissionEvidence,
  };

  return brandVerified({
    evidence,
    verification:
      bundle.request.mode === "preview"
        ? {
            ...verificationBase,
            mode: "preview",
            authorizations: evidence.authorizations,
          }
        : {
            ...verificationBase,
            mode: "final",
            authorizations: [],
          },
  });
}
