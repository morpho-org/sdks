import {
  type Abi,
  type Address,
  type Chain,
  type Client,
  type ContractFunctionName,
  type Hex,
  createClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
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
  client: Client;
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
 * Pre-program a single `eth_call` response by `(to, function selector)` on a
 * mock client created via {@link createMockClient}. Subsequent matching calls
 * resolve with the ABI-encoded `result`; non-matching calls throw with an
 * "unhandled" message that includes the function name attempted, so test
 * failures pinpoint the missing mock.
 *
 * Multiple `mockRead` calls **stack**: the most recent matching mock wins.
 * Mocks set on the same `(address, functionName)` are last-write-wins.
 */
export function mockRead<
  abi extends Abi,
  fn extends ContractFunctionName<abi, "view" | "pure">,
>(handle: MockClientHandle, options: MockReadOptions<abi, fn>): void {
  const { request } = handle;
  const target = options.address.toLowerCase();
  // Compute the 4-byte selector once per mock by composing the function
  // signature with viem's helpers. This avoids repeating expensive ABI
  // walks on every RPC dispatch.
  const fnAbi = options.abi.find(
    (item): item is Extract<typeof item, { type: "function" }> =>
      item.type === "function" && item.name === options.functionName,
  );
  if (!fnAbi)
    throw new Error(
      `[mockRead] function ${String(options.functionName)} not found in abi`,
    );
  const selector = toFunctionSelector(toFunctionSignature(fnAbi));

  const previous = request.getMockImplementation();
  request.mockImplementation(async (call) => {
    if (call.method === "eth_chainId")
      return `0x${handle.chain.id.toString(16)}`;
    if (call.method === "eth_call") {
      const [tx] = (call.params ?? []) as [{ to?: Address; data?: Hex }];
      if (
        tx?.to?.toLowerCase() === target &&
        typeof tx.data === "string" &&
        tx.data.toLowerCase().startsWith(selector.toLowerCase())
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
 * Optional helper: assert that the mocked transport observed exactly one
 * `eth_call` to `(address, functionName)` and return the decoded args. Useful
 * when a test cares less about the response and more about *what* the SDK
 * called and with which arguments.
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
