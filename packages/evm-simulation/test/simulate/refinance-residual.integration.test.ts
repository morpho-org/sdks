import { MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import type { AnvilTestClient } from "@morpho-org/test";
import { getErpcForkUrl, MAINNET_FORK_BLOCK } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  multicall3Abi,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { simulate, toSimulationAuthorizations } from "../../src/index.js";
import { simulationClientFor } from "../../src/test-helpers/index.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: MAINNET_FORK_BLOCK,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CBBTC: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const ATTACKER: Address = "0x000000000000000000000000000000000000bEEF";
const BLUE = getChainAddresses(mainnet.id).blue;

const sourceMarket = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
const targetMarket = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xc7BE7593FD5453Db5AdcC1d7103f2211d4F2e40D",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

test("warns about a refinance into a newly created market with different collateral", async ({
  client,
}) => {
  const owner = client.account.address;
  const assets = 100n;
  const mismatchedTarget = new MarketParams({
    ...sourceMarket,
    collateralToken: USDC,
  });
  await client.deal({ erc20: CBBTC, amount: assets });
  await client.deal({ erc20: USDC, amount: assets });
  for (const token of [CBBTC, USDC]) {
    await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [BLUE, assets],
    });
  }
  await client.writeContract({
    address: BLUE,
    abi: blueAbi,
    functionName: "supplyCollateral",
    args: [sourceMarket, assets, owner, "0x"],
  });
  const report = await simulate(
    simulationClientFor(client.transport.url, mainnet),
    {
      limits: {
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: sourceMarket.id,
            targetMarketId: mismatchedTarget.id,
            quote: { sharesBurned: 1n, sharesMinted: 1n },
          },
        ],
      },
      transactions: [
        {
          from: owner,
          to: BLUE,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "createMarket",
            args: [mismatchedTarget],
          }),
        },
        {
          from: owner,
          to: BLUE,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "withdrawCollateral",
            args: [sourceMarket, assets, owner, owner],
          }),
        },
        {
          from: owner,
          to: BLUE,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [mismatchedTarget, assets, owner, "0x"],
          }),
        },
      ],
    },
  );
  expect(report).toMatchObject({
    ok: false,
    failures: [{ code: "CONSUMER_LIMIT_VIOLATION", field: "sharesBurned" }],
  });
  expect(report.warnings).toContainEqual(
    expect.objectContaining({
      code: "UNEXPECTED_POSITION_CHANGE",
      severity: "warn",
    }),
  );
});

test("allows an SDK refinance into a same-token market created in the bundle", async ({
  client,
}) => {
  const owner = client.account.address;
  const multicall3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const createdTarget = new MarketParams({
    ...targetMarket,
    lltv: 770_000_000_000_000_000n,
  });
  const morpho = client.extend(
    morphoViemExtension({ supportSignature: false }),
  ).morpho;
  const source = morpho.blue(sourceMarket, mainnet.id);
  const target = morpho.blue(createdTarget, mainnet.id);
  const collateralAssets = parseUnits("0.05", 8);
  await client.deal({ erc20: CBBTC, amount: collateralAssets });
  const open = source.supplyCollateralBorrow({
    userAddress: owner,
    collateralAssets,
    borrowAssets: parseUnits("5", 6),
    positionData: await source.getPositionData(owner),
    deadline: maxUint256,
  });
  for (const requirement of await open.getRequirements()) {
    if (!("to" in requirement)) continue;
    await client.sendTransaction({
      to: requirement.to,
      data: requirement.data,
      value: requirement.value,
    });
  }
  const openTx = open.buildTx();
  await client.sendTransaction({ to: openTx.to, data: openTx.data });
  await client.deal({
    erc20: USDC,
    account: multicall3,
    amount: parseUnits("100", 6),
  });
  const create = {
    from: owner,
    to: BLUE,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "createMarket",
      args: [createdTarget],
    }),
  };
  const supply = {
    from: owner,
    to: multicall3,
    data: encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [
        [
          {
            target: USDC,
            allowFailure: false,
            callData: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [BLUE, parseUnits("100", 6)],
            }),
          },
          {
            target: BLUE,
            allowFailure: false,
            callData: encodeFunctionData({
              abi: blueAbi,
              functionName: "supply",
              args: [createdTarget, parseUnits("100", 6), 0n, owner, "0x"],
            }),
          },
        ],
      ],
    }),
  };
  const snapshot = await client.snapshot();
  await client.sendTransaction(create);
  await client.sendTransaction(supply);
  const position = await source.getPositionData(owner);
  const destination = await target.getPositionData(owner);
  await client.revert({ id: snapshot });
  const refinance = source.refinance({
    userAddress: owner,
    positionData: position,
    destination: { marketParams: createdTarget, positionData: destination },
    deadline: maxUint256,
  });
  const tx = refinance.buildTx();
  const report = await simulate(
    simulationClientFor(client.transport.url, mainnet),
    {
      mode: "preview",
      authorizations: toSimulationAuthorizations({
        owner,
        requirements: await refinance.getRequirements(),
      }),
      limits: {
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: sourceMarket.id,
            targetMarketId: createdTarget.id,
            quote: {
              sharesBurned: position.borrowShares,
              sharesMinted: position.borrowShares * 2n,
            },
          },
        ],
      },
      transactions: [
        create,
        supply,
        { from: owner, to: tx.to, data: tx.data, value: tx.value },
      ],
    },
  );
  expect(
    report.ok,
    JSON.stringify(report, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ).toBe(true);
  expect(report.warnings.map(({ code }) => code)).not.toContain(
    "UNEXPECTED_POSITION_CHANGE",
  );
}, 240_000);

