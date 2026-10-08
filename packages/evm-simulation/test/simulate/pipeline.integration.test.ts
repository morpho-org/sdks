import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { blueBundlesV1Abi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  ConsumerLimitViolationError,
  SimulationRevertedError,
  simulate,
  toSimulationAuthorizations,
} from "../../src/index.js";

/**
 * Pinned after the bundles contracts (BlueBundlesV1, VaultBundlesV1,
 * VaultExitBundlesV1) were deployed on mainnet — the shared 24_593_903 pin in
 * `test/setup.ts` predates them and predates this pipeline's supported routes.
 */
const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CBBTC: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

const CbbtcUsdcBlue = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

describe.sequential("simulate pipeline — blue supply", () => {
  test("final mode: on-chain approve + supply succeeds", async ({ client }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const assets = parseUnits("10", 6);
    const action = morpho.supply({
      userAddress: client.account.address,
      assets,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements();
    for (const requirement of requirements) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    await client.deal({ erc20: USDC, amount: assets });

    const tx = action.buildTx();
    const result = await simulate(client, {
      limits: {
        operations: [
          {
            type: "blueSupply",
            marketId: CbbtcUsdcBlue.id,
            slippageTolerance: 0n,
            quote: {
              assetsPaid: assets,
              sharesMinted: 1n,
            },
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

    expect(result.simulationTxs).toHaveLength(1);
    expect(result.verification.mode).toBe("final");
    expect(result.verification.authorizations).toEqual([]);
    expect(result.verification.operations).toHaveLength(1);
    expect(result.verification.operations[0]!.operation).toBe("blueSupply");
  }, 60_000);

  test("preview mode: erc20Approval authorization prepares and verifies", async ({
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
    const requirements = await action.getRequirements();
    expect(requirements.length).toBeGreaterThan(0);

    await client.deal({ erc20: USDC, amount: assets });

    const authorizations = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements,
    });
    const tx = action.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "blueSupply",
            marketId: CbbtcUsdcBlue.id,
            slippageTolerance: 0n,
            quote: {
              assetsPaid: assets,
              sharesMinted: 1n,
            },
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

    expect(result.verification.mode).toBe("preview");
    expect(result.verification.authorizations).toHaveLength(
      authorizations.length,
    );
    expect(result.simulationTxs).toHaveLength(1);
    expect(result.verification.operations[0]!.operation).toBe("blueSupply");
  }, 60_000);
});

describe.sequential("simulate pipeline — blue borrow/repay", () => {
  test("supplyCollateralBorrow preview with blueAuthorization, then repay full + withdrawCollateral", async ({
    client,
  }) => {
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    const collateralAssets = parseUnits("0.05", 8);
    const borrowAssets = parseUnits("5", 6);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });

    const positionData = await market.getPositionData(client.account.address);
    const action = market.supplyCollateralBorrow({
      userAddress: client.account.address,
      collateralAssets,
      borrowAssets,
      positionData,
      deadline: maxUint256,
    });
    const requirements = await action.getRequirements();
    const authorizations = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements,
    });
    expect(authorizations.some((a) => a.type === "blueAuthorization")).toBe(
      true,
    );

    const tx = action.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: CbbtcUsdcBlue.id,
            quote: {
              assetsReceived: borrowAssets,
              assetsPaid: collateralAssets,
            },
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
    expect(result.verification.operations[0]!.operation).toBe(
      "blueSupplyCollateralBorrow",
    );
    expect(result.verification.authorizations.length).toBe(
      authorizations.length,
    );

    // Preview never touches chain state: satisfy requirements and execute the
    // borrow for real so the repay/withdrawCollateral legs have a position.
    for (const r of requirements) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });

    // Repay the full borrow position + withdraw collateral on-chain via the
    // same simulated paths: satisfy requirements on-chain and use final mode.
    const positionAfter = await market.getPositionData(client.account.address);
    const repay = market.repayWithdrawCollateral({
      userAddress: client.account.address,
      positionData: positionAfter,
      repayShares: positionAfter.borrowShares,
      collateralAssets,
      deadline: BigInt(Math.floor(Date.now() / 1_000)) + 3600n,
    });
    const repayReqs = await repay.getRequirements();
    for (const r of repayReqs) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    await client.deal({ erc20: USDC, amount: parseUnits("100", 6) });
    const repayTx = repay.buildTx();
    const repayResult = await simulate(client, {
      limits: {
        operations: [
          {
            type: "blueRepayWithdrawCollateral",
            marketId: CbbtcUsdcBlue.id,
            slippageTolerance: 0n,
            quote: {
              assetsReceived: collateralAssets,
            },
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: repayTx.to,
          data: repayTx.data,
          value: repayTx.value,
        },
      ],
    });
    expect(
      repayResult.verification.operations.map((o) => o.operation),
    ).toContain("blueRepayWithdrawCollateral");
  }, 120_000);

  test("behavior: no implicit LLTV buffer is enforced", async ({ client }) => {
    const addresses = getChainAddresses(mainnet.id)!;
    const collateralAssets = parseUnits("0.05", 8);
    // ~$3,930 collateral: between the LLTV buffer (85.5%) and LLTV (86%).
    const borrowAssets = parseUnits("3370", 6);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });
    // Approve the bundles contract to pull collateral.
    await client.writeContract({
      address: CBBTC,
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        },
      ],
      functionName: "approve",
      args: [addresses.bundles!.blueBundlesV1!, maxUint256],
    });
    await client.writeContract({
      address: addresses.blue,
      abi: [
        {
          type: "function",
          name: "setAuthorization",
          stateMutability: "nonpayable",
          inputs: [
            { name: "authorized", type: "address" },
            { name: "isAuthorized", type: "bool" },
          ],
          outputs: [],
        },
      ],
      functionName: "setAuthorization",
      args: [addresses.bundles!.blueBundlesV1!, true],
    });
    const p = CbbtcUsdcBlue;
    const data = encodeFunctionData({
      abi: blueBundlesV1Abi,
      functionName: "blueBundlesV1SupplyCollateralAndBorrow",
      args: [
        {
          loanToken: p.loanToken,
          collateralToken: p.collateralToken,
          oracle: p.oracle,
          irm: p.irm,
          lltv: p.lltv,
        },
        collateralAssets,
        borrowAssets,
        p.lltv,
        { kind: 0, data: "0x" },
        {
          signature: {
            v: 0,
            r: `0x${"00".repeat(32)}` as `0x${string}`,
            s: `0x${"00".repeat(32)}` as `0x${string}`,
          },
          nonce: 0n,
          deadline: 0n,
        },
        [],
        0n,
        "0x0000000000000000000000000000000000000000",
        maxUint256,
      ],
    });
    const result = await simulate(client, {
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: CbbtcUsdcBlue.id,
            quote: {
              assetsReceived: borrowAssets,
              assetsPaid: collateralAssets,
            },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: addresses.bundles!.blueBundlesV1!,
          data,
          value: 0n,
        },
      ],
    });
    expect(result.verification.operations[0]?.checkedLimits).toEqual({
      quote: { assetsReceived: borrowAssets, assetsPaid: collateralAssets },
      slippageTolerance: 0n,
    });
  }, 120_000);
});

