import {
  type Address,
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
} from "viem";

/**
 * Synthetic address the planner probes for native balances. It is injected
 * into the simulated state via a `stateOverrides` code entry, so no chain
 * registry or deployed helper (e.g. Multicall3) is required.
 */
export const NATIVE_BALANCE_PROBE_ADDRESS = getAddress(
  "0x000000000000000000000000000000000000Ba1a",
);

/**
 * Minimal runtime bytecode injected at {@link NATIVE_BALANCE_PROBE_ADDRESS}:
 *
 * ```text
 * 0x60 04   PUSH1 4          ; offset of the ABI-encoded address argument
 * 0x35      CALLDATALOAD     ; load calldata[4:36] (the account argument)
 * 0x31      BALANCE          ; account.balance
 * 0x60 00   PUSH1 0
 * 0x52      MSTORE           ; memory[0:32] = balance
 * 0x60 20   PUSH1 32
 * 0x60 00   PUSH1 0
 * 0xf3      RETURN           ; return memory[0:32]
 * ```
 *
 * Returns `address(calldata[4:36]).balance` — the same ABI surface as
 * Multicall3's `getEthBalance(address)` so the calldata is a plain
 * `encodeFunctionData` call.
 */
export const NATIVE_BALANCE_PROBE_BYTECODE: Hex = "0x6004353160005260206000f3";

const probeAbi = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

/**
 * Encode a probe call for `account`'s native balance.
 * @param account - Account whose native balance the probe must report.
 * @returns ABI-encoded `getEthBalance(account)` calldata.
 * @internal
 */
export function encodeNativeBalanceProbe(account: Address): Hex {
  return encodeFunctionData({
    abi: probeAbi,
    functionName: "getEthBalance",
    args: [account],
  });
}

/**
 * Decode a probe response into a native balance. Pure: returns `null` for
 * malformed data instead of throwing so the caller attaches the probe's
 * error context.
 * @param data - Raw `returnData` from the probe call.
 * @returns The account's native balance in wei, or `null` when the data is
 *   not exactly 32 bytes.
 * @internal
 */
export function decodeNativeBalanceProbe(data: Hex): bigint | null {
  if (data.length !== 66) return null;
  const [balance] = decodeAbiParameters([{ type: "uint256" }], data);
  return balance;
}
