import type { Address, Hex } from "viem";
import type { CalldataCall } from "../types.js";

/** Converts an SDK transaction into the API's call shape. */
export function sdkCall(tx: {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
  readonly action: { readonly type: string };
}): CalldataCall {
  return {
    id: "sdk",
    kind: tx.action.type,
    to: tx.to,
    data: tx.data,
    value: tx.value.toString(),
  };
}
