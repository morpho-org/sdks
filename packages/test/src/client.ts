import {
  type Abi,
  type Address,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  createTestClient,
  type DeployContractParameters,
  erc20Abi,
  erc4626Abi,
  type HDAccount,
  type Hash,
  type HttpTransport,
  maxUint256,
  type PublicActions,
  type PublicRpcSchema,
  publicActions,
  type SendRawTransactionParameters,
  type SendTransactionParameters,
  type SendTransactionRequest,
  type TestActions,
  type TestRpcSchema,
  TransactionReceiptNotFoundError,
  type UnionPartialBy,
  type WaitForTransactionReceiptParameters,
  type WaitForTransactionReceiptReturnType,
  WaitForTransactionReceiptTimeoutError,
  type WalletActions,
  type WalletRpcSchema,
  type WriteContractParameters,
  type WriteContractReturnType,
  walletActions,
} from "viem";
import {
  getTransactionReceipt as viem_getTransactionReceipt,
  sendRawTransaction as viem_sendRawTransaction,
  sendTransaction as viem_sendTransaction,
  waitForTransactionReceipt as viem_waitForTransactionReceipt,
  writeContract as viem_writeContract,
} from "viem/actions";
import type { Chain } from "viem/chains";
import { type DealActions, dealActions } from "viem-deal";
import {
  type TraceActions,
  type TracedTransport,
  traceActions,
  traced,
} from "viem-tracer";
import { testAccount } from "./fixtures.js";
import {
  type FunctionCall,
  type GetFunctionCallsArgs,
  getFunctionCalls,
} from "./utils/getFunctionCalls.js";

export type AnvilTestClient<chain extends Chain = Chain> = Client<
  TracedTransport<HttpTransport>,
  chain,
  HDAccount,
  TestRpcSchema<"anvil"> | PublicRpcSchema | WalletRpcSchema,
  TestActions &
    DealActions &
    TraceActions &
    PublicActions<TracedTransport<HttpTransport>, chain, HDAccount> &
    WalletActions<chain, HDAccount> & {
      timestamp(): Promise<bigint>;

      approve(args: ApproveParameters<chain>): Promise<WriteContractReturnType>;
      balanceOf(args?: { erc20?: Address; owner?: Address }): Promise<bigint>;
      allowance(args: {
        erc20?: Address;
        owner?: Address;
        spender: Address;
      }): Promise<bigint>;

      maxWithdraw(args: { erc4626: Address; owner?: Address }): Promise<bigint>;
      previewMint(args: { erc4626: Address; shares: bigint }): Promise<bigint>;
      convertToShares(args: {
        erc4626: Address;
        assets: bigint;
      }): Promise<bigint>;
      convertToAssets(args: {
        erc4626: Address;
        shares: bigint;
      }): Promise<bigint>;
      deposit(args: DepositParameters<chain>): Promise<WriteContractReturnType>;

      deployContractWait<const abi extends Abi | readonly unknown[]>(
        args: DeployContractParameters<abi, chain, HDAccount>,
      ): Promise<
        WaitForTransactionReceiptReturnType<chain> & {
          contractAddress: Address;
        }
      >;

      getFunctionCalls<
        TAbi extends Abi,
        TName extends ContractFunctionName<TAbi>,
      >(
        args: GetFunctionCallsArgs<TAbi, TName>,
      ): Promise<FunctionCall<TAbi, TName>[]>;
    }
>;

export type ApproveParameters<
  chain extends Chain,
  chainOverride extends Chain | undefined = undefined,
> = UnionPartialBy<
  WriteContractParameters<
    typeof erc20Abi,
    "approve",
    [Address, bigint],
    chain,
    HDAccount,
    chainOverride
  >,
  "abi" | "functionName"
>;

export type DepositParameters<
  chain extends Chain,
  chainOverride extends Chain | undefined = undefined,
> = UnionPartialBy<
  WriteContractParameters<
    typeof erc4626Abi,
    "deposit",
    [bigint, Address],
    chain,
    HDAccount,
    chainOverride
  >,
  "abi" | "functionName"
>;

