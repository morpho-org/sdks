import {
  type Abi,
  type Address,
  type Chain,
  type Client,
  type ContractFunctionName,
  type CustomTransport,
  createClient,
  custom,
  decodeFunctionData,
  type EncodeFunctionResultParameters,
  encodeFunctionResult,
  type Hex,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";
import type { Mock } from "vitest";
import { vi } from "vitest";

/**
 * RPC request handler signature exposed by viem's `custom()` transport.
 * Implementations receive the JSON-RPC method name and params and must
 * return a result (or throw to surface an error to the caller).
 */
export type RpcHandler = (call: {
  method: string;
  params?: readonly unknown[];
}) => Promise<unknown>;

/**
 * A vitest-friendly client + the underlying mocked request fn so tests can
 * inspect call history, override per-test, or swap implementations on the fly.
 *
 * `dispatch` is the internal `Map<address|selector, encoded result>` consulted
 * by every {@link mockRead} call. It is exposed only for advanced tests that
 * need to clear or inspect registered mocks; prefer creating a fresh handle
 * per test instead of mutating this map directly.
 */
export interface MockClientHandle<chain extends Chain = Chain> {
  client: Client<CustomTransport, chain>;
  request: Mock<RpcHandler>;
  chain: chain;
  /**
   * `(addressLower, selectorLower)` → encoded eth_call result. Last-write-
   * wins on duplicate keys.
   */
  dispatch: Map<string, Hex>;
}

/**
 * Build a viem {@link Client} backed by an in-process `vi.fn()` that intercepts
 * JSON-RPC calls at the **transport** level. This is the correct interception
 * point for tests against SDK code that uses `viem/actions` named imports
 * (`readContract(client, ...)`), which resolve through `client.transport`
 * rather than methods on the client object.
 *
 * Only `eth_chainId` and `eth_call` are pre-handled. `eth_chainId` returns the
 * supplied chain's id; `eth_call` is dispatched through {@link mockRead}'s
 * registry (see {@link MockClientHandle.dispatch}). Every other RPC method
 * throws an "unhandled" error so missing mocks fail loudly. Tests that need
 * other methods (e.g. `eth_getBlockByNumber`) should override
 * `request.mockImplementation` directly.
 *
 * @param chain - The viem {@link Chain} the mock client is bound to. The
 *   chain id is reported via the default `eth_chainId` handler. **No
 *   default**: callers must pass an explicit chain so chainId-validation
 *   tests can never accidentally drift to a wrong assumption.
 * @returns A {@link MockClientHandle} bundling the constructed `client`,
 *   the underlying `request` mock (for `vi.fn` assertions), the resolved
 *   `chain`, and the internal `dispatch` registry.
 * @throws `Error` from the underlying mock when the caller invokes an RPC
 *   method that has not been pre-programmed — missing mocks fail loudly
 *   with the offending method and params in the message.
 *
 * @example
 * ```ts
 * import { createMockClient, mockRead } from "@morpho-org/test/mock";
 * import { mainnet } from "viem/chains";
 * import { readContract } from "viem/actions";
 * import { parseAbi } from "viem";
 *
 * const erc20 = parseAbi(["function decimals() view returns (uint8)"]);
 * const handle = createMockClient(mainnet);
 * mockRead(handle, {
 *   address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *   abi: erc20,
 *   functionName: "decimals",
 *   result: 6,
 * });
 *
 * const result = await readContract(handle.client, {
 *   address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *   abi: erc20,
 *   functionName: "decimals",
 * });
 * // result === 6
 * ```
 */
export function createMockClient<chain extends Chain>(
  chain: chain,
): MockClientHandle<chain> {
  const dispatch = new Map<string, Hex>();
  const request = vi.fn<RpcHandler>(async ({ method, params }) => {
    if (method === "eth_chainId") return `0x${chain.id.toString(16)}`;
    if (method === "eth_call") {
      const [tx] = (params ?? []) as [{ to?: Address; data?: Hex }];
      if (typeof tx?.to === "string" && typeof tx.data === "string") {
        const key = `${tx.to.toLowerCase()}|${tx.data.slice(0, 10).toLowerCase()}`;
        const encoded = dispatch.get(key);
        if (encoded != null) return encoded;
      }
    }
    throw new Error(
      `[createMockClient] unhandled RPC ${method} ${JSON.stringify(params)}`,
    );
  });
  const client = createClient({ chain, transport: custom({ request }) });
  return { client, request, chain, dispatch };
}

interface MockReadOptions<
  abi extends Abi,
  fn extends ContractFunctionName<abi, "view" | "pure">,
> {
  address: Address;
  abi: abi;
  functionName: fn;
  result: unknown;
}

/**
 * Pre-program an `eth_call` response by `(to, function selector)` on a mock
 * client created via {@link createMockClient}. Subsequent matching calls
 * resolve with the ABI-encoded `result`; non-matching calls throw with an
 * "unhandled" message so missing mocks fail loudly.
 *
 * Multiple `mockRead` calls are written into a flat `Map` on the handle —
 * the most recent write to a `(address, selector)` key wins. There is no
 * unbounded closure chain.
 *
 * Overloaded reads (multiple `view`/`pure` functions sharing the same name
 * but with different argument types) are handled by computing the selector
 * for **every** same-named ABI entry and registering the encoded result
 * under each. The mock fires regardless of which overload `readContract`
 * chose at the call site.
 *
 * Only `eth_call` is intercepted. Other RPC methods (e.g. `eth_getStorageAt`,
 * `eth_getBlockByNumber`) fall through to the default handler and throw
 * "unhandled".
 *
 * @param handle - The {@link MockClientHandle} returned by
 *   {@link createMockClient}.
 * @param options - The mock target and response.
 * @param options.address - The contract address that should match the
 *   `to` field of an `eth_call` (compared case-insensitively).
 * @param options.abi - The ABI containing the target function.
 * @param options.functionName - The name of the `view`/`pure` function
 *   to intercept. All overloads of this name are matched.
 * @param options.result - The value `eth_call` should return. Encoded
 *   via viem's `encodeFunctionResult`; the caller is responsible for
 *   passing a shape matching the function's declared return type.
 * @throws `Error` if `functionName` is not present in `abi` (function
 *   typo / wrong abi). The thrown message names the missing function.
 *
 * @example
 * ```ts
 * import { parseAbi } from "viem";
 * import { mainnet } from "viem/chains";
 * import { createMockClient, mockRead } from "@morpho-org/test/mock";
 *
 * const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
 * const handle = createMockClient(mainnet);
 * mockRead(handle, {
 *   address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *   abi,
 *   functionName: "balanceOf",
 *   result: 1_000_000n,
 * });
 * ```
 */
export function mockRead<
  abi extends Abi,
  fn extends ContractFunctionName<abi, "view" | "pure">,
>(handle: MockClientHandle, options: MockReadOptions<abi, fn>): void {
  const { dispatch } = handle;
  const target = options.address.toLowerCase();
  // Compute selectors for every same-named ABI entry. Solidity allows
  // multiple `view`/`pure` overloads of the same name; whichever one
  // `readContract` encodes at the call site, the mock should still fire.
  const fnAbiItems = options.abi.filter(
    (item): item is Extract<typeof item, { type: "function" }> =>
      item.type === "function" && item.name === options.functionName,
  );
  if (fnAbiItems.length === 0)
    throw new Error(
      `[mockRead] function ${String(options.functionName)} not found in abi`,
    );

  const params = {
    abi: options.abi,
    functionName: options.functionName,
    result: options.result,
  } as EncodeFunctionResultParameters<abi, fn>;
  const encoded = encodeFunctionResult(params);

  for (const item of fnAbiItems) {
    const selector = toFunctionSelector(
      toFunctionSignature(item),
    ).toLowerCase();
    dispatch.set(`${target}|${selector}`, encoded);
  }
}

/**
 * Inspect the mocked transport's call history for `eth_call`s to a specific
 * `(address, functionName)` pair and return their decoded call data. Useful
 * when a test cares less about the response and more about *what* the SDK
 * called and with which arguments.
 *
 * Decoding errors (e.g. wrong abi passed) are not swallowed — they bubble
 * out of the helper so the test fails with the underlying decode message
 * rather than an empty-array assertion failure.
 *
 * @param handle - The {@link MockClientHandle} returned by
 *   {@link createMockClient}.
 * @param match - The contract and function to filter on.
 * @param match.address - Contract address (case-insensitive).
 * @param match.abi - ABI containing the function.
 * @param match.functionName - Name of the function whose calls should be
 *   returned.
 * @returns An array of decoded call data objects (`{ functionName, args }`)
 *   in the order the mock observed them. Empty array if no calls matched.
 * @throws `Error` if a candidate call's data fails to decode against the
 *   provided ABI (signals the caller passed a mismatched abi).
 *
 * @example
 * ```ts
 * await readContract(handle.client, {
 *   address,
 *   abi: erc20,
 *   functionName: "balanceOf",
 *   args: ["0x000...dEaD"],
 * });
 *
 * const calls = expectReadCall(handle, {
 *   address,
 *   abi: erc20,
 *   functionName: "balanceOf",
 * });
 * expect(calls).toHaveLength(1);
 * expect(calls[0]!.args).toEqual(["0x000...dEaD"]);
 * ```
 */
export function expectReadCall<
  abi extends Abi,
  fn extends ContractFunctionName<abi>,
>(
  handle: MockClientHandle,
  match: { address: Address; abi: abi; functionName: fn },
) {
  const targetAddress = match.address.toLowerCase();
  return handle.request.mock.calls.flatMap(([call]) => {
    if (call.method !== "eth_call") return [];
    const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
    if (tx?.to?.toLowerCase() !== targetAddress) return [];
    if (typeof tx.data !== "string") return [];
    const decoded = decodeFunctionData({ abi: match.abi, data: tx.data });
    return decoded.functionName === match.functionName ? [decoded] : [];
  });
}
