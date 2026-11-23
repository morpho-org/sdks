import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";

/** Non-blocking simulation diagnostic. Context uses token base units and transaction indexes. */
export type SimulationWarning = {
  readonly severity: "warn";
  readonly chainId: number;
  readonly message: string;
} & (
  | {
      readonly code: "UNEXPECTED_TOKEN_TRANSFER";
      readonly token: Address;
      readonly sender: Address;
      readonly recipients: readonly Address[];
    }
  | {
      readonly code: "RETENTION_CHECK_SKIPPED";
      readonly reason: "unsupported-chain" | "missing-restricted-addresses";
    }
  | {
      readonly code: "BUNDLES_BALANCE_SWEPT";
      readonly address: Address;
      readonly token: Address;
      readonly netSwept: bigint;
    }
  | {
      readonly code: "MALFORMED_TRANSFER_LOG";
      readonly address: Address;
      readonly topics: readonly Hex[];
      readonly data: Hex;
      readonly txIdx: number;
      readonly reason: string;
    }
  | {
      readonly code: "WRAPPED_NATIVE_DEDUP_MISS";
      readonly token: Address;
      readonly kind: "mint" | "burn";
      readonly txIdx: number;
      readonly data: Hex;
    }
  | {
      readonly code: "WRAPPED_NATIVE_MIRROR_DETECTED";
      readonly token: Address;
      readonly kind: "mint" | "burn";
      readonly txIdx: number;
      readonly data: Hex;
    }
);

/**
 * Copy and recursively freeze plain diagnostic data without mutating its source.
 * @param warning - Diagnostic context, never an Error instance.
 * @returns An independently frozen warning.
 * @internal
 */
export function freezeWarning(warning: SimulationWarning): SimulationWarning {
  return deepFreeze(structuredClone(warning));
}