/**
 * Creates a viem test client for a local Anvil node, polling every 50 ms.
 *
 * `waitForTransactionReceipt` called with only `hash` and `timeout` polls
 * `eth_getTransactionReceipt` until the receipt exists or `timeout` (default
 * 180 s) expires; any other option falls back to viem's implementation. Under
 * automine, `sendTransaction`, `sendRawTransaction` and `writeContract` wait
 * for the receipt before returning the hash.
 *
 * @param transport - HTTP transport to the Anvil node.
 * @param chain - The chain the node forks.
 * @returns The extended test client.
 *
 * @example
 * import { createAnvilTestClient } from "@morpho-org/test";
 * import { http, parseEther, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createAnvilTestClient(http("http://127.0.0.1:8545"), mainnet);
 * const hash = await client.sendTransaction({
 *   to: zeroAddress,
 *   value: parseEther("1"),
 * });
 * // => "0x…", already mined under automine
 */
export const createAnvilTestClient = <chain extends Chain>(
  transport: HttpTransport,
  chain: chain,
): AnvilTestClient<chain> =>
  createTestClient({
    chain,
    mode: "anvil",
    account: testAccount(),
    transport: traced(transport),
    cacheTime: Number.POSITIVE_INFINITY,
    pollingInterval: 50,
  })
    .extend(dealActions)
    .extend(traceActions)
    .extend(publicActions)
    .extend(walletActions)
    .extend((client) => {
      let automine: boolean;

      // viem waits for a new block before re-fetching a missing receipt, and
      // dedupes that fetch into one already in flight. When Anvil mines during
      // that request, automine produces no later block and the wait hangs, so
      // poll the receipt directly unless the caller needs viem's other options.
      const waitForTransactionReceipt = async (
        args: WaitForTransactionReceiptParameters<chain>,
      ) => {
        const { hash, timeout = 180_000, ...options } = args;
        if (Object.values(options).some((option) => option !== undefined))
          return viem_waitForTransactionReceipt(client, args);

        let timer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;

        const poll = async () => {
          while (true) {
            try {
              return await viem_getTransactionReceipt(client, { hash });
            } catch (error) {
              if (!(error instanceof TransactionReceiptNotFoundError))
                throw error;
            }

            await new Promise((resolve) =>
              setTimeout(resolve, client.pollingInterval),
            );
            if (timedOut)
              throw new WaitForTransactionReceiptTimeoutError({ hash });
          }
        };

        try {
          return await Promise.race([
            poll(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                timedOut = true;
                reject(new WaitForTransactionReceiptTimeoutError({ hash }));
              }, timeout);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };

      const waitForAutominedReceipt = async (
        hash: Hash,
        previousBlockNumber: bigint,
      ) => {
        const timeout = 180_000;
        const deadline = Date.now() + timeout;

        while (
          (await client.getBlockNumber({ cacheTime: 0 })) <= previousBlockNumber
        ) {
          if (Date.now() >= deadline)
            throw new WaitForTransactionReceiptTimeoutError({ hash });

          await new Promise((resolve) =>
            setTimeout(resolve, client.pollingInterval),
          );
        }

        return waitForTransactionReceipt({
          hash,
          timeout: Math.max(1, deadline - Date.now()),
        });
      };

      return {
        waitForTransactionReceipt,

        async timestamp() {
          const latestBlock = await client.getBlock();

          return latestBlock.timestamp;
        },

        async approve<chainOverride extends Chain | undefined = undefined>(
          args: ApproveParameters<chain, chainOverride>,
        ) {
          args.abi = erc20Abi;
          args.functionName = "approve";

          // @ts-expect-error
          return this.writeContract(args);
        },
        async balanceOf({
          erc20 = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          owner = client.account.address,
        }: {
          erc20?: Address;
          owner?: Address;
        } = {}) {
          if (erc20 === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")
            return client.getBalance({ address: owner });

          return client.readContract({
            address: erc20,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          });
        },
        async allowance({
          erc20 = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          owner = client.account.address,
          spender,
        }: {
          erc20?: Address;
          owner?: Address;
          spender: Address;
        }) {
          if (erc20 === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")
            return maxUint256;

          return client.readContract({
            address: erc20,
            abi: erc20Abi,
            functionName: "allowance",
            args: [owner, spender],
          });
        },

        async maxWithdraw({
          erc4626,
          owner = client.account.address,
        }: {
          erc4626: Address;
          owner?: Address;
        }) {
          return client.readContract({
            address: erc4626,
            abi: erc4626Abi,
            functionName: "maxWithdraw",
            args: [owner],
          });
        },
        async previewMint({
          erc4626,
          shares,
        }: {
          erc4626: Address;
          shares: bigint;
        }) {
          return client.readContract({
            address: erc4626,
            abi: erc4626Abi,
            functionName: "previewMint",
            args: [shares],
          });
        },
        async convertToShares({
          erc4626,
          assets,
        }: {
          erc4626: Address;
          assets: bigint;
        }) {
          return client.readContract({
            address: erc4626,
            abi: erc4626Abi,
            functionName: "convertToShares",
            args: [assets],
          });
        },
        async convertToAssets({
          erc4626,
          shares,
        }: {
          erc4626: Address;
          shares: bigint;
        }) {
          return client.readContract({
            address: erc4626,
            abi: erc4626Abi,
            functionName: "convertToAssets",
            args: [shares],
          });
        },
        async deposit<chainOverride extends Chain | undefined = undefined>(
          args: DepositParameters<chain, chainOverride>,
        ) {
          args.abi = erc4626Abi;
          args.functionName = "deposit";

          // @ts-expect-error
          return this.writeContract(args);
        },

        async deployContractWait<const abi extends Abi | readonly unknown[]>(
          args: DeployContractParameters<abi, chain, HDAccount>,
        ) {
          const hash = await client.deployContract(args);
          const receipt = await waitForTransactionReceipt({ hash });

          if (receipt.contractAddress == null)
            throw Error("no contract address");

          return receipt as typeof receipt & { contractAddress: Address };
        },
        async writeContract<
          const abi extends Abi | readonly unknown[],
          functionName extends ContractFunctionName<
            abi,
            "nonpayable" | "payable"
          >,
          args extends ContractFunctionArgs<
            abi,
            "nonpayable" | "payable",
            functionName
          >,
          chainOverride extends Chain | undefined,
        >(
          args: WriteContractParameters<
            abi,
            functionName,
            args,
            chain,
            HDAccount,
            chainOverride
          >,
        ) {
          const shouldWaitForReceipt = (automine ??=
            await client.getAutomine());
          const previousBlockNumber = shouldWaitForReceipt
            ? await client.getBlockNumber({ cacheTime: 0 })
            : undefined;
          const hash = await viem_writeContract(client, args);

          if (shouldWaitForReceipt && previousBlockNumber !== undefined)
            await waitForAutominedReceipt(hash, previousBlockNumber);

          return hash;
        },
        async sendTransaction<
          const request extends SendTransactionRequest<chain, chainOverride>,
          chainOverride extends Chain | undefined = undefined,
        >(
          args: SendTransactionParameters<
            chain,
            HDAccount,
            chainOverride,
            request
          >,
        ) {
          const shouldWaitForReceipt = (automine ??=
            await client.getAutomine());
          const previousBlockNumber = shouldWaitForReceipt
            ? await client.getBlockNumber({ cacheTime: 0 })
            : undefined;
          const hash = await viem_sendTransaction(client, args);

          if (shouldWaitForReceipt && previousBlockNumber !== undefined)
            await waitForAutominedReceipt(hash, previousBlockNumber);

          return hash;
        },
        async sendRawTransaction(args: SendRawTransactionParameters) {
          const shouldWaitForReceipt = (automine ??=
            await client.getAutomine());
          const previousBlockNumber = shouldWaitForReceipt
            ? await client.getBlockNumber({ cacheTime: 0 })
            : undefined;
          const hash = await viem_sendRawTransaction(client, args);

          if (shouldWaitForReceipt && previousBlockNumber !== undefined)
            await waitForAutominedReceipt(hash, previousBlockNumber);

          return hash;
        },

        getFunctionCalls<
          TAbi extends Abi,
          TName extends ContractFunctionName<TAbi>,
        >(args: GetFunctionCallsArgs<TAbi, TName>) {
          return getFunctionCalls(client, args);
        },
      };
    });
