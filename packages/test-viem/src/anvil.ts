import {
  type Abi,
  type Chain,
  type Client,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type HDAccount,
  type HttpTransport,
  type PublicActions,
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
import type { anvil } from "viem/chains";
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
      writeContractWait<
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
      >(
        args: WriteContractParameters<
          abi,
          functionName,
          args,
          chain,
          HDAccount
        >,
      ): Promise<WaitForTransactionReceiptReturnType<chain>>;
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
    .extend((client) => ({
      async timestamp() {
        const latestBlock = await client.getBlock();

        return latestBlock.timestamp;
      },
      async writeContractWait<
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
      >(
        args: WriteContractParameters<
          abi,
          functionName,
          args,
          chain,
          HDAccount
        >,
      ) {
        const hash = await client.writeContract(args);

        return await client.waitForTransactionReceipt({ hash });
      },
    }));
