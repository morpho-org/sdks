import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { metaMorphoAbi } from "@morpho-org/morpho-ts/abis";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  decodeErrorResult,
  encodeErrorResult,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  maxUint256,
  parseAbi,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { SimulationRevertedError, simulate } from "../../src/index.js";

// Pinned with the bundles deployments the verified pipeline routes through —
// the shared 24_593_903 pin in `test/setup.ts` predates them.
const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
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
  // Cold fork reads may exceed the production default while fetching upstream state.
  timeoutMs: 30_000,
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
    ).rejects.toMatchObject({
      // USDC reverts with a plain Error(string); bytes and text are preserved.
      name: "SimulationRevertedError",
      message: expect.stringContaining("Error("),
      revertData: expect.stringMatching(/^0x08c379a0/),
    });
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
    const error = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      message:
        "Sender native balance cannot fund transaction value. Fund the sender or reduce value.",
      revertData: undefined,
      cause: expect.any(Error),
    });
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
      limits: {
        operations: [
          {
            type: "blueSupply",
            marketId: WstethWethBlue.id,
            assetPaid: ethAddress,
            quote: { assetsPaid: assets },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });
    expect(result.verification.operations[0]?.checkedLimits).toEqual({
      quote: { assetsPaid: assets },
      slippageTolerance: 0n,
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
  test("behavior: three transactions keep user indices 0..2", async ({
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
      limits: {
        operations: supplies.map(([marketParams]) => ({
          type: "blueSupply" as const,
          marketId: marketParams.id,
          quote: { sharesMinted: 1n },
          slippageTolerance: 0n,
        })),
      },
      transactions,
    });

    expect(result.calls).toHaveLength(3);
    expect(result.simulationTxs).toHaveLength(3);
    expect([...new Set(result.transfers.map((t) => t.txIdx))]).toEqual([
      0, 1, 2,
    ]);
    expect(result.verification.operations.map((o) => o.checkedLimits)).toEqual(
      supplies.map(() => ({
        quote: { sharesMinted: 1n },
        slippageTolerance: 0n,
      })),
    );
  }, 120_000);
});

const BLUE: Address = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const STEAKHOUSE_USDC: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
// Re7 WETH: every cap is reached at the pinned block (maxDeposit = 0).
const RE7_WETH: Address = "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0";
const OTHER: Address = "0x00000000000000000000000000000000DeaDBeef";

const blueAbi = parseAbi([
  "struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }",
  "function borrow(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)",
]);
const vaultAbi = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function transfer(address to, uint256 shares) returns (bool)",
  "function transferFrom(address from, address to, uint256 shares) returns (bool)",
]);

describe.sequential("simulate — named revert errors", () => {
  const borrow = (onBehalf: Address, receiver: Address) =>
    encodeFunctionData({
      abi: blueAbi,
      functionName: "borrow",
      args: [CbbtcUsdcBlue, 1n, 0n, onBehalf, receiver],
    });

  const cases = [
    [
      "Blue borrow without collateral",
      BLUE,
      (a: Address) => borrow(a, a),
      // Blue returns the standard reason string.
      "Error",
    ],
    [
      "MetaMorpho share transfer above balance",
      STEAKHOUSE_USDC,
      () =>
        encodeFunctionData({
          abi: vaultAbi,
          functionName: "transfer",
          args: [OTHER, 1n],
        }),
      "ERC20InsufficientBalance",
    ],
    [
      "MetaMorpho share transferFrom without allowance",
      STEAKHOUSE_USDC,
      (a: Address) =>
        encodeFunctionData({
          abi: vaultAbi,
          functionName: "transferFrom",
          args: [OTHER, a, 1n],
        }),
      "ERC20InsufficientAllowance",
    ],
  ] as const;
  for (const [name, to, data, errorName] of cases) {
    test(`error: ${name} preserves all revert arguments`, async ({
      client,
    }) => {
      const error = await simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to,
            data: data(client.account.address),
          },
        ],
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SimulationRevertedError);
      if (!(error instanceof SimulationRevertedError) || !error.revertData)
        throw error;
      const decoded = decodeErrorResult({
        abi: metaMorphoAbi,
        data: error.revertData,
      });
      expect(decoded.errorName).toBe(errorName);
      expect(error.message).toContain(errorName);
      if (
        decoded.errorName === "ERC20InsufficientBalance" ||
        decoded.errorName === "ERC20InsufficientAllowance"
      ) {
        expect(decoded.args).toEqual([client.account.address, 0n, 1n]);
        expect(error.message).toContain("needed=1");
        expect(error.message).toContain(
          decoded.errorName === "ERC20InsufficientBalance"
            ? "balance=0"
            : "allowance=0",
        );
      } else {
        expect(decoded.args).toEqual(["insufficient collateral"]);
        expect(error.message).toContain("insufficient collateral");
      }
    }, 60_000);
  }

  test("error: funded deposit into a MetaMorpho vault with maxDeposit = 0 → AllCapsReached", async ({
    client,
  }) => {
    const assets = 10n ** 18n;
    await client.deal({ erc20: WETH, amount: assets });
    await client.writeContract({
      account: client.account,
      chain: mainnet,
      address: WETH,
      abi: erc20Abi,
      functionName: "approve",
      args: [RE7_WETH, assets],
    });
    await expect(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: RE7_WETH,
            data: encodeFunctionData({
              abi: vaultAbi,
              functionName: "deposit",
              args: [assets, client.account.address],
            }),
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: "SimulationRevertedError",
      revertData: encodeErrorResult({
        abi: metaMorphoAbi,
        errorName: "AllCapsReached",
      }),
      message: "Transaction 0 reverted: AllCapsReached()",
    });
  }, 60_000);
});
