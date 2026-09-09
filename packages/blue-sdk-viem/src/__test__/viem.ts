import type { MockClientHandle, RpcHandler } from "@morpho-org/test/mock";
import type {
  Abi,
  Address,
  Chain,
  ContractFunctionName,
  EncodeFunctionResultParameters,
  Hex,
} from "viem";
import {
  encodeFunctionResult,
  numberToHex,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";

type ReadFunctionName<abi extends Abi> = ContractFunctionName<
  abi,
  "view" | "pure"
>;

/** @internal Encodes a mock result for a read-only contract function. */
export function encodeReadResult<
  abi extends Abi,
  fn extends ReadFunctionName<abi>,
>(...args: [abi: abi, functionName: fn, result: unknown]) {
  const [abi, functionName, result] = args;

  return encodeFunctionResult({
    abi,
    functionName,
    result,
  } as EncodeFunctionResultParameters<abi, fn>);
}

/**
 * Queue responses for viem deployless reads (`readContract` with `code`).
 * @internal
 */
export function mockDeploylessReads(
  handle: MockClientHandle<Chain>,
  reads: readonly (Hex | Error)[],
) {
  const base = handle.request.getMockImplementation();
  if (base == null) throw new Error("mock client has no base implementation");

  const queue = [...reads];
  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address }];
      if (tx?.to == null && queue.length > 0) {
        const next = queue.shift()!;
        if (next instanceof Error) throw next;
        return next;
      }
    }

    return base(call);
  });
}

/**
 * Queue ABI-encoded responses for viem deployless reads.
 * @internal
 */
export function mockDeploylessRead<
  abi extends Abi,
  fn extends ReadFunctionName<abi>,
>(
  handle: MockClientHandle<Chain>,
  ...read: [abi: abi, functionName: fn, result: unknown]
) {
  mockDeploylessReads(handle, [encodeReadResult(...read)]);
}

/**
 * Force a specific read to fail at decode time.
 * @internal
 */
export function mockReadFailure<
  abi extends Abi,
  fn extends ReadFunctionName<abi>,
>(
  handle: MockClientHandle<Chain>,
  options: { address: Address; abi: abi; functionName: fn },
) {
  const target = options.address.toLowerCase();
  const fnAbiItems = options.abi.filter(
    (item): item is Extract<typeof item, { type: "function" }> =>
      item.type === "function" && item.name === options.functionName,
  );

  for (const item of fnAbiItems) {
    const selector = toFunctionSelector(
      toFunctionSignature(item),
    ).toLowerCase();
    handle.dispatch.set(`${target}|${selector}`, "0x");
  }
}

/**
 * Mock `eth_getBalance` while preserving the default mock client handlers.
 * @internal
 */
export function mockNativeBalance(
  handle: MockClientHandle<Chain>,
  balance: bigint,
) {
  const base = handle.request.getMockImplementation();
  if (base == null) throw new Error("mock client has no base implementation");

  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_getBalance") return numberToHex(balance);
    return base(call);
  });
}

/**
 * Replace the mock transport with a custom handler that can delegate to base.
 * @internal
 */
export function extendRpc(
  handle: MockClientHandle<Chain>,
  fn: (call: Parameters<RpcHandler>[0], base: RpcHandler) => Promise<unknown>,
) {
  const base = handle.request.getMockImplementation();
  if (base == null) throw new Error("mock client has no base implementation");
  handle.request.mockImplementation((call) => fn(call, base));
}
