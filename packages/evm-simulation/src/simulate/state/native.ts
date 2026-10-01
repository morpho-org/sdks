import { type Address, ethAddress } from "viem";
import type { TokenBalance } from "../../result.js";
import {
  decodeNativeBalanceProbe,
  encodeNativeBalanceProbe,
  NATIVE_BALANCE_PROBE_ADDRESS,
} from "../plan/native-balance-probe.js";
import type { DecodedStateRead, StateRead } from "./contract.js";
import { badRead } from "./erc20.js";

/**
 * Encode native-balance reads for the given accounts through the injected
 * probe contract (the bytecode is injected via `stateOverrides`, so no
 * deployed helper is needed).
 * @internal
 */
export function nativeReads(accounts: readonly Address[]): StateRead[] {
  return accounts.map((account) => ({
    kind: "native.balance",
    id: `native.balance:${account}`,
    to: NATIVE_BALANCE_PROBE_ADDRESS,
    data: encodeNativeBalanceProbe(account),
    account,
  }));
}

/**
 * Decode a native-balance read's return data (32-byte `uint256`, matching the
 * probe bytecode's return surface).
 * @internal
 */
export function decodeNativeValue(
  read: Extract<StateRead, { readonly kind: "native.balance" }>,
  data: `0x${string}`,
): bigint {
  const balance = decodeNativeBalanceProbe(data);
  if (balance == null) badRead(read.id);
  return balance;
}

/**
 * Project decoded native-balance reads into `TokenBalance` entries under
 * `ethAddress` — gas is excluded because `validation: false` skips charging.
 * @internal
 */
export function parseNative(
  reads: readonly DecodedStateRead[],
): TokenBalance[] {
  const balances: TokenBalance[] = [];
  for (const { read, value } of reads) {
    if (read.kind !== "native.balance") continue;
    if (typeof value !== "bigint") badRead(read.id);
    balances.push({ token: ethAddress, account: read.account, assets: value });
  }
  return balances;
}
