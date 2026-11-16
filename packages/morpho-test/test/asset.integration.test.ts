import { ChainId } from "@morpho-org/morpho-ts";
import {
  createAnvilTestClient,
  getErpcForkUrl,
  spawnAnvil,
  testAccount,
} from "@morpho-org/test";
import { erc20Abi, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { E2E_ASSET } from "../src/e2e/asset.js";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
} from "../src/e2e/midnight.js";
import { E2E_FORK_BLOCKS } from "../src/e2e/registryMatrix.js";
import { installE2eAsset, wrapE2eNative } from "../src/e2e/setup.js";

const chain = { ...mainnet, id: ChainId.ArcMainnet };
const withdrawAbi = parseAbi(["function withdraw(uint256 amount)"]);

describe("installed WETH9 backing", () => {
  test.for(
    ["setup", "midnight"].flatMap((path) =>
      [false, true].map((fork) => ({ path, fork })),
    ),
  )(
    "$path funding preserves supply and permits withdrawals (fork=$fork)",
    async ({ path, fork }) => {
      const node = await spawnAnvil({
        chainId: chain.id,
        autoImpersonate: true,
        gasPrice: 0n,
        blockBaseFeePerGas: 0n,
        ...(fork
          ? {
              forkUrl: getErpcForkUrl(chain.id, process.env.ERPC_SECRET),
              forkBlockNumber: E2E_FORK_BLOCKS[chain.id],
            }
          : {}),
      });
      try {
        const client = createAnvilTestClient(http(node.rpcUrl), chain);
        const accounts =
          path === "setup"
            ? [client.account.address, testAccount(1).address]
            : [E2E_MIDNIGHT_WALLETS.A, E2E_MIDNIGHT_WALLETS.B];
        for (const account of accounts)
          await client.setCode({ address: account, bytecode: "0x" });
        const market =
          path === "midnight"
            ? (await createE2eMidnightMarket(client, chain.id)).params
            : undefined;
        const token = market?.collateralParams[0]!.token ?? E2E_ASSET;
        if (path === "setup") await installE2eAsset(client, token);
        for (const amount of [10n, 5n, -2n]) {
          if (path === "setup") {
            for (const account of accounts)
              await wrapE2eNative(client, { wNative: token, amount, account });
          } else {
            await fundE2eMidnightWallets(client, {
              market,
              wallets: {
                A: { collateralAssets: amount },
                B: { collateralAssets: amount },
              },
            });
          }
        }
        await client.writeContract({
          account: accounts[0]!,
          address: token,
          abi: erc20Abi,
          functionName: "transfer",
          args: [accounts[1]!, 3n],
        });
        const balances = await Promise.all(
          accounts.map((owner) => client.balanceOf({ erc20: token, owner })),
        );
        const supply = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "totalSupply",
        });
        expect.soft(supply).toBe(balances[0]! + balances[1]!);
        for (const account of accounts) {
          const amount = await client.balanceOf({
            erc20: token,
            owner: account,
          });
          const hash = await client.writeContract({
            account,
            address: token,
            abi: withdrawAbi,
            functionName: "withdraw",
            args: [amount],
          });
          expect(
            (await client.waitForTransactionReceipt({ hash })).status,
          ).toBe("success");
          expect(await client.balanceOf({ erc20: token, owner: account })).toBe(
            0n,
          );
        }
        expect(
          await client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "totalSupply",
          }),
        ).toBe(0n);
      } finally {
        await node.stopAndWait();
      }
    },
  );
});
