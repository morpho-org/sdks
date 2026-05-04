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
  encodeFunctionResult,
  type Hex,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";
import { mainnet } from "viem/chains";
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
 */
export interface MockClientHandle<chain extends Chain = Chain> {
  client: Client<CustomTransport, chain>;
  request: Mock<RpcHandler>;
  chain: chain;
}

/**
 * Build a viem {@link Client} backed by an in-process `vi.fn()` that intercepts
 * JSON-RPC calls at the **transport** level. This is the correct interception
 * point for tests against SDK code that uses `viem/actions` named imports
 * (`readContract(client, ...)`), which resolve through `client.transport`
 * rather than methods on the client object.
 *
 * The default handler answers `eth_chainId` from the supplied chain and throws
 * for everything else; tests pre-program responses via {@link mockRead} or by
 * mutating `request.mockImplementation` directly.
 *
 * @param chain - The viem {@link Chain} the mock client is bound to. The
 *   chain id is reported via the default `eth_chainId` handler. Defaults
 *   to `mainnet`.
 * @returns A {@link MockClientHandle} bundling the constructed `client`,
 *   the underlying `request` mock (for `vi.fn` assertions), and the
 *   resolved `chain`.
 * @throws `Error` from the underlying mock when the caller invokes an RPC
 *   method that has not been pre-programmed — missing mocks fail loudly
 *   with the offending method and params in the message.
 */
export function createMockClient<chain extends Chain = typeof mainnet>(
  chain: chain = mainnet as unknown as chain,
): MockClientHandle<chain> {
  const request = vi.fn<RpcHandler>(async ({ method, params }) => {
    if (method === "eth_chainId") return `0x${chain.id.toString(16)}`;
    throw new Error(
      `[createMockClient] unhandled RPC ${method} ${JSON.stringify(params)}`,
    );
  });
  const client = createClient({ chain, transport: custom({ request }) });
  return { client, request, chain };
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
 * resolve with the ABI-encoded `result`; non-matching calls fall through to
 * any previously registered mock and ultimately throw with an "unhandled"
 * message so missing mocks fail loudly.
 *
 * Multiple `mockRead` calls **stack**: the most recent matching mock wins.
 * Mocks set on the same `(address, functionName)` are last-write-wins.
 *
 * Overloaded reads (multiple `view`/`pure` functions sharing the same name
 * but with different argument types) are handled by computing the selector
 * for **every** same-named ABI entry and matching the call's selector
 * against the full set. This ensures the mock fires regardless of which
 * overload `readContract` chose at the call site.
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
 */
export function mockRead<
  abi extends Abi,
  fn extends ContractFunctionName<abi, "view" | "pure">,
>(handle: MockClientHandle, options: MockReadOptions<abi, fn>): void {
  const { request } = handle;
  const target = options.address.toLowerCase();
  // Compute selectors for every same-named overload up front. ABI entries
  // can declare multiple `view`/`pure` functions with the same name and
  // different argument types; the caller's `readContract` will pick one
  // overload, and we have to recognize whichever one it encoded.
  const fnAbiItems = options.abi.filter(
    (item): item is Extract<typeof item, { type: "function" }> =>
      item.type === "function" && item.name === options.functionName,
  );
  if (fnAbiItems.length === 0)
    throw new Error(
      `[mockRead] function ${String(options.functionName)} not found in abi`,
    );
  const selectors = new Set(
    fnAbiItems.map((item) =>
      toFunctionSelector(toFunctionSignature(item)).toLowerCase(),
    ),
  );

  const previous = request.getMockImplementation();
  request.mockImplementation(async (call) => {
    if (call.method === "eth_chainId")
      return `0x${handle.chain.id.toString(16)}`;
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
      if (
        tx?.to?.toLowerCase() === target &&
        typeof tx.data === "string" &&
        // 4-byte selector + leading "0x" = first 10 chars
        selectors.has(tx.data.slice(0, 10).toLowerCase())
      ) {
        // viem's overloaded encodeFunctionResult signature does not narrow
        // well against a generic abi; tests are responsible for passing a
        // result shape matching the function's return type.
        const params = {
          abi: options.abi,
          functionName: options.functionName,
          result: options.result,
        } as Parameters<typeof encodeFunctionResult>[0];
        return encodeFunctionResult(params);
      }
    }
    if (previous) return previous(call);
    throw new Error(
      `[mockRead] unhandled RPC ${call.method} ${JSON.stringify(call.params)}`,
    );
  });
}

/**
 * Inspect the mocked transport's call history for `eth_call`s to a specific
 * `(address, functionName)` pair and return their decoded arguments. Useful
 * when a test cares less about the response and more about *what* the SDK
 * called and with which arguments.
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
 */
export function expectReadCall<
  abi extends Abi,
  fn extends ContractFunctionName<abi>,
>(
  handle: MockClientHandle,
  match: { address: Address; abi: abi; functionName: fn },
) {
  const calls = handle.request.mock.calls.filter(([call]) => {
    if (call.method !== "eth_call") return false;
    const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
    if (tx?.to?.toLowerCase() !== match.address.toLowerCase()) return false;
    if (typeof tx.data !== "string") return false;
    try {
      const decoded = decodeFunctionData({ abi: match.abi, data: tx.data });
      return decoded.functionName === match.functionName;
    } catch {
      return false;
    }
  });
  return calls.map(([call]) => {
    const [tx] = (call.params ?? []) as [{ data: Hex }];
    return decodeFunctionData({ abi: match.abi, data: tx.data });
  });
}
