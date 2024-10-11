import { writeFile } from "node:fs/promises";
import "colors";
import {
  type Abi,
  type Address,
  type BlockTag,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type DeployContractParameters,
  type ExactPartial,
  type HDAccount,
  type Hex,
  type HttpTransport,
  type PublicActions,
  type RpcTransactionRequest,
  type SendRawTransactionParameters,
  type SendTransactionParameters,
  type SendTransactionRequest,
  type TestActions,
  type TestRpcSchema,
  type UnionPartialBy,
  type WaitForTransactionReceiptReturnType,
  type WalletActions,
  type WriteContractParameters,
  type WriteContractReturnType,
  createTestClient,
  erc20Abi,
  erc4626Abi,
  maxUint256,
  publicActions,
  rpcSchema,
  walletActions,
} from "viem";
import { type DealActions, dealActions } from "viem-deal";
import { parseAccount } from "viem/accounts";
import {
  sendRawTransaction,
  sendTransaction,
  writeContract,
} from "viem/actions";
import type { Chain } from "viem/chains";
import { testAccount } from "./fixtures.js";
import {
  type RpcCallTrace,
  formatCallTrace,
  getCallTraceUnknownSelectors,
  signatures,
  signaturesPath,
} from "./trace.js";

export type AnvilTestClient<chain extends Chain = Chain> = Client<
  HttpTransport,
  chain,
  HDAccount,
  TestRpcSchema<"anvil">,
  TestActions &
    DealActions &
    PublicActions<HttpTransport, chain, HDAccount> &
    WalletActions<chain, HDAccount> & {
      timestamp(): Promise<bigint>;

      approve(args: ApproveParameters<chain>): Promise<WriteContractReturnType>;
      balanceOf(args: { erc20?: Address; owner?: Address }): Promise<bigint>;
      allowance(args: {
        erc20?: Address;
        owner?: Address;
        spender: Address;
      }): Promise<bigint>;

      maxWithdraw(args: { erc4626: Address; owner?: Address }): Promise<bigint>;

      deployContractWait<const abi extends Abi | readonly unknown[]>(
        args: DeployContractParameters<abi, chain, HDAccount>,
      ): Promise<
        WaitForTransactionReceiptReturnType<chain> & {
          contractAddress: Address;
        }
      >;
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

export const createAnvilTestClient = <chain extends Chain>(
  transport: HttpTransport,
  chain: chain,
): AnvilTestClient<chain> =>
  createTestClient({
    chain,
    mode: "anvil",
    account: testAccount(),
    transport,
    rpcSchema:
      rpcSchema<
        [
          {
            Method: "debug_traceCall";
            Parameters: [
              ExactPartial<RpcTransactionRequest>,
              BlockTag | Hex,
              {
                tracer: "callTracer" | "prestateTracer";
                tracerConfig: { onlyTopCall: boolean };
              },
            ];
            ReturnType: RpcCallTrace;
          },
        ]
      >(),
  })
    .extend(dealActions)
    .extend(publicActions)
    .extend(walletActions)
    .extend((client) => {
      let automine: boolean;

      return {
        async timestamp() {
          const latestBlock = await client.getBlock();

          return latestBlock.timestamp;
        },

        async approve<chainOverride extends Chain | undefined = undefined>(
          args: ApproveParameters<chain, chainOverride>,
        ) {
          args.abi = erc20Abi;
          args.functionName = "approve";

          return client.writeContract(
            // @ts-ignore
            args,
          );
        },
        async balanceOf({
          erc20 = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
          owner = client.account.address,
        }: { erc20?: Address; owner?: Address }) {
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
        }: { erc20?: Address; owner?: Address; spender: Address }) {
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
        }: { erc4626: Address; owner?: Address }) {
          return client.readContract({
            address: erc4626,
            abi: erc4626Abi,
            functionName: "maxWithdraw",
            args: [owner],
          });
        },

        async deployContractWait<const abi extends Abi | readonly unknown[]>(
          args: DeployContractParameters<abi, chain, HDAccount>,
        ) {
          const hash = await client.deployContract(args);
          const receipt = await client.waitForTransactionReceipt({ hash });

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
          const hash = await writeContract(client, args);

          if ((automine ??= await client.getAutomine()))
            await client.waitForTransactionReceipt({ hash });

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
          const hash = await sendTransaction(client, args).catch(
            async (error) => {
              const trace = await client.request(
                {
                  method: "debug_traceCall",
                  params: [
                    {
                      from: parseAccount(args.account ?? client.account)
                        .address,
                      ...args,
                    } as ExactPartial<RpcTransactionRequest>,
                    "latest",
                    {
                      tracer: "callTracer",
                      tracerConfig: { onlyTopCall: false },
                    },
                  ],
                },
                { retryCount: 0 },
              );

              const unknownSelectors = getCallTraceUnknownSelectors(trace);

              if (unknownSelectors) {
                const lookupRes = await fetch(
                  `https://api.openchain.xyz/signature-database/v1/lookup?filter=false&function=${unknownSelectors}`,
                );

                const lookup = await lookupRes.json();

                if (lookup.ok) {
                  Object.entries<{ name: string; filtered: boolean }[]>(
                    lookup.result.function,
                  ).map(([sig, results]) => {
                    const match = results.find(
                      ({ filtered }) => !filtered,
                    )?.name;
                    if (!match) return;

                    signatures.functions[sig as Hex] = match;
                  });

                  writeFile(signaturesPath, JSON.stringify(signatures)); // Non blocking.
                } else {
                  console.warn(
                    `Failed to fetch signatures for unknown selectors: ${unknownSelectors}`,
                    lookup.error,
                  );
                }
              }

              error.message += `\n\nCall trace:\n${formatCallTrace(trace)}`;

              throw error;
            },
          );

          if ((automine ??= await client.getAutomine()))
            await client.waitForTransactionReceipt({ hash });

          return hash;
        },
        async sendRawTransaction(args: SendRawTransactionParameters) {
          const hash = await sendRawTransaction(client, args);

          if ((automine ??= await client.getAutomine()))
            await client.waitForTransactionReceipt({ hash });

          return hash;
        },
      };
    });
