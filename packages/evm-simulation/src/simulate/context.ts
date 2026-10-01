import type { Address } from "viem";
import type { OperationLimit, SimulationOperationSubject } from "../limits.js";
import type { SimulationMode } from "../params.js";
import type { ExecutionBlock } from "./backends/parse-response.js";

/** Explicit simulation context shared by the checker and result assembly. @internal */
export interface CheckContext {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly block: ExecutionBlock;
  readonly owner: Address;
  readonly limits: { readonly operations: readonly OperationLimit[] };
}

/** Project the caller-selected subject without interpreting calldata. @internal */
export function operationSubject(
  op: OperationLimit,
): SimulationOperationSubject {
  if ("marketId" in op) return { operation: op.type, marketId: op.marketId };
  if ("sourceMarketId" in op)
    return {
      operation: op.type,
      sourceMarketId: op.sourceMarketId,
      targetMarketId: op.targetMarketId,
    };
  if ("authorized" in op)
    return { operation: op.type, authorized: op.authorized };
  if ("sourceVault" in op)
    return {
      operation: op.type,
      sourceVault: op.sourceVault,
      targetVault: op.targetVault,
    };
  return {
    operation: op.type,
    vault: op.vault,
    ...(op.adapter === undefined ? {} : { adapter: op.adapter }),
  };
}