describe.sequential("simulate pipeline — negatives", () => {
  test("error: SimulationRevertedError for mismatched approval amount", async ({
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
    await client.deal({ erc20: USDC, amount: assets });
    const requirements = await action.getRequirements();
    const authorizations = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements,
    }).map((a) => (a.type === "erc20Approval" ? { ...a, amount: 1n } : a));
    const tx = action.buildTx();
    await expect(
      simulate(client, {
        mode: "preview",
        authorizations,
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

  test("error: SimulationRevertedError in final mode without allowance", async ({
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
    await client.deal({ erc20: USDC, amount: assets });
    const tx = action.buildTx();
    await expect(
      simulate(client, {
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

  test("error: ConsumerLimitViolationError for an operation bound above the simulated outcome", async ({
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
    await client.deal({ erc20: USDC, amount: assets });
    const requirements = await action.getRequirements();
    for (const r of requirements) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const tx = action.buildTx();
    await expect(
      simulate(client, {
        limits: {
          operations: [
            {
              type: "blueSupply",
              marketId: CbbtcUsdcBlue.id,
              slippageTolerance: 0n,
              quote: {
                sharesMinted: maxUint256,
              },
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
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }, 60_000);

  test("behavior: a raw WETH deposit runs unchecked without limits.operations", async ({
    client,
  }) => {
    const result = await simulate(client, {
      transactions: [
        {
          from: client.account.address,
          to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          data: "0xd0e30db0",
          value: 1n,
        },
      ],
    });
    expect(result.verification.operations).toEqual([]);
  }, 60_000);

  test("error: SimulationRevertedError for a reverting bundle", async ({
    client,
  }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    // Approved but unfunded supply — the pull reverts for balance.
    const assets = parseUnits("1000000000", 6);
    const action = morpho.supply({
      userAddress: client.account.address,
      assets,
      deadline: maxUint256,
    });
    const requirements = await action.getRequirements();
    for (const r of requirements) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const tx = action.buildTx();
    await expect(
      simulate(client, {
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

describe.sequential("simulate pipeline — vault V1", () => {
  const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";

  test("deposit, withdraw, and redeem through the full pipeline", async ({
    client,
  }) => {
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morphoClient.vaultV1(STEAKHOUSE, mainnet.id);
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;

    // Deposit (final mode — approve on-chain first).
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const vaultData = await vault.getData();
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      slippageTolerance: 0n,
      deadline,
    });
    for (const r of await deposit.getRequirements()) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const depositTx = deposit.buildTx();
    const depositResult = await simulate(client, {
      limits: {
        operations: [
          {
            type: "vaultV1Deposit",
            vault: STEAKHOUSE,
            quote: { assetsPaid: assets },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: depositTx.to,
          data: depositTx.data,
          value: depositTx.value,
        },
      ],
    });
    expect(depositResult.verification.operations[0]!.operation).toBe(
      "vaultV1Deposit",
    );

    // Execute the deposit so the account holds vault shares.
    await client.sendTransaction({
      account: client.account,
      to: depositTx.to,
      data: depositTx.data,
      value: depositTx.value,
    });
    const shares = await client.readContract({
      address: STEAKHOUSE,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "a", type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [client.account.address],
    });
    expect(shares).toBeGreaterThan(0n);

    // Withdraw (assets mode) — preview with the share-cap approval
    // authorization.
    const withdrawAssets = assets / 2n;
    const withdraw = vault.withdraw({
      amount: withdrawAssets,
      userAddress: client.account.address,
      vaultData: await vault.getData(),
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
      deadline,
    });
    const withdrawReqs = await withdraw.getRequirements();
    const withdrawAuths = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements: withdrawReqs,
    });
    const withdrawTx = withdraw.buildTx();
    const withdrawResult = await simulate(client, {
      mode: "preview",
      authorizations: withdrawAuths,
      limits: {
        operations: [
          {
            type: "vaultV1Withdraw",
            vault: STEAKHOUSE,
            quote: { assetsReceived: withdrawAssets },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: withdrawTx.to,
          data: withdrawTx.data,
          value: withdrawTx.value,
        },
      ],
    });
    expect(withdrawResult.verification.operations[0]!.operation).toBe(
      "vaultV1Withdraw",
    );

    // Redeem (shares mode) — satisfy share allowance on-chain, final mode.
    const redeemShares = shares / 4n;
    const redeem = vault.redeem({
      shares: redeemShares,
      userAddress: client.account.address,
      deadline,
    });
    for (const r of await redeem.getRequirements()) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const redeemTx = redeem.buildTx();
    const redeemResult = await simulate(client, {
      limits: {
        operations: [
          {
            type: "vaultV1Redeem",
            vault: STEAKHOUSE,
            quote: { sharesBurned: redeemShares },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: redeemTx.to,
          data: redeemTx.data,
          value: redeemTx.value,
        },
      ],
    });
    expect(redeemResult.verification.operations[0]!.operation).toBe(
      "vaultV1Redeem",
    );
  }, 180_000);
});

describe.sequential("simulate pipeline — vault V2", () => {
  const KEYROCK: Address = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";

  test("vaultV2Deposit: optional slippage checks use the selected share recipient", async ({
    client,
  }) => {
    const assets = parseUnits("10", 6);
    const recipient: Address = "0x0000000000000000000000000000000000000123";
    await client.deal({ erc20: USDC, amount: assets });
    await client.writeContract({
      account: client.account,
      address: USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [KEYROCK, assets],
    });
    const transactions = [
      {
        from: client.account.address,
        to: KEYROCK,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "deposit",
          args: [assets, recipient],
        }),
      },
    ];
    const input = { timeoutMs: 30_000, transactions };
    const unchecked = await simulate(client, input);
    expect(unchecked.verification.operations).toEqual([]);
    const sharesMinted = unchecked.transfers
      .filter(
        (transfer) =>
          isAddressEqual(transfer.token, KEYROCK) &&
          isAddressEqual(transfer.to, recipient),
      )
      .reduce((total, transfer) => total + transfer.amount, 0n);
    expect(sharesMinted).toBeGreaterThan(0n);
    const operation = {
      type: "vaultV2Deposit" as const,
      vault: KEYROCK,
      account: recipient,
      slippageTolerance: 0n,
      quote: { sharesMinted, assetsPaid: assets },
    };
    const result = await simulate(client, {
      ...input,
      limits: { operations: [operation] },
    });
    expect(result.verification.operations[0]?.checkedLimits).toEqual({
      slippageTolerance: 0n,
      quote: { sharesMinted, assetsPaid: assets },
    });
    const tolerated = await simulate(client, {
      ...input,
      limits: {
        operations: [
          {
            ...operation,
            quote: {
              sharesMinted: (sharesMinted * 1005n) / 1000n,
              assetsPaid: (assets * 995n) / 1000n,
            },
            slippageTolerance: 10_000000000000000n,
          },
        ],
      },
    });
    expect(
      tolerated.verification.operations[0]?.checkedLimits.slippageTolerance,
    ).toBe(10_000000000000000n);
    for (const override of [
      {
        quote: {
          ...operation.quote,
          sharesMinted: (sharesMinted * 102n) / 100n,
        },
        slippageTolerance: 10_000000000000000n,
      },
      {
        quote: { ...operation.quote, assetsPaid: (assets * 98n) / 100n },
        slippageTolerance: 10_000000000000000n,
      },
      { quote: { ...operation.quote, sharesMinted: sharesMinted + 1n } },
      { quote: { ...operation.quote, assetsPaid: assets - 1n } },
      { account: client.account.address },
    ]) {
      await expect(
        simulate(client, {
          ...input,
          limits: { operations: [{ ...operation, ...override }] },
        }),
      ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
    }
  }, 180_000);

  test("deposit then forceWithdraw through VaultExitBundlesV1", async ({
    client,
  }) => {
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morphoClient.vaultV2(KEYROCK, mainnet.id);
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;

    // Deposit to acquire vault shares.
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const vaultData = await vault.getData();
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
      deadline,
    });
    for (const r of await deposit.getRequirements()) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const depositTx = deposit.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: depositTx.to,
      data: depositTx.data,
      value: depositTx.value,
    });
    const shares = await client.readContract({
      address: KEYROCK,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "a", type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [client.account.address],
    });
    expect(shares).toBeGreaterThan(0n);

    // forceWithdraw — the entity derives its own deallocations.
    const exit = vault.forceWithdraw({
      exitAssets: assets / 2n,
      vaultData: await vault.getData(),
      userAddress: client.account.address,
    });
    const exitReqs = await exit.getRequirements();
    const exitAuths = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements: exitReqs,
    });
    const exitTx = exit.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations: exitAuths,
      limits: {
        operations: [
          {
            type: "vaultV2ForceWithdraw",
            vault: KEYROCK,
            slippageTolerance: 0n,
            quote: {
              assetsReceived: 1n,
            },
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: exitTx.to,
          data: exitTx.data,
          value: exitTx.value,
        },
      ],
    });
    expect(result.verification.operations[0]!.operation).toBe(
      "vaultV2ForceWithdraw",
    );
  }, 240_000);
});

describe.sequential("simulate pipeline — vault exits", () => {
  const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
  const KEYROCK: Address = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";

  const depositV1Shares = async (
    client: AnvilTestClient,
    assets: bigint,
  ): Promise<void> => {
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morphoClient.vaultV1(STEAKHOUSE, mainnet.id);
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;
    await client.deal({ erc20: USDC, amount: assets });
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData: await vault.getData(),
      slippageTolerance: 0n,
      deadline,
    });
    for (const r of await deposit.getRequirements()) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const tx = deposit.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  };

  const depositV2Shares = async (
    client: AnvilTestClient,
    assets: bigint,
  ): Promise<void> => {
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morphoClient.vaultV2(KEYROCK, mainnet.id);
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;
    await client.deal({ erc20: USDC, amount: assets });
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData: await vault.getData(),
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
      deadline,
    });
    for (const r of await deposit.getRequirements()) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const tx = deposit.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  };

  test("V1 to V2 migration", async ({ client }) => {
    await depositV1Shares(client, parseUnits("10", 6));
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const source = morphoClient.vaultV1(STEAKHOUSE, mainnet.id);
    const target = morphoClient.vaultV2(KEYROCK, mainnet.id);
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;
    const migration = source.migrateToV2({
      assets: parseUnits("5", 6),
      userAddress: client.account.address,
      sourceVault: await source.getData(),
      targetVault: await target.getData(),
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
      deadline,
    });
    const auths = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements: await migration.getRequirements(),
    });
    const tx = migration.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations: auths,
      limits: {
        operations: [
          {
            type: "vaultV1MigrateToV2",
            sourceVault: STEAKHOUSE,
            targetVault: KEYROCK,
            quote: {
              sharesMinted: (await target.getData()).toShares(
                parseUnits("5", 6),
              ),
            },
            slippageTolerance: 10_000000000000000n,
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
    expect(result.verification.operations[0]!.operation).toBe(
      "vaultV1MigrateToV2",
    );
  }, 240_000);

  test("V2 forceRedeem multicall with explicit deallocation", async ({
    client,
  }) => {
    await depositV2Shares(client, parseUnits("10", 6));
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morphoClient.vaultV2(KEYROCK, mainnet.id);
    const vaultData = await vault.getData();
    const adapter = vaultData.accrualAdapters[0];
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Keyrock vault has no Blue market adapter at the pin");
    }
    const market = adapter.markets.find(
      (m) => (adapter.supplyShares[m.id] ?? 0n) > 0n,
    )!;
    const deallocated = market
      .accrueInterest(vaultData.lastUpdate)
      .toSupplyAssets(adapter.supplyShares[market.id]!);
    const shares = await client.readContract({
      address: KEYROCK,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "a", type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const redeemShares = shares / 2n;
    const redeemAssets = vaultData.toAssets(redeemShares);
    const deallocations = [
      {
        adapter: adapter.address,
        marketParams: market.params,
        amount: deallocated < redeemAssets ? deallocated : redeemAssets,
      },
    ];
    const exit = vault.forceRedeem({
      deallocations,
      redeem: { shares: redeemShares },
      userAddress: client.account.address,
    });
    // forceRedeem emits no requirements — the multicall burns the caller's
    // shares inside the vault itself.
    const tx = exit.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations: [],
      limits: {
        operations: [
          {
            type: "vaultV2ForceRedeem",
            vault: KEYROCK,
            quote: { sharesBurned: redeemShares },
            // Total burned shares include the force-deallocation penalty.
            slippageTolerance: 10_000000000000000n,
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
    expect(result.verification.operations[0]!.operation).toBe(
      "vaultV2ForceRedeem",
    );
  }, 240_000);

  test("V2 in-kind redemption", async ({ client }) => {
    await depositV2Shares(client, parseUnits("10", 6));
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morphoClient.vaultV2(KEYROCK, mainnet.id);
    const vaultData = await vault.getData();
    const adapter = vaultData.accrualAdapters[0];
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Keyrock vault has no Blue market adapter at the pin");
    }
    const marketParamsList = adapter.markets
      .filter((m) => (adapter.supplyShares[m.id] ?? 0n) > 0n)
      .map((m) => m.params);
    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;
    const exit = vault.inKindRedeem({
      amount: parseUnits("5", 6),
      marketParamsList,
      vaultData,
      userAddress: client.account.address,
      deadline,
    });
    const auths = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements: await exit.getRequirements(),
    });
    const tx = exit.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations: auths,
      limits: {
        operations: [
          {
            type: "vaultV2InKindRedeem",
            vault: KEYROCK,
            quote: { sharesBurned: vaultData.toShares(parseUnits("5", 6)) },
            slippageTolerance: 10_000000000000000n,
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
    expect(result.verification.operations[0]!.operation).toBe(
      "vaultV2InKindRedeem",
    );
  }, 240_000);
});

describe.sequential("simulate pipeline — blue refinance", () => {
  const CbbtcUsdcBlueAlt = new MarketParams({
    collateralToken: CBBTC,
    loanToken: USDC,
    oracle: "0xc7BE7593FD5453Db5AdcC1d7103f2211d4F2e40D",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: 860_000_000_000_000_000n,
  });

  test("full-position refinance cbBTC/USDC → CbbtcUsdcBlueAlt", async ({
    client,
  }) => {
    const morphoClient = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const source = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const target = morphoClient.blue(CbbtcUsdcBlueAlt, mainnet.id);

    // Open a real borrow position on the source market.
    const collateralAssets = parseUnits("0.05", 8);
    const borrowAssets = parseUnits("5", 6);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });
    const open = source.supplyCollateralBorrow({
      userAddress: client.account.address,
      collateralAssets,
      borrowAssets,
      positionData: await source.getPositionData(client.account.address),
      deadline: maxUint256,
    });
    for (const r of await open.getRequirements()) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }
    const openTx = open.buildTx();
    await client.sendTransaction({
      account: client.account,
      to: openTx.to,
      data: openTx.data,
      value: openTx.value,
    });

    const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 3600n;
    const refinance = source.refinance({
      userAddress: client.account.address,
      positionData: await source.getPositionData(client.account.address),
      destination: {
        marketParams: CbbtcUsdcBlueAlt,
        positionData: await target.getPositionData(client.account.address),
      },
      deadline,
    });
    const authorizations = toSimulationAuthorizations({
      chainId: mainnet.id,
      mode: "preview",
      blockNumber: 25_832_676n,
      owner: client.account.address,
      requirements: await refinance.getRequirements(),
    });
    const tx = refinance.buildTx();
    const result = await simulate(client, {
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "blueRefinance",
            sourceMarketId: CbbtcUsdcBlue.id,
            targetMarketId: CbbtcUsdcBlueAlt.id,
            quote: {
              sharesBurned: (
                await source.getPositionData(client.account.address)
              ).borrowShares,
            },
            slippageTolerance: 10_000000000000000n,
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
    expect(result.verification.operations[0]!.operation).toBe("blueRefinance");
  }, 240_000);
});
