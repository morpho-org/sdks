// AUDIT F1: undeclared owner position decreases surface in report warnings.
import { MarketParams } from "@morpho-org/blue-sdk";
import {
  midnightSupplyCollateral,
  midnightWithdrawCollateral,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { MarketParams as MidnightMarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
import type { AnvilTestClient } from "@morpho-org/test";
import { getErpcForkUrl, MAINNET_FORK_BLOCK } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { simulate } from "../../src/index.js";
import { simulationClientFor } from "../../src/test-helpers/index.js";
import { seededMarketData } from "../setup.js";

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
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WSTETH: Address = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const ATTACKER: Address = "0x000000000000000000000000000000000000bEEF";
const { blue: MORPHO } = getChainAddresses(mainnet.id);

// Declared market: the user supplies 10 USDC here.
const declaredMarket = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
// Undeclared market: the user already holds 10 wstETH of collateral here.
const undeclaredMarket = new MarketParams({
  collateralToken: WSTETH,
  loanToken: WETH,
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 945_000_000_000_000_000n,
});

const marketTuple = {
  loanToken: undeclaredMarket.loanToken,
  collateralToken: undeclaredMarket.collateralToken,
  oracle: undeclaredMarket.oracle,
  irm: undeclaredMarket.irm,
  lltv: undeclaredMarket.lltv,
};

for (const drain of ["withdrawCollateral", "borrow"] as const) {
  test(`[AUDIT F1] warns about undeclared Blue ${drain} to a third party`, async ({
    client,
  }) => {
    const owner = client.account.address;
    const collateral = parseEther("10");

    // Pre-existing position in the undeclared market.
    await client.deal({ erc20: WSTETH, amount: collateral });
    await client.writeContract({
      address: WSTETH,
      abi: erc20Abi,
      functionName: "approve",
      args: [MORPHO, collateral],
    });
    await client.writeContract({
      address: MORPHO,
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [marketTuple, collateral, owner, "0x"],
    });

    // Declared action: supply 10 USDC to the declared market.
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(declaredMarket, mainnet.id);
    const assets = parseUnits("10", 6);
    const action = morpho.supply({
      marketData: await seededMarketData(client, morpho),
      userAddress: owner,
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
    await client.deal({ erc20: USDC, amount: assets });
    const supplyTx = action.buildTx();

    // Injected transaction: move value out of the undeclared position.
    const drainData =
      drain === "withdrawCollateral"
        ? encodeFunctionData({
            abi: blueAbi,
            functionName: "withdrawCollateral",
            args: [marketTuple, collateral, owner, ATTACKER],
          })
        : encodeFunctionData({
            abi: blueAbi,
            functionName: "borrow",
            args: [marketTuple, parseEther("0.001"), 0n, owner, ATTACKER],
          });

    const before = await client.readContract({
      address: drain === "withdrawCollateral" ? WSTETH : WETH,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ATTACKER],
    });
    expect(before).toBe(0n);

    const report = await simulate(
      simulationClientFor(client.transport.url, mainnet),
      {
        limits: {
          operations: [
            {
              type: "blueSupply",
              marketId: declaredMarket.id,
              inputs: { assets },
            },
          ],
        },
        transactions: [
          {
            from: owner,
            to: supplyTx.to,
            data: supplyTx.data,
            value: supplyTx.value,
          },
          { from: owner, to: MORPHO, data: drainData },
        ],
      },
    );

    const attackerGain = report.ok
      ? report.result.assetChanges
          .find(
            ({ account }) => account.toLowerCase() === ATTACKER.toLowerCase(),
          )
          ?.changes.map(({ token, diff }) => `${token}:${diff}`)
      : undefined;
    expect(
      report.ok,
      `expected a non-blocking warning for third-party gain ${attackerGain}`,
    ).toBe(true);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: "UNEXPECTED_POSITION_CHANGE",
        severity: "warn",
      }),
    );
    const drainToken = drain === "withdrawCollateral" ? WSTETH : WETH;
    expect(
      report.ok
        ? report.result.assetChanges
            .find(
              ({ account }) => account.toLowerCase() === ATTACKER.toLowerCase(),
            )
            ?.changes.find(
              ({ token }) => token.toLowerCase() === drainToken.toLowerCase(),
            )?.diff
        : undefined,
    ).toBe(drain === "withdrawCollateral" ? collateral : parseEther("0.001"));
  }, 120_000);
}

