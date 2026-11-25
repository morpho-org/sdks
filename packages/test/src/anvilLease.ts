import {
  BaseError,
  type Chain,
  type HttpTransport,
  http,
  RpcRequestError,
} from "viem";
import { type AnvilTestClient, createAnvilTestClient } from "./client.js";
import { AnvilLeaseClosedError } from "./errors.js";

/**
 * JSON-RPC methods that only read or whose effects Anvil's `evm_revert` undoes: account state,
 * mined and pending transactions, block number, time and next-block overrides. Node-wide settings
 * such as automine, impersonation and filters survive a revert, so their methods are absent.
 */
const REVERTIBLE_ANVIL_METHODS: ReadonlySet<string> = new Set([
  "anvil_dealERC20",
  "anvil_getAutomine",
  "anvil_mine",
  "anvil_setBalance",
  "anvil_setCode",
  "anvil_setErc20Allowance",
  "anvil_setNonce",
  "anvil_setStorageAt",
  "debug_traceCall",
  "debug_traceTransaction",
  "eth_accounts",
  "eth_blobBaseFee",
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_createAccessList",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_fillTransaction",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockReceipts",
  "eth_getCode",
  "eth_getLogs",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_simulateV1",
  "evm_increaseTime",
  "evm_mine",
  "evm_setNextBlockTimestamp",
  "net_version",
  "ots_getContractCreator",
  "ots_traceTransaction",
  "trace_transaction",
  "txpool_content",
  "txpool_inspect",
  "txpool_status",
  "web3_clientVersion",
]);

/**
 * One test's use of a reusable Anvil process.
 *
 * @internal
 */
export interface AnvilLease {
  /** Whether the test is still running; calls made after it closes are rejected. */
  open: boolean;
  /** Number of the test's requests Anvil has not answered yet. */
  inFlight: number;
  /** Whether a revert to the setup snapshot undoes everything the test did. */
  reusable: boolean;
}

/**
 * Creates the HTTP transport fixtures use to reach an Anvil process.
 *
 * @internal
 * @param rpcUrl - The Anvil process's RPC URL.
 * @returns A viem HTTP transport without retries.
 */
export const createAnvilTransport = (rpcUrl: string) =>
  http(rpcUrl, { retryCount: 0, timeout: 30_000 });

const createLeasedTransport =
  (rpcUrl: string, lease: AnvilLease): HttpTransport =>
  (parameters) => {
    const transport = createAnvilTransport(rpcUrl)(parameters);
    const request: typeof transport.request = async (args, options) => {
      if (!lease.open) {
        throw new AnvilLeaseClosedError(
          `The test calling "${args.method}" has finished and its Anvil may be serving another test. Await every client call before the test ends.`,
        );
      }
      if (!REVERTIBLE_ANVIL_METHODS.has(args.method)) {
        lease.reusable = false;
      }
      lease.inFlight++;
      try {
        return await transport.request(args, options);
      } catch (error) {
        // Only a JSON-RPC error response proves Anvil handled the call; after a timeout or a
        // dropped connection it may still apply the call once the process serves another test.
        // viem wraps standard JSON-RPC error codes in typed errors that keep the response as a cause.
        const answered =
          error instanceof BaseError &&
          error.walk((cause) => cause instanceof RpcRequestError) !== null;
        if (!answered) {
          lease.reusable = false;
        }
        throw error;
      } finally {
        lease.inFlight--;
      }
    };
    return { ...transport, config: { ...transport.config, request }, request };
  };

/**
 * Creates a test client whose requests go through a lease, so the lease records whether its
 * process can be reused and rejects calls made after the test ends.
 *
 * @internal
 * @param chain - Chain used to configure the client.
 * @param target - The Anvil RPC URL and the lease guarding it.
 * @returns An Anvil test client bound to the lease.
 */
export function createLeasedClient<chain extends Chain>(
  chain: chain,
  { rpcUrl, lease }: { readonly rpcUrl: string; readonly lease: AnvilLease },
): AnvilTestClient<chain> {
  const client = createAnvilTestClient(
    createLeasedTransport(rpcUrl, lease),
    chain,
  );
  // A client built from the raw URL bypasses the lease, so its process cannot be reused.
  Object.defineProperty(client.transport, "url", {
    enumerable: true,
    get: () => {
      if (!lease.open) {
        throw new AnvilLeaseClosedError(
          "The test reading the Anvil RPC URL has finished and its Anvil may be serving another test. Read the URL before the test ends.",
        );
      }
      lease.reusable = false;
      return rpcUrl;
    },
  });
  return client;
}
