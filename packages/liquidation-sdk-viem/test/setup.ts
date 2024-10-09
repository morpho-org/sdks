import { createViemTest } from "@morpho-org/test-viem";
import { ExecutorEncoder, bytecode, executorAbi } from "executooor-viem";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createViemTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 20_818_976,
  },
  mainnet,
).extend<{
  encoder: ExecutorEncoder;
}>({
  encoder: async ({ client }, use) => {
    const hash = await client.deployContract({
      abi: executorAbi,
      bytecode,
      args: [client.account.address],
    });

    const receipt = await client.waitForTransactionReceipt({ hash });

    if (receipt.contractAddress == null) throw Error("no contract address");

    await use(new ExecutorEncoder(receipt.contractAddress, client));
  },
});
