import { getChainAddress } from "@morpho-org/blue-sdk";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import { type Address, type Hash, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import MorphoProtocolEvm from "../src/index.js";
import { test } from "./setup.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const VAULT: Address = "0xBb50A5341368751024ddf33385BA8cf61fE65FF9";

test.skipIf(!process.env.ERPC_SECRET)(
  "behavior: concurrent EOA native supplies use consecutive nonces",
  async ({ client }) => {
    const account = new WalletAccountEvm(SEED, "0'/0/0", {
      provider: client.transport.url!,
    });
    const owner = (await account.getAddress()) as Address;
    await client.setCode({ address: owner, bytecode: "0x" });
    await client.setBalance({ address: owner, value: parseEther("10") });

    const morpho = new MorphoProtocolEvm(account, {
      chainId: mainnet.id,
      earnVaultAddress: VAULT,
    });
    const token = getChainAddress(mainnet.id, "wNative");
    const [first, second] = await Promise.all([
      morpho.prepareSupply({ token, nativeAmount: 10n ** 15n }),
      morpho.prepareSupply({ token, nativeAmount: 2n * 10n ** 15n }),
    ]);
    expect(await first.getRequirements()).toEqual([]);
    expect(await second.getRequirements()).toEqual([]);
    const startingNonce = await client.getTransactionCount({
      address: owner,
      blockTag: "pending",
    });

    const results = await Promise.all([first.submit(), second.submit()]);
    expect(results[0].hash).not.toBe(results[1].hash);
    const receipts = await Promise.all(
      results.map(({ hash }) =>
        client.waitForTransactionReceipt({ hash: hash as Hash }),
      ),
    );
    expect(receipts.map(({ status }) => status)).toEqual([
      "success",
      "success",
    ]);

    const transactions = await Promise.all(
      results.map(({ hash }) => client.getTransaction({ hash: hash as Hash })),
    );
    const nonces = transactions
      .map((transaction) => transaction?.nonce)
      .sort((a, b) => (a ?? -1) - (b ?? -1));
    expect(nonces).toEqual([startingNonce, startingNonce + 1]);
  },
);