test.for([false, true])(
  "warns about an extra source collateral withdrawal before refinance; wallet top-up=%s",
  { timeout: 240_000 },
  async (topUp, { client }) => {
    const owner = client.account.address;
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const source = morpho.blue(sourceMarket, mainnet.id);
    const target = morpho.blue(targetMarket, mainnet.id);
    const collateralAssets = parseUnits("0.05", 8);
    const borrowAssets = parseUnits("5", 6);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });
    const open = source.supplyCollateralBorrow({
      userAddress: owner,
      collateralAssets,
      borrowAssets,
      positionData: await source.getPositionData(owner),
      deadline: maxUint256,
    });
    for (const requirement of await open.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    const openTx = open.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: openTx.to,
      data: openTx.data,
      value: openTx.value,
    });
    const extra = parseUnits("0.01", 8);
    if (topUp) {
      await client.deal({ erc20: CBBTC, amount: extra });
      await client.writeContract({
        address: CBBTC,
        abi: erc20Abi,
        functionName: "approve",
        args: [BLUE, extra],
      });
    }

    const refinance = source.refinance({
      userAddress: owner,
      positionData: await source.getPositionData(owner),
      destination: {
        marketParams: targetMarket,
        positionData: await target.getPositionData(owner),
      },
      deadline: maxUint256,
    });
    const tx = refinance.buildTx();
    const report = await simulate(
      simulationClientFor(client.transport.url, mainnet),
      {
        mode: "preview",
        authorizations: toSimulationAuthorizations({
          owner,
          requirements: await refinance.getRequirements(),
        }),
        limits: {
          operations: [
            {
              type: "blueRefinance",
              sourceMarketId: sourceMarket.id,
              targetMarketId: targetMarket.id,
              quote: {
                sharesBurned: (await source.getPositionData(owner))
                  .borrowShares,
                sharesMinted:
                  (await target.getMarketData()).toBorrowShares(
                    (await source.getPositionData(owner)).borrowAssets,
                    "Up",
                  ) * 2n,
              },
              slippageTolerance: 10_000000000000000n,
            },
          ],
        },
        transactions: [
          {
            from: owner,
            to: BLUE,
            data: encodeFunctionData({
              abi: blueAbi,
              functionName: "withdrawCollateral",
              args: [sourceMarket, extra, owner, ATTACKER],
            }),
            value: 0n,
          },
          { from: owner, to: tx.to, data: tx.data, value: tx.value },
          ...(topUp
            ? [
                {
                  from: owner,
                  to: BLUE,
                  data: encodeFunctionData({
                    abi: blueAbi,
                    functionName: "supplyCollateral",
                    args: [targetMarket, extra, owner, "0x"],
                  }),
                  value: 0n,
                },
              ]
            : []),
        ],
      },
    );
    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: "UNEXPECTED_POSITION_CHANGE",
        severity: "warn",
      }),
    );
    if (topUp) {
      expect(report.warnings).toContainEqual(
        expect.objectContaining({
          code: "UNEXPECTED_TOKEN_TRANSFER",
          severity: "warn",
        }),
      );
    }
  },
);
