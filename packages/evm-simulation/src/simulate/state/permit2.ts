import { permit2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
} from "viem";
import type { Permit2NonceChange } from "../../result.js";
import type { DecodedStateRead, StateRead } from "./contract.js";
import { badRead } from "./erc20.js";

/** Permit2 unordered-nonce subjects to observe. @internal */
export interface Permit2Subjects {
  readonly permit2: Address;
  readonly nonces: readonly {
    readonly owner: Address;
    readonly nonce: bigint;
  }[];
}

/**
 * Encode `nonceBitmap(owner, wordPosition)` reads — one word per tracked
 * unordered nonce (nonces sharing a word dedupe at the `id` level).
 * @internal
 */
export function permit2Reads(subjects: Permit2Subjects): StateRead[] {
  const reads: StateRead[] = [];
  const seen = new Set<string>();
  for (const { owner, nonce } of subjects.nonces) {
    const wordPosition = nonce >> 8n;
    const id = `permit2.nonceBitmap:${subjects.permit2}:${owner}:${wordPosition}:${nonce}`;
    if (seen.has(id)) continue;
    seen.add(id);
    reads.push({
      kind: "permit2.nonceBitmap",
      id,
      to: subjects.permit2,
      data: encodeFunctionData({
        abi: permit2Abi,
        functionName: "nonceBitmap",
        args: [owner, wordPosition],
      }),
      permit2: subjects.permit2,
      owner,
      nonce,
    });
  }
  return reads;
}

/** Decode a `nonceBitmap` read's return data into the raw word bitmap. @internal */
export function decodePermit2Value(
  read: Extract<StateRead, { readonly kind: "permit2.nonceBitmap" }>,
  data: Hex,
): bigint {
  try {
    return decodeFunctionResult({
      abi: permit2Abi,
      functionName: "nonceBitmap",
      data,
    });
  } catch (error) {
    return badRead(read.id, error);
  }
}

/**
 * Project decoded bitmap words into per-nonce `Permit2NonceChange` entries —
 * `before`/`after` both hold the read bitmap word at this state point.
 * @internal
 */
export function parsePermit2(
  reads: readonly DecodedStateRead[],
): Permit2NonceChange[] {
  const nonces: Permit2NonceChange[] = [];
  for (const { read, value } of reads) {
    if (read.kind !== "permit2.nonceBitmap") continue;
    if (typeof value !== "bigint") badRead(read.id);
    nonces.push({
      type: "permit2",
      verifyingContract: read.permit2,
      owner: read.owner,
      nonce: read.nonce,
      before: value,
      after: value,
    });
  }
  return nonces;
}
