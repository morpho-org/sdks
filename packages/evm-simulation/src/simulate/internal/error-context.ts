import type { Address, Hex } from "viem";
import type { DecodedOperation } from "../../decode/operation.js";
import type { SimulationErrorContext } from "../../errors.js";
import type { SimulationOperationSubject } from "../../limits.js";
import type { SimulationMode } from "../../params.js";
import type { ExecutionContext } from "./evidence.js";

/** Execution context + request mode carried into every error context. @internal */
export interface At {
  readonly context: ExecutionContext;
  readonly mode: SimulationMode;
}

/** Check fields a verification/transport context may carry. @internal */
export interface CheckFields {
  readonly token?: Address;
  readonly account?: Address;
  readonly spender?: Address;
  readonly field?: string;
  readonly expected?: bigint | boolean | Address | Hex;
  readonly observed?: bigint | boolean | Address | Hex;
  readonly failedTransactionIndex?: number;
  /** Index into that authorization's preparation calls. */
  readonly preparationCallIndex?: number;
}

/** The operation subject (`operation` + entity keys) of one decoded operation. @internal */
export const operationSubject = (
  op: DecodedOperation,
): SimulationOperationSubject => {
  switch (op.type) {
    case "blueSupply":
    case "blueWithdraw":
    case "blueSupplyCollateral":
    case "blueBorrow":
    case "blueSupplyCollateralBorrow":
    case "blueRepay":
    case "blueWithdrawCollateral":
    case "blueRepayWithdrawCollateral":
      return { operation: op.type, marketId: op.market.marketId };
    case "blueRefinance":
      return {
        operation: "blueRefinance",
        sourceMarketId: op.sourceMarket.marketId,
        targetMarketId: op.targetMarket.marketId,
      };
    case "blueAuthorization":
      return { operation: "blueAuthorization", authorized: op.authorized };
    case "vaultV1MigrateToV2":
      return {
        operation: "vaultV1MigrateToV2",
        sourceVault: op.sourceVault,
        targetVault: op.targetVault,
      };
    case "vaultV2ForceWithdraw":
      return {
        operation: "vaultV2ForceWithdraw",
        vault: op.vault,
        adapter: op.adapter,
      };
    default:
      return { operation: op.type, vault: op.vault };
  }
};

/**
 * Verification-stage context for a check not bound to one operation (wallet
 * limits, probe evidence, snapshot comparisons).
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: context constructors mirror the stage contract
export const verificationContext = (
  context: ExecutionContext,
  mode: SimulationMode,
  check: CheckFields & { readonly field: string },
): SimulationErrorContext => ({
  stage: "verification",
  chainId: context.chainId,
  mode,
  blockNumber: context.blockNumber,
  ...check,
});

/** Verification-stage context bound to one decoded operation. @internal */
// biome-ignore lint/complexity/useMaxParams: context constructors mirror the stage contract
export const operationContext = (
  context: ExecutionContext,
  mode: SimulationMode,
  op: DecodedOperation,
  check: CheckFields = {},
): SimulationErrorContext => ({
  stage: "verification",
  chainId: context.chainId,
  mode,
  blockNumber: context.blockNumber,
  ...operationSubject(op),
  failedTransactionIndex: op.transactionIndex,
  ...check,
});

/** Preparation-stage context for an authorization-list entry. @internal */
// biome-ignore lint/complexity/useMaxParams: context constructors mirror the stage contract
export const preparationContext = (
  context: ExecutionContext,
  mode: SimulationMode,
  authorizationIndex: number,
  check: CheckFields = {},
): SimulationErrorContext => ({
  stage: "preparation",
  chainId: context.chainId,
  mode,
  blockNumber: context.blockNumber,
  authorizationIndex,
  ...check,
});

/** Transport-stage context for RPC/response failures. @internal */
// biome-ignore lint/complexity/useMaxParams: context constructors mirror the stage contract
export const transportContext = (
  context: ExecutionContext,
  mode: SimulationMode,
  check: CheckFields = {},
): SimulationErrorContext => ({
  stage: "transport",
  chainId: context.chainId,
  mode,
  blockNumber: context.blockNumber,
  ...check,
});

/** Validation-stage context for malformed request content. @internal */
export const validationContext = (
  context: ExecutionContext,
  mode: SimulationMode,
): SimulationErrorContext => ({
  stage: "validation",
  chainId: context.chainId,
  mode,
  blockNumber: context.blockNumber,
});
