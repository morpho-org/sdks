import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  erc20Abi,
  ethAddress,
  maxUint256,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { SimulationRevertedError, simulate } from "../../src/index.js";

// Pinned with the bundles deployments the verified pipeline routes through —
// the shared 24_593_903 pin in `test/setup.ts` predates them.
const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CBBTC: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WSTETH: Address = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

const CbbtcUsdcBlue = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

const CbbtcUsdcBlueAlt = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xc7BE7593FD5453Db5AdcC1d7103f2211d4F2e40D",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

const WstethWethBlue = new MarketParams({
  collateralToken: WSTETH,
  loanToken: WETH,
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 945_000_000_000_000_000n,
});

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

describe.sequential("simulate — real revert propagation", () => {
  test("error: SimulationRevertedError for insufficient ERC-20 balance", async ({
    client,
  }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const assets = parseUnits("10", 6);
    const action = morpho.supply({
      userAddress: client.account.address,
      assets,
      deadline: maxUint256,
    });
    for (const requirement of await action.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    // The account is approved but holds no USDC: the bundles pull reverts.

    const tx = action.buildTx();
    await expect(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
  }, 60_000);
});

describe.sequential("simulate — real native funding", () => {
  test("error: SimulationRevertedError when the sender cannot fund value", async ({
    client,
  }) => {
    // No balance inflation: a `value`-funded supply must be backed by the
    // sender's real native balance. Before the cutover this case succeeded
    // through an inflated balance override.
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);

    const assets = 10n ** 18n;
    const tx = morpho
      .supply({
        userAddress: client.account.address,
        assets,
        nativeAmount: assets,
        deadline: maxUint256,
      })
      .buildTx();
    expect(tx.value).toBe(assets);

    await client.setBalance({ address: client.account.address, value: 0n });
    await expect(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
  }, 60_000);

  test("behavior: succeeds when the real balance funds the value", async ({
    client,
  }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);

    const assets = 10n ** 18n;
    const tx = morpho
      .supply({
        userAddress: client.account.address,
        assets,
        nativeAmount: assets,
        deadline: maxUint256,
      })
      .buildTx();

    await client.setBalance({ address: client.account.address, value: assets });
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.status).toBe(true);
    expect(result.assetChanges).toContainEqual({
      account: client.account.address,
      changes: [{ token: ethAddress, diff: -assets }],
    });
  }, 60_000);
});

describe.sequential("simulate — sequential state and stable indices", () => {
  test("behavior: three transactions keep user indices 0..2 with no probe offset", async ({
    client,
  }) => {
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const addresses = getChainAddresses(mainnet.id)!;

    // One supply per market: the verifier compares each op to the pinned
    // snapshot, so the three user txs hit three distinct markets.
    const supplies: [MarketParams, Address, bigint][] = [
      [CbbtcUsdcBlue, USDC, parseUnits("1", 6)],
      [CbbtcUsdcBlueAlt, USDC, parseUnits("2", 6)],
      [WstethWethBlue, WETH, 10n ** 15n],
    ];
    // One reusable approval per pulled token covers the bundles pulls.
    for (const token of [USDC, WETH]) {
      await client.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.bundles!.blueBundlesV1!, maxUint256],
      });
    }
    const transactions = [];
    for (const [marketParams, , assets] of supplies) {
      const tx = morpho
        .blue(marketParams, mainnet.id)
        .supply({
          userAddress: client.account.address,
          assets,
          deadline: maxUint256,
        })
        .buildTx();
      transactions.push({
        from: client.account.address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
    }
    await client.deal({
      erc20: USDC,
      amount: supplies[0]![2] + supplies[1]![2],
    });
    await client.deal({ erc20: WETH, amount: supplies[2]![2] });

    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions,
    });

    expect(result.calls).toHaveLength(3);
    expect(result.simulationTxs).toHaveLength(3);
    expect([...new Set(result.transfers.map((t) => t.txIdx))]).toEqual([
      0, 1, 2,
    ]);
    expect(
      result.verification.operations.map((o) => o.transactionIndex),
    ).toEqual([0, 1, 2]);
  }, 120_000);
});
