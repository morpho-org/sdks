import "colors";
import {
  type Abi,
  type Address,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type DeployContractParameters,
  type ExactPartial,
  type HDAccount,
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
  sendRawTransaction as viem_sendRawTransaction,
  sendTransaction as viem_sendTransaction,
  writeContract as viem_writeContract,
} from "viem/actions";
import type { Chain } from "viem/chains";
import { testAccount } from "./fixtures.js";
import { type TraceCallRpcSchema, trace } from "./trace.js";

export type AnvilTestClient<chain extends Chain = Chain> = Client<
  HttpTransport,
  chain,
  HDAccount,
  TestRpcSchema<"anvil">,
  TestActions &
    DealActions &
    PublicActions<HttpTransport, chain, HDAccount> &
    WalletActions<chain, HDAccount> & {
      tracing: {
        txs: boolean;
        calls: boolean;
        nextCall: boolean;
      };

      timestamp(): Promise<bigint>;

      approve(args: ApproveParameters<chain>): Promise<WriteContractReturnType>;
      balanceOf(args: { erc20?: Address; owner?: Address }): Promise<bigint>;
      allowance(args: {
        erc20?: Address;
        owner?: Address;
        spender: Address;
      }): Promise<bigint>;

      maxWithdraw(args: { erc4626: Address; owner?: Address }): Promise<bigint>;
      previewMint(args: {
        erc4626: Address;
        shares: bigint;
      }): Promise<bigint>;
      convertToShares(args: {
        erc4626: Address;
        assets: bigint;
      }): Promise<bigint>;
      deposit(args: DepositParameters<chain>): Promise<WriteContractReturnType>;

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

export const createAnvilTestClient = <chain extends Chain>(
  transport: HttpTransport,
  chain: chain,
): AnvilTestClient<chain> =>
  createTestClient({
    chain,
    mode: "anvil",
    account: testAccount(),
    transport,
    rpcSchema: rpcSchema<[TraceCallRpcSchema]>(),
  })
    .extend(dealActions)
    .extend(publicActions)
    .extend(walletActions)
    .extend((client) => {
      let automine: boolean;

      return {
        tracing: {
          txs: true,
          calls: false,
          nextCall: false,
        },

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
        async previewMint({
          erc4626,
          shares,
        }: { erc4626: Address; shares: bigint }) {
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
        }: { erc4626: Address; assets: bigint }) {
          return client.readContract({
            address: erc4626,
            abi: erc4626Abi,
            functionName: "convertToShares",
            args: [assets],
          });
        },
        async deposit<chainOverride extends Chain | undefined = undefined>(
          args: DepositParameters<chain, chainOverride>,
        ) {
          args.abi = erc4626Abi;
          args.functionName = "deposit";

          return client.writeContract(
            // @ts-ignore
            args,
          );
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
          const hash = await viem_writeContract(client, args);

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
          const hash = await viem_sendTransaction(client, args).catch(
            async (error) => {
              if (this.tracing.txs) {
                try {
                  error.message += `\n\nCall trace:\n${await trace(client, {
                    from: parseAccount(args.account ?? client.account).address,
                    ...args,
                  } as ExactPartial<RpcTransactionRequest>)}`;
                } catch (err) {
                  error.message += `\n\nFailed to trace call:\n${err}`;
                }
              }

              throw error;
            },
          );

          if ((automine ??= await client.getAutomine()))
            await client.waitForTransactionReceipt({ hash });

          return hash;
        },
        async sendRawTransaction(args: SendRawTransactionParameters) {
          const hash = await viem_sendRawTransaction(client, args);

          if ((automine ??= await client.getAutomine()))
            await client.waitForTransactionReceipt({ hash });

          return hash;
        },
      };
    });
