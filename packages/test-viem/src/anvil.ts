import {
  type Abi,
  type Address,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type DeployContractParameters,
  type HDAccount,
  type HttpTransport,
  type PublicActions,
  type SendRawTransactionParameters,
  type SendTransactionParameters,
  type SendTransactionRequest,
  type TestActions,
  type TestRpcSchema,
  type WaitForTransactionReceiptReturnType,
  type WalletActions,
  type WriteContractParameters,
  createTestClient,
  publicActions,
  walletActions,
} from "viem";
import { type DealActions, dealActions } from "viem-deal";
import {
  sendRawTransaction,
  sendTransaction,
  writeContract,
} from "viem/actions";
import type { Chain, anvil } from "viem/chains";
import { testAccount } from "./fixtures.js";

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
      deployContractWait<const abi extends Abi | readonly unknown[]>(
        args: DeployContractParameters<abi, chain, HDAccount>,
      ): Promise<
        WaitForTransactionReceiptReturnType<chain> & {
          contractAddress: Address;
        }
      >;
    }
>;

export const createAnvilTestClient = <chain extends Chain = typeof anvil>(
  chain: chain | undefined,
  transport: HttpTransport,
): AnvilTestClient<chain> =>
  createTestClient({
    chain,
    mode: "anvil",
    account: testAccount(),
    transport,
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
            "payable" | "nonpayable"
          >,
          args extends ContractFunctionArgs<
            abi,
            "payable" | "nonpayable",
            functionName
          >,
          chainOverride extends Chain | undefined = undefined,
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

          // Always wait for transaction to be included.
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
          const hash = await sendTransaction(client, args);

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
