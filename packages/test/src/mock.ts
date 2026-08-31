// This module imports `vi` from `vitest` at the top level. That's
// intentional: `@morpho-org/test`'s `vitest` peer is *optional*, so any
// production codebase that does not have vitest installed will fail to
// resolve `@morpho-org/test/mock` at import time — which is exactly what
// we want, since the mock client is for tests only and must not be loaded
// in production runtimes. Do not "tree-shake" or move this import.
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
   * Internal `eth_call` dispatch registry. Keys are
   * `${address.toLowerCase()}|${selector.toLowerCase()}` (selector is the
   * 4-byte hex prefix `0x` + 8 chars). Values are the encoded `eth_call`
   * results returned to the caller. Last-write-wins on duplicate keys.
   *
   * Only mutate this directly for advanced cases (clearing between phases
   * of a test). Do **not** hoist a single handle into `beforeAll` and
   * share it across `test.concurrent`-flagged tests: concurrent writes
   * to the same `(address, selector)` key would race (last-write-wins),
   * and one test's `dispatch.clear()` could remove another test's
   * registered mock mid-flight. Create a fresh handle per test instead.
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
 *
 * @remarks The factory itself never throws synchronously. The returned
 *   `client.transport` (and the underlying `request` mock) throws an
 *   `Error` with "unhandled RPC" in the message at call time when the
 *   caller invokes an RPC method that has not been pre-programmed —
 *   missing mocks fail loudly with the offending method and params.
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
 *   `to` field of an `eth_call`. Compared case-insensitively, with **no**
 *   checksum validation — pass the same checksum-correct address the SDK
 *   under test uses, or you may hide upstream `getAddress()` bugs.
 * @param options.abi - The ABI containing the target function.
 * @param options.functionName - The name of the `view`/`pure` function
 *   to intercept. All overloads of this name are matched.
 * @param options.result - The value `eth_call` should return. Encoded
 *   via viem's `encodeFunctionResult`; the caller is responsible for
 *   passing a shape matching the function's declared return type.
 * @throws {Error} when `functionName` is not present in `abi` (function
 *   typo / wrong abi). The thrown message names the missing function.
 * @throws {Error} when `options.result` does not match the declared
 *   return shape of any overload of `functionName` (caller passed the
 *   wrong result type). The message names the function and the number
 *   of overloads tried.
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

  // Encode the result **per overload** using a single-item ABI containing
  // only that overload. If we encoded once against the full ABI under the
  // ambiguous `functionName`, viem would resolve to one overload and we
  // would store those same bytes under every overload's selector —
  // overloads with different return types (e.g. `counter(uint256) returns
  // (uint256)` vs `counter(address) returns (bool)`) would then receive
  // bytes encoded against the wrong output ABI, producing wrong values
  // or decode failures at the call site.
  //
  // When overloads share a return shape, encoding succeeds for all of
  // them and we register every selector. When they don't, the caller's
  // `result` only fits one overload's return shape; encoding fails for
  // the others. We collect successes and throw if none match — that's a
  // clear signal that `result` does not match any overload's declared
  // return type, and the caller should fix the result shape.
  let registered = 0;
  for (const item of fnAbiItems) {
    const selector = toFunctionSelector(
      toFunctionSignature(item),
    ).toLowerCase();
    try {
      const encoded = encodeFunctionResult({
        abi: [item],
        functionName: options.functionName as string,
        result: options.result,
      } as EncodeFunctionResultParameters<abi, fn>);
      dispatch.set(`${target}|${selector}`, encoded);
      registered++;
    } catch {
      // Encoding failed for this overload — the result doesn't match
      // its return shape. Skip; another overload may still accept it.
    }
  }
  if (registered === 0)
    throw new Error(
      `[mockRead] options.result does not match any return-type shape of overloads of ${String(options.functionName)} (${fnAbiItems.length} overload(s) tried)`,
    );
}

/**
 * Inspect the mocked transport's call history for `eth_call`s to a specific
 * `(address, functionName)` pair and return their decoded call data. Useful
 * when a test cares less about the response and more about *what* the SDK
 * called and with which arguments.
 *
 * Calls whose 4-byte selector does not match an overload of
 * `match.functionName` in `match.abi` are filtered out before decoding,
 * so unrelated calls to the same address (different functions, or
 * different-arity overloads of the same name) are silently skipped
 * rather than aborting on a decode error. As a consequence, passing a
 * mismatched ABI yields an empty array instead of throwing — be sure
 * to assert on length when you expect a specific number of calls.
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
 *   The decoded `args` are typed as a union over every function in
 *   `match.abi` rather than narrowed to `match.functionName`; callers
 *   that need narrow argument types should cast at the call site or
 *   filter the ABI to a single-entry array before passing it in.
 * @throws {Error} when a candidate call's data fails to decode against
 *   the provided ABI (signals the caller passed a mismatched abi).
 *
 * @example
 * ```ts
 * import { parseAbi } from "viem";
 * import { mainnet } from "viem/chains";
 * import { readContract } from "viem/actions";
 * import {
 *   createMockClient,
 *   expectReadCall,
 *   mockRead,
 * } from "@morpho-org/test/mock";
 *
 * const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
 * const HOLDER = "0x000000000000000000000000000000000000dEaD";
 * const erc20 = parseAbi([
 *   "function balanceOf(address) view returns (uint256)",
 * ]);
 *
 * const handle = createMockClient(mainnet);
 * mockRead(handle, {
 *   address: USDC,
 *   abi: erc20,
 *   functionName: "balanceOf",
 *   result: 1_000_000n,
 * });
 * await readContract(handle.client, {
 *   address: USDC,
 *   abi: erc20,
 *   functionName: "balanceOf",
 *   args: [HOLDER],
 * });
 *
 * const calls = expectReadCall(handle, {
 *   address: USDC,
 *   abi: erc20,
 *   functionName: "balanceOf",
 * });
 * // calls.length === 1; calls[0].args === [HOLDER]
 * ```
 */
export function expectReadCall<
  abi extends Abi,
  fn extends ContractFunctionName<abi>,
>(
  handle: MockClientHandle<Chain>,
  match: { address: Address; abi: abi; functionName: fn },
) {
  const targetAddress = match.address.toLowerCase();
  // Pre-compute selectors for every same-named ABI entry so unrelated
  // calls to the same address (e.g. a different function on the same
  // contract) are filtered out *before* decoding. Without this, an
  // unrelated call whose selector is not in `match.abi` would throw on
  // `decodeFunctionData` and abort the whole iteration.
  const selectors = new Set(
    match.abi
      .filter(
        (item): item is Extract<typeof item, { type: "function" }> =>
          item.type === "function" && item.name === match.functionName,
      )
      .map((item) =>
        toFunctionSelector(toFunctionSignature(item)).toLowerCase(),
      ),
  );
  return handle.request.mock.calls.flatMap(([call]) => {
    if (call.method !== "eth_call") return [];
    const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
    if (tx?.to?.toLowerCase() !== targetAddress) return [];
    if (typeof tx.data !== "string") return [];
    if (!selectors.has(tx.data.slice(0, 10).toLowerCase())) return [];
    // Selector matches `match.functionName`, so decode is expected to
    // succeed. If it doesn't, the caller passed a mismatched abi —
    // bubble the decode error rather than swallowing it.
    return [decodeFunctionData({ abi: match.abi, data: tx.data })];
  });
}