for (const form of ["quote", "inputs"] as const) {
  for (const drain of ["withdrawCollateral", "borrow"] as const) {
    test(`[AUDIT F1] same-market ${form} blueSupply with ${drain}`, async ({
      client,
    }) => {
      const owner = client.account.address;
      const collateral = parseEther("10");
      await client.deal({ erc20: WSTETH, amount: collateral });
      await client.writeContract({
        address: WSTETH,
        abi: erc20Abi,
        functionName: "approve",
        args: [MORPHO, collateral],
      });
      await client.writeContract({
        address: MORPHO,
        abi: blueAbi,
        functionName: "supplyCollateral",
        args: [marketTuple, collateral, owner, "0x"],
      });
      const assets = parseEther("0.01");
      await client.deal({ erc20: WETH, amount: assets });
      await client.writeContract({
        address: WETH,
        abi: erc20Abi,
        functionName: "approve",
        args: [MORPHO, assets],
      });
      const report = await simulate(
        simulationClientFor(client.transport.url, mainnet),
        {
          limits: {
            operations: [
              {
                type: "blueSupply",
                marketId: undeclaredMarket.id,
                ...(form === "inputs"
                  ? { inputs: { assets } }
                  : { quote: { assetsPaid: assets, sharesMinted: 1n } }),
              },
            ],
          },
          transactions: [
            {
              from: owner,
              to: MORPHO,
              data: encodeFunctionData({
                abi: blueAbi,
                functionName: "supply",
                args: [marketTuple, assets, 0n, owner, "0x"],
              }),
            },
            {
              from: owner,
              to: MORPHO,
              data:
                drain === "borrow"
                  ? encodeFunctionData({
                      abi: blueAbi,
                      functionName: "borrow",
                      args: [
                        marketTuple,
                        parseEther("0.001"),
                        0n,
                        owner,
                        ATTACKER,
                      ],
                    })
                  : encodeFunctionData({
                      abi: blueAbi,
                      functionName: "withdrawCollateral",
                      args: [marketTuple, collateral, owner, ATTACKER],
                    }),
            },
          ],
        },
      );
      expect(
        report.ok,
        `same-market ${form} ${drain}: ${JSON.stringify(
          report,
          (_key, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
        )}`,
      ).toBe(form === "quote");
      expect(report.warnings).toContainEqual(
        expect.objectContaining({
          code: "UNEXPECTED_POSITION_CHANGE",
          severity: "warn",
        }),
      );
      if (!report.ok) {
        expect(report.failures.map(({ code }) => code)).toContain(
          "CONSUMER_LIMIT_VIOLATION",
        );
      }
    }, 120_000);
  }
}

test("[AUDIT F1] undeclared Midnight collateral withdrawal to a third party", async ({
  client,
}) => {
  const owner = client.account.address;
  const midnight = getChainAddresses(mainnet.id).midnight!;
  expect(await client.getCode({ address: midnight })).not.toBe("0x");
  const market = new MidnightMarketParams({
    chainId: mainnet.id,
    midnight,
    loanToken: USDC,
    collateralParams: [
      {
        token: WSTETH,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: undeclaredMarket.oracle,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });
  const collateral = parseEther("10");
  await client.deal({ erc20: WSTETH, amount: collateral });
  await client.writeContract({
    address: WSTETH,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, collateral],
  });
  const seed = midnightSupplyCollateral({
    chainId: mainnet.id,
    market,
    assets: collateral,
    onBehalf: owner,
  });
  await client.sendTransaction({
    account: client.account,
    to: seed.to,
    data: seed.data,
  });
  const assets = parseUnits("10", 6);
  await client.deal({ erc20: USDC, amount: assets });
  await client.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [MORPHO, assets],
  });
  const drain = midnightWithdrawCollateral({
    chainId: mainnet.id,
    market,
    assets: collateral,
    onBehalf: owner,
    receiver: ATTACKER,
  });
  const report = await simulate(
    simulationClientFor(client.transport.url, mainnet),
    {
      limits: {
        operations: [
          {
            type: "blueSupply",
            marketId: declaredMarket.id,
            inputs: { assets },
          },
        ],
      },
      transactions: [
        {
          from: owner,
          to: MORPHO,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "supply",
            args: [declaredMarket, assets, 0n, owner, "0x"],
          }),
        },
        { from: owner, to: drain.to, data: drain.data },
      ],
    },
  );
  expect(
    report.ok,
    `undeclared Midnight withdrawal: ${JSON.stringify(
      report,
      (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
    )}`,
  ).toBe(true);
  expect(report.warnings).toContainEqual(
    expect.objectContaining({
      code: "UNEXPECTED_POSITION_CHANGE",
      severity: "warn",
    }),
  );
}, 120_000);
