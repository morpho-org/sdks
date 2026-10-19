import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import {
  computeVaultV2ForceWithdrawPlan,
  isPermit2SignatureTransferSignature,
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
  resolveVaultV2ForceWithdrawEligibility,
} from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  blueBundlesV1Abi,
  erc2612Abi,
  permit2Abi,
  vaultV2Abi,
} from "@morpho-org/morpho-sdk/abis";
import { Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createFaultProxy, expectFailClosed } from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeErrorResult,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  isHex,
  maxUint256,
  parseAbi,
  parseEventLogs,
  parseSignature,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { afterEach, expect, vi } from "vitest";
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
const RE7_USDT: Address = "0x1CE2354074C717a266aDADCD5e34104f233Da446";
const USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const STEAKHOUSE_MARKET_ID =
  "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8";
const RAY = 10n ** 27n;
const ERROR_STRING_ABI = parseAbi(["error Error(string)"]);

const CbbtcUsdcBlue = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

const executeApprovals = async (
  client: AnvilTestClient<typeof mainnet>,
  requirements: readonly unknown[],
) => {
  for (const requirement of requirements) {
    if (!isRequirementApproval(requirement)) continue;
    await client.sendTransaction({
      account: client.account,
      to: requirement.to,
      data: requirement.data,
      value: requirement.value,
    });
  }
};

const simulateFinalTransaction = (
  client: AnvilTestClient<typeof mainnet>,
  tx: { readonly to: Address; readonly data: Hex; readonly value: bigint },
) =>
  simulate(configFor(client), {
    chainId: mainnet.id,
    mode: "final",
    transactions: [
      {
        from: client.account.address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      },
    ],
  });

const sendRevertData = async (
  client: AnvilTestClient<typeof mainnet>,
  tx: { readonly to: Address; readonly data: Hex; readonly value: bigint },
): Promise<Hex | undefined> => {
  let rejected = false;
  let cause: unknown;
  try {
    await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  } catch (error) {
    rejected = true;
    cause = error;
  }
  if (!rejected) throw new Error("Expected the on-chain transaction to revert");

  let revertData: Hex | undefined;
  while (typeof cause === "object" && cause !== null) {
    if ("data" in cause && isHex(cause.data)) revertData = cause.data;
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return revertData;
};

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
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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
      owner: client.account.address,
      requirements,
    });
    const tx = action.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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

  test("sharePrice catches accrual drift a quoted pair alone misses", async ({
    client,
  }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const marketData = await morpho.getMarketData();

    const assets = parseUnits("10", 6);
    const action = morpho.supply({
      userAddress: client.account.address,
      assets,
      deadline: maxUint256,
    });
    const authorizations = toSimulationAuthorizations({
      owner: client.account.address,
      requirements: await action.getRequirements(),
    });
    await client.deal({ erc20: USDC, amount: assets });
    const tx = action.buildTx();

    // RAY-scaled assets per share accrued to the simulation block: the fork's
    // simulated block is the latest block's successor, one second later, so
    // the pre-warp residual over `expected` is only rounding.
    const expected =
      marketData
        .accrueInterest((await client.getBlock()).timestamp + 1n)
        .toSupplyAssets(10n ** 18n) *
      10n ** 9n;

    const params = (tolerance: bigint) => ({
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations,
      limits: {
        operations: [
          {
            type: "blueSupply" as const,
            marketId: CbbtcUsdcBlue.id,
            slippageTolerance: 10n ** 18n,
            quote: { assetsPaid: assets, sharesMinted: 1n },
            sharePrice: { expected, tolerance },
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

    // A 0.1% tolerance passes at the current rate (measured on the pinned
    // fork: supply APY ~4.2% at ~90% utilization, ~9.8% drift over a year) and
    // must reject after the warp, so the rejection comes from the rate
    // comparison, not rounding. `setNextBlockTimestamp` warps the fork clock;
    // `increaseTime` has no effect on this client.
    const sharePrice = { expected, tolerance: 10n ** 15n };
    const result = await simulate(
      configFor(client),
      params(sharePrice.tolerance),
    );
    expect(result.verification.operations[0]!.checkedLimits.sharePrice).toEqual(
      sharePrice,
    );

    await client.setNextBlockTimestamp({
      timestamp: result.verification.blockTimestamp + 365n * 24n * 60n * 60n,
    });
    await client.mine({ blocks: 1 });

    const denied = simulate(configFor(client), params(sharePrice.tolerance));
    await expect(denied).rejects.toThrow(ConsumerLimitViolationError);
    await expect(denied).rejects.toThrowError(/"sharePrice"/);
  }, 120_000);

  test("position bounds the subject's final Blue position", async ({
    client,
  }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const collateralAssets = parseUnits("0.05", 8);
    const borrowAssets = parseUnits("5", 6);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });

    const marketData = await morpho.getMarketData();
    const positionData = await morpho.getPositionData(client.account.address);
    const finalBorrowShares =
      positionData.borrowShares + marketData.toBorrowShares(borrowAssets, "Up");
    const finalCollateral = positionData.collateral + collateralAssets;

    const action = morpho.supplyCollateralBorrow({
      userAddress: client.account.address,
      collateralAssets,
      borrowAssets,
      positionData,
      deadline: maxUint256,
    });
    const authorizations = toSimulationAuthorizations({
      owner: client.account.address,
      requirements: await action.getRequirements(),
    });
    const tx = action.buildTx();

    const simulateParams = (position: {
      maxBorrowShares?: bigint;
      minCollateral?: bigint;
    }) => ({
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations,
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow" as const,
            marketId: CbbtcUsdcBlue.id,
            slippageTolerance: 10n ** 18n,
            quote: { assetsReceived: borrowAssets },
            position,
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

    // A debt cap below the resulting borrow shares fails.
    await expect(
      simulate(
        configFor(client),
        simulateParams({
          maxBorrowShares: finalBorrowShares / 2n,
        }),
      ),
    ).rejects.toThrow(ConsumerLimitViolationError);

    // Exact final values pass inclusively and echo the bounds.
    const result = await simulate(
      configFor(client),
      simulateParams({
        maxBorrowShares: finalBorrowShares,
        minCollateral: finalCollateral,
      }),
    );
    expect(result.verification.operations[0]!.checkedLimits.position).toEqual({
      maxBorrowShares: finalBorrowShares,
      minCollateral: finalCollateral,
    });
  }, 120_000);
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
      owner: client.account.address,
      requirements,
    });
    expect(authorizations.some((a) => a.type === "blueAuthorization")).toBe(
      true,
    );

    const tx = action.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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
    const repayResult = await simulate(configFor(client), {
      chainId: mainnet.id,
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
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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
      owner: client.account.address,
      requirements,
    }).map((a) => (a.type === "erc20Approval" ? { ...a, amount: 1n } : a));
    const tx = action.buildTx();
    await expect(
      simulate(configFor(client), {
        chainId: mainnet.id,
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
      simulate(configFor(client), {
        chainId: mainnet.id,
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
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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
    const depositResult = await simulate(configFor(client), {
      chainId: mainnet.id,
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
      owner: client.account.address,
      requirements: withdrawReqs,
    });
    const withdrawTx = withdraw.buildTx();
    const withdrawResult = await simulate(configFor(client), {
      chainId: mainnet.id,
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
    const redeemResult = await simulate(configFor(client), {
      chainId: mainnet.id,
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
    const config = { ...configFor(client), timeoutMs: 30_000 };
    const input = { chainId: mainnet.id, transactions };
    const unchecked = await simulate(config, input);
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
    const result = await simulate(config, {
      ...input,
      limits: { operations: [operation] },
    });
    expect(result.verification.operations[0]?.checkedLimits).toEqual({
      slippageTolerance: 0n,
      quote: { sharesMinted, assetsPaid: assets },
    });
    const tolerated = await simulate(config, {
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
        simulate(config, {
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

    const exitVaultData = await vault.getData();
    const eligibility = resolveVaultV2ForceWithdrawEligibility(exitVaultData);
    if (eligibility.type !== "eligible") {
      throw new Error(
        `Keyrock vault cannot be force-withdrawn: ${eligibility.type}`,
      );
    }
    const maxExitPlan = computeVaultV2ForceWithdrawPlan({
      vaultData: exitVaultData,
      adapter: eligibility.adapter,
      liquidityMarketId: eligibility.liquidityMarketId,
      exitAssets: maxUint256,
      timestamp: Time.timestamp(),
    });
    expect(maxExitPlan.maxExitAssets).toBeGreaterThan(
      maxExitPlan.assetsToWithdraw,
    );
    const exitAssets =
      maxExitPlan.assetsToWithdraw +
      (maxExitPlan.maxExitAssets - maxExitPlan.assetsToWithdraw) / 2n;
    // Exit beyond all penalty-free liquidity so VaultExitBundlesV1 force-deallocates.
    await client.deal({
      erc20: KEYROCK,
      amount: exitVaultData.toShares(exitAssets * 2n),
    });
    const exit = vault.forceWithdraw({
      exitAssets,
      vaultData: exitVaultData,
      userAddress: client.account.address,
    });
    const exitReqs = await exit.getRequirements();
    const exitAuths = toSimulationAuthorizations({
      owner: client.account.address,
      requirements: exitReqs,
    });
    const exitTx = exit.buildTx();
    for (const r of exitReqs) {
      if (!("to" in r)) continue;
      await client.sendTransaction({
        account: client.account,
        to: r.to,
        data: r.data,
        value: r.value,
      });
    }

    // Execute once on a throwaway snapshot to learn the realized penalty and
    // per-market deallocations, then restore the pre-exit state.
    const snapshot = await client.snapshot();
    const hash = await client.sendTransaction({
      account: client.account,
      to: exitTx.to,
      data: exitTx.data,
      value: exitTx.value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    await client.revert({ id: snapshot });

    const { blue: morpho } = getChainAddresses(mainnet.id);
    const forceEvents = parseEventLogs({
      abi: vaultV2Abi,
      eventName: "ForceDeallocate",
      logs: receipt.logs,
    }).filter(
      (event) =>
        isAddressEqual(event.address, KEYROCK) &&
        isAddressEqual(event.args.onBehalf, client.account.address),
    );
    const withdrawals = parseEventLogs({
      abi: blueAbi,
      eventName: "Withdraw",
      logs: receipt.logs,
    }).filter((event) => isAddressEqual(event.address, morpho));
    let penalty = 0n;
    const pairedWithdrawals = new Set<number>();
    const deallocations = new Map<MarketId, bigint>();
    for (const force of forceEvents) {
      penalty += force.args.penaltyAssets;
      for (let i = withdrawals.length - 1; i >= 0; i--) {
        const withdrawal = withdrawals[i]!;
        if (pairedWithdrawals.has(i)) continue;
        if (withdrawal.logIndex >= force.logIndex) continue;
        if (withdrawal.args.assets !== force.args.assets) continue;
        if (!isAddressEqual(withdrawal.args.onBehalf, force.args.adapter)) {
          continue;
        }
        pairedWithdrawals.add(i);
        const id = withdrawal.args.id as MarketId;
        deallocations.set(
          id,
          (deallocations.get(id) ?? 0n) + withdrawal.args.assets,
        );
        break;
      }
    }
    const forceAdapterWithdrawals = withdrawals.filter((withdrawal) =>
      forceEvents.some((force) =>
        isAddressEqual(withdrawal.args.onBehalf, force.args.adapter),
      ),
    );
    expect(forceAdapterWithdrawals.length).toBeGreaterThan(
      pairedWithdrawals.size,
    );
    const quotedDeallocations = [...deallocations].map(
      ([marketId, withdrawalAssets]) => ({
        marketId,
        assets: withdrawalAssets,
      }),
    );
    expect(quotedDeallocations.length).toBeGreaterThan(0);
    expect(penalty).toBeGreaterThan(0n);

    const simulateParams = (quote: {
      penalty: bigint;
      deallocations: { marketId: MarketId; assets: bigint }[];
    }) => ({
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations: exitAuths,
      limits: {
        operations: [
          {
            type: "vaultV2ForceWithdraw" as const,
            vault: KEYROCK,
            quote,
            slippageTolerance: 0n,
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
    const result = await simulate(
      configFor(client),
      simulateParams({ penalty, deallocations: quotedDeallocations }),
    );
    expect(result.verification.operations[0]!.operation).toBe(
      "vaultV2ForceWithdraw",
    );
    expect(result.verification.operations[0]!.checkedLimits.quote).toEqual({
      penalty,
      deallocations: quotedDeallocations,
    });
    // Quoting less deallocated than realized is adverse beyond tolerance.
    await expect(
      simulate(
        configFor(client),
        simulateParams({
          penalty,
          deallocations: quotedDeallocations.map((e, i) =>
            i === 0 ? { ...e, assets: e.assets / 2n } : e,
          ),
        }),
      ),
    ).rejects.toThrow(ConsumerLimitViolationError);
    await expect(
      simulate(
        configFor(client),
        simulateParams({
          penalty: penalty - 1n,
          deallocations: quotedDeallocations,
        }),
      ),
    ).rejects.toThrow(ConsumerLimitViolationError);
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
      owner: client.account.address,
      requirements: await migration.getRequirements(),
    });
    const tx = migration.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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

  test("V2 force exit verifies penalty and per-market deallocations", async ({
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
    // The vault has no usable liquidity-adapter leg at the pin (any exit above
    // the idle balance reverts), so the redeem stays inside idle assets and
    // the forced deallocation is the only adapter withdrawal.
    const redeemShares = shares / 2n;
    const redeemAssets = vaultData.toAssets(redeemShares);
    const deallocated = market
      .accrueInterest(vaultData.lastUpdate)
      .toSupplyAssets(adapter.supplyShares[market.id]!);
    const exit = vault.forceRedeem({
      deallocations: [
        {
          adapter: adapter.address,
          marketParams: market.params,
          amount: deallocated < redeemAssets ? deallocated : redeemAssets,
        },
      ],
      redeem: { shares: redeemShares },
      userAddress: client.account.address,
    });
    const tx = exit.buildTx();

    // Execute once on a throwaway snapshot to learn the realized penalty and
    // per-market deallocations, then restore the pre-exit state.
    const snapshot = await client.snapshot();
    const hash = await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    await client.revert({ id: snapshot });

    // The expected quote is derived independently of the code under test:
    // the penalty sums `penaltyAssets` over the vault's ForceDeallocate
    // events, and each deallocation is the Blue `Withdraw` emitted for the
    // force-deallocating adapter, summed by market `id`.
    const { blue: morpho } = getChainAddresses(mainnet.id);
    let penalty = 0n;
    const forceAdapters: Address[] = [];
    for (const event of parseEventLogs({
      abi: vaultV2Abi,
      eventName: "ForceDeallocate",
      logs: receipt.logs,
    })) {
      if (!isAddressEqual(event.address, KEYROCK)) continue;
      penalty += event.args.penaltyAssets;
      forceAdapters.push(event.args.adapter);
    }
    const deallocations = new Map<MarketId, bigint>();
    for (const event of parseEventLogs({
      abi: blueAbi,
      eventName: "Withdraw",
      logs: receipt.logs,
    })) {
      if (!isAddressEqual(event.address, morpho)) continue;
      if (!forceAdapters.some((a) => isAddressEqual(a, event.args.onBehalf))) {
        continue;
      }
      const id = event.args.id as MarketId;
      deallocations.set(id, (deallocations.get(id) ?? 0n) + event.args.assets);
    }
    const quotedDeallocations = [...deallocations].map(
      ([marketId, assets]) => ({ marketId, assets }),
    );
    expect(quotedDeallocations.length).toBeGreaterThan(0);

    const simulateParams = (quote: {
      penalty: bigint;
      deallocations: { marketId: MarketId; assets: bigint }[];
    }) => ({
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations: [],
      limits: {
        operations: [
          {
            type: "vaultV2ForceRedeem" as const,
            vault: KEYROCK,
            quote,
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
    const result = await simulate(
      configFor(client),
      simulateParams({ penalty, deallocations: quotedDeallocations }),
    );
    expect(result.verification.operations[0]!.checkedLimits.quote).toEqual({
      penalty,
      deallocations: quotedDeallocations,
    });

    // Quoting less deallocated than realized is adverse beyond tolerance.
    await expect(
      simulate(
        configFor(client),
        simulateParams({
          penalty,
          deallocations: quotedDeallocations.map((entry, i) =>
            i === 0 ? { ...entry, assets: entry.assets / 2n } : entry,
          ),
        }),
      ),
    ).rejects.toThrow(ConsumerLimitViolationError);
    expect(penalty).toBeGreaterThan(0n);
    // Quoting a penalty below the realized charge violates as well.
    await expect(
      simulate(
        configFor(client),
        simulateParams({
          penalty: penalty - 1n,
          deallocations: quotedDeallocations,
        }),
      ),
    ).rejects.toThrow(ConsumerLimitViolationError);
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
      owner: client.account.address,
      requirements: await exit.getRequirements(),
    });
    const tx = exit.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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

  test("V2 in-kind redemption verifies delivered positions", async ({
    client,
  }) => {
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
    // Exit more than the vault's idle assets so the contract delivers in-kind
    // Blue positions; vault shares are dealt directly to keep the idle balance
    // unchanged.
    const amount = vaultData.assetBalance + parseUnits("5", 6);
    await client.deal({
      erc20: KEYROCK,
      amount: vaultData.toShares(amount * 2n),
    });
    const deadline =
      BigInt(Math.floor(Date.now() / 1_000)) + 60n * 24n * 60n * 60n;
    const exit = vault.inKindRedeem({
      amount,
      marketParamsList,
      vaultData,
      userAddress: client.account.address,
      deadline,
    });
    const requirements = await exit.getRequirements();
    const auths = toSimulationAuthorizations({
      owner: client.account.address,
      requirements,
    });
    const tx = exit.buildTx();

    const morpho = getChainAddresses(mainnet.id).blue;
    const positionSupplyShares = () =>
      Promise.all(
        marketParamsList.map(async (market) => {
          const [supplyShares] = await client.readContract({
            address: morpho,
            abi: blueAbi,
            functionName: "position",
            args: [market.id, client.account.address],
          });
          return supplyShares;
        }),
      );

    // Measure the delivered supply shares on a throwaway execution, then
    // restore the pre-exit state for the simulated checks.
    const snapshot = await client.snapshot();
    const before = await positionSupplyShares();
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
    const after = await positionSupplyShares();
    await client.revert({ id: snapshot });

    const positions = marketParamsList
      .map((market, i) => ({
        marketId: market.id,
        supplyShares: after[i]! - before[i]!,
      }))
      .filter((position) => position.supplyShares > 0n);
    expect(positions.length).toBeGreaterThan(0);

    // Accrue Blue markets so execution delivers fewer shares than the quote.
    await client.setNextBlockTimestamp({
      timestamp: (await client.timestamp()) + 30n * 24n * 60n * 60n,
    });
    await client.mine({ blocks: 1 });

    const simulateParams = (
      quote: { positions: { marketId: MarketId; supplyShares: bigint }[] },
      tolerance: bigint,
    ) => ({
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations: auths,
      limits: {
        operations: [
          {
            type: "vaultV2InKindRedeem" as const,
            vault: KEYROCK,
            quote,
            slippageTolerance: tolerance,
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
    await expect(
      simulate(configFor(client), simulateParams({ positions }, 0n)),
    ).rejects.toThrow(ConsumerLimitViolationError);

    const slippageTolerance = parseUnits("0.01", 18);
    const result = await simulate(
      configFor(client),
      simulateParams({ positions }, slippageTolerance),
    );
    expect(result.verification.operations[0]!.operation).toBe(
      "vaultV2InKindRedeem",
    );
    expect(
      result.verification.operations[0]!.checkedLimits.quote.positions,
    ).toEqual(positions);
    expect(
      result.verification.operations[0]!.checkedLimits.slippageTolerance,
    ).toBe(slippageTolerance);
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
      owner: client.account.address,
      requirements: await refinance.getRequirements(),
    });
    const tx = refinance.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
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

describe.sequential("chaos: S11 invalid authorization", () => {
  const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
  const addresses = getChainAddresses(mainnet.id)!;
  const MORPHO = addresses.blue;
  const PERMIT2 = addresses.permit2!;
  const assets = parseUnits("10", 6);
  const splitSignature = (signature: Hex) => {
    const { r, s, v, yParity } = parseSignature(signature);
    return { r, s, v: Number(v ?? BigInt(yParity + 27)) };
  };
  const nextHour = () => BigInt(Math.floor(Date.now() / 1_000)) + 3_600n;

  /** Signs a vault V1 deposit permit (ERC-2612 or Permit2) and returns the deposit and its signature. */
  const signDeposit = async (
    client: AnvilTestClient<typeof mainnet>,
    {
      options,
      deadline = nextHour(),
      amount = assets,
    }: {
      options: { useSimplePermit: true } | { permit2Nonce: bigint };
      deadline?: bigint;
      amount?: bigint;
    },
  ) => {
    const vault = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const deposit = vault.deposit({
      amount,
      userAddress: client.account.address,
      vaultData: await vault.getData(),
      slippageTolerance: 0n,
      deadline,
    });
    const requirements = await deposit.getRequirements(options);
    for (const requirement of requirements.filter(isRequirementApproval)) {
      await client.sendTransaction(requirement);
    }
    const signature = await requirements
      .find(isRequirementSignature)!
      .sign(client, client.account.address);
    return { deposit, signature };
  };

  /**
   * Simulates `tx` through a fault-free proxy and returns the rejection. The proxy log proves
   * the failure stopped at simulation: nothing was broadcast.
   */
  const simulateFailClosed = async (
    client: AnvilTestClient<typeof mainnet>,
    {
      tx,
      category,
    }: {
      tx: { to: Address; data: Hex; value: bigint };
      category: "auth" | "revert";
    },
  ) => {
    const proxy = await createFaultProxy({ upstream: client.transport.url! });
    try {
      let result: unknown;
      const error = await expectFailClosed(
        simulate(
          { chains: new Map([[mainnet.id, { simulateV1Url: proxy.url }]]) },
          {
            chainId: mainnet.id,
            transactions: [
              {
                from: client.account.address,
                to: tx.to,
                data: tx.data,
                value: tx.value,
              },
            ],
          },
        ).then((value) => {
          result = value;
          return value;
        }),
        category,
      );
      expect(result).toBeUndefined();
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(proxy.log.map(({ method }) => method)).toContain("eth_simulateV1");
      expect(
        proxy.log.filter(({ method }) =>
          ["eth_sendRawTransaction", "eth_sendTransaction"].includes(method),
        ),
      ).toEqual([]);
      return error as SimulationRevertedError;
    } finally {
      await proxy.kill();
    }
  };

  test("[S11c] permit deadline elapsed between signing and simulation: DeadlinePassed()", async ({
    client,
  }) => {
    await client.deal({ erc20: USDC, amount: assets });
    const deadline = nextHour();
    const { deposit, signature } = await signDeposit(client, {
      options: { useSimplePermit: true },
      deadline,
    });
    await client.setNextBlockTimestamp({ timestamp: deadline + 60n });
    await client.mine({ blocks: 1 });

    const error = await simulateFailClosed(client, {
      tx: deposit.buildTx([signature]),
      category: "auth",
    });
    expect(error.message).toContain("DeadlinePassed()");
  });

  test("[S11d] Permit2 nonce consumed after signing: InvalidNonce()", async ({
    client,
  }) => {
    await client.deal({ erc20: USDC, amount: assets });
    const { deposit, signature } = await signDeposit(client, {
      options: { permit2Nonce: 0n },
    });
    await client.writeContract({
      address: PERMIT2,
      abi: permit2Abi,
      functionName: "invalidateUnorderedNonces",
      args: [0n, 1n],
    });

    const error = await simulateFailClosed(client, {
      tx: deposit.buildTx([signature]),
      category: "auth",
    });
    expect(error.message).toContain("InvalidNonce()");
  });

  test("[S11a] Permit2 signature recovering to another signer: Permit2 rejects the signer", async ({
    client,
  }) => {
    await client.deal({ erc20: USDC, amount: assets });
    const { deposit, signature } = await signDeposit(client, {
      options: { permit2Nonce: 0n },
    });
    const args = signature.args as { signature: Hex };
    const { r, s, v } = splitSignature(args.signature);
    // A different `s` still yields a valid point, recovering to an unrelated address.
    const forged: Hex = `${r}${(BigInt(s) - 1n).toString(16).padStart(64, "0")}${v.toString(16)}`;

    const error = await simulateFailClosed(client, {
      tx: deposit.buildTx([
        { ...signature, args: { ...signature.args, signature: forged } },
      ] as (typeof signature)[]),
      category: "auth",
    });
    expect(error.message).toMatch(/Invalid(Signer|Signature)\(/);
  });

  test("[S11d] stale ERC-2612 nonce: the bundle skips the permit and the transfer reverts", async ({
    client,
  }) => {
    await client.deal({ erc20: USDC, amount: assets });
    const deadline = nextHour();
    const { deposit, signature } = await signDeposit(client, {
      options: { useSimplePermit: true },
      deadline,
    });
    // A second permit for the same nonce lands first, so the signed one is stale.
    const bump = await signDeposit(client, {
      options: { useSimplePermit: true },
      deadline,
      amount: 1n,
    });
    const { r, s, v } = splitSignature(
      (bump.signature.args as { signature: Hex }).signature,
    );
    const tx = deposit.buildTx([signature]);
    await client.writeContract({
      address: USDC,
      abi: erc2612Abi,
      functionName: "permit",
      args: [client.account.address, tx.to, 1n, deadline, v, r, s],
    });

    const error = await simulateFailClosed(client, {
      tx,
      category: "revert",
    });
    expect(error.message).toMatch(/transfer amount exceeds allowance/);
  });

  test("[S11d] replayed Morpho authorization signature: the borrow reverts unauthorized", async ({
    client,
  }) => {
    const collateralAssets = parseUnits("0.05", 8);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });
    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const action = market.supplyCollateralBorrow({
      userAddress: client.account.address,
      collateralAssets,
      borrowAssets: parseUnits("5", 6),
      positionData: await market.getPositionData(client.account.address),
      deadline: nextHour(),
    });
    const requirements = await action.getRequirements({ permit2Nonce: 0n });
    for (const requirement of requirements.filter(isRequirementApproval)) {
      await client.sendTransaction(requirement);
    }
    const signatures = [];
    for (const requirement of requirements.filter(isRequirementSignature)) {
      signatures.push(await requirement.sign(client, client.account.address));
    }
    const authorization = signatures
      .map(({ args }) => args)
      .find((args) => "authorized" in args)!;
    // The signature lands once on-chain, then the operator is revoked: the bundle replays it.
    await client.writeContract({
      address: MORPHO,
      abi: blueAbi,
      functionName: "setAuthorizationWithSig",
      args: [
        {
          authorizer: authorization.owner,
          authorized: authorization.authorized,
          isAuthorized: authorization.isAuthorized,
          nonce: authorization.nonce,
          deadline: authorization.deadline,
        },
        splitSignature(authorization.signature),
      ],
    });
    await client.writeContract({
      address: MORPHO,
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [authorization.authorized, false],
    });

    const error = await simulateFailClosed(client, {
      tx: action.buildTx(signatures),
      category: "revert",
    });
    expect(error.message).toMatch(/unauthorized/);
  });
});

describe.sequential("chaos: S12 slippage drift between construction and execution", () => {
  const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
  const addresses = getChainAddresses(mainnet.id)!;
  const BLUE = addresses.blue;
  afterEach(() => {
    vi.useRealTimers();
  });

  test("[INV-02] reverts SLIPPAGE_EXCEEDED when the share price jumps past maxSharePrice", async ({
    client,
  }) => {
    const { timestamp } = await client.getBlock();
    vi.setSystemTime(Number(timestamp) * 1_000);
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const vaultData = await vault.getData();
    const allocation = [...vaultData.allocations.values()].find(
      ({ marketId }) => String(marketId) === STEAKHOUSE_MARKET_ID,
    );
    if (!allocation) throw new Error("Steakhouse market allocation not found");

    const assets = parseUnits("1000", 6);
    const supplyAmount = parseUnits("10000000", 6);
    await client.deal({ erc20: USDC, amount: assets + supplyAmount });
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      deadline: timestamp + 3_600n,
    });
    await executeApprovals(client, await deposit.getRequirements());
    const tx = deposit.buildTx();

    await client.approve({ address: USDC, args: [BLUE, supplyAmount] });
    await client.writeContract({
      address: BLUE,
      abi: blueAbi,
      functionName: "supply",
      args: [
        allocation.position.market.params,
        supplyAmount,
        0n,
        STEAKHOUSE,
        "0x",
      ],
    });

    const updatedVaultData = await vault.getData();
    const postDonationShares = updatedVaultData.toShares(assets, "Down");
    expect(postDonationShares).toBeGreaterThan(0n);
    const postDonationSharePrice =
      (assets * RAY + postDonationShares - 1n) / postDonationShares;
    expect(postDonationSharePrice).toBeGreaterThan(
      tx.action.args.maxSharePrice,
    );

    const userAssetsBefore = await client.balanceOf({ erc20: USDC });
    const userSharesBefore = await client.balanceOf({ erc20: STEAKHOUSE });
    const err = await expectFailClosed(
      simulateFinalTransaction(client, tx),
      "revert",
    );
    expect(err).toBeInstanceOf(SimulationRevertedError);
    expect(err).toMatchObject({ revertData: "0x8199f5f3" });
    expect(await sendRevertData(client, tx)).toContain("0x8199f5f3");
    expect(await client.balanceOf({ erc20: USDC })).toBe(userAssetsBefore);
    expect(await client.balanceOf({ erc20: STEAKHOUSE })).toBe(
      userSharesBefore,
    );
  }, 60_000);

  test("[INV-02] succeeds when share-price drift stays within tolerance", async ({
    client,
  }) => {
    const { timestamp } = await client.getBlock();
    vi.setSystemTime(Number(timestamp) * 1_000);
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const vaultData = await vault.getData();
    const allocation = [...vaultData.allocations.values()].find(
      ({ marketId }) => String(marketId) === STEAKHOUSE_MARKET_ID,
    );
    if (!allocation) throw new Error("Steakhouse market allocation not found");

    const assets = parseUnits("1000", 6);
    const supplyAmount = parseUnits("1", 6);
    await client.deal({ erc20: USDC, amount: assets + supplyAmount });
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      deadline: timestamp + 3_600n,
    });
    await executeApprovals(client, await deposit.getRequirements());
    const tx = deposit.buildTx();

    await client.approve({ address: USDC, args: [BLUE, supplyAmount] });
    await client.writeContract({
      address: BLUE,
      abi: blueAbi,
      functionName: "supply",
      args: [
        allocation.position.market.params,
        supplyAmount,
        0n,
        STEAKHOUSE,
        "0x",
      ],
    });
    const updatedVaultData = await vault.getData();
    expect(updatedVaultData.totalAssets).toBeGreaterThan(vaultData.totalAssets);

    await simulateFinalTransaction(client, tx);
    const hash = await client.sendTransaction({
      account: client.account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const mintedShares = await client.balanceOf({ erc20: STEAKHOUSE });
    const realizedSharePrice =
      (assets * RAY + mintedShares - 1n) / mintedShares;
    expect(realizedSharePrice).toBeLessThanOrEqual(
      tx.action.args.maxSharePrice,
    );
  }, 60_000);
});

describe.sequential("chaos: S13 balance / allowance drift between construction and execution", () => {
  const addresses = getChainAddresses(mainnet.id)!;
  const BLUE = addresses.blue;
  const PERMIT2 = addresses.permit2!;
  const nextHour = () => BigInt(Math.floor(Date.now() / 1_000)) + 3_600n;

  test("allowance revoked after requirements are satisfied", async ({
    client,
  }) => {
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const market = morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const action = market.supply({
      userAddress: client.account.address,
      assets,
      deadline: nextHour(),
    });
    const requirements = await action.getRequirements();
    const approval = requirements.find(isRequirementApproval);
    expect(approval).toBeDefined();
    if (!approval) throw new Error("USDC approval requirement not found");
    await executeApprovals(client, requirements);
    expect(await action.getRequirements()).toEqual([]);
    const tx = action.buildTx();

    const spender = approval.action.args.spender;
    await client.approve({ address: USDC, args: [spender, 0n] });
    const err = await expectFailClosed(
      simulateFinalTransaction(client, tx),
      "revert",
    );
    expect(err).toBeInstanceOf(SimulationRevertedError);
    expect((err as SimulationRevertedError).message).toMatch(
      /ERC20InsufficientAllowance|transfer amount exceeds allowance/,
    );
    const userAssetsBefore = await client.balanceOf({ erc20: USDC });
    const blueAssetsBefore = await client.balanceOf({
      erc20: USDC,
      owner: BLUE,
    });
    expect(await sendRevertData(client, tx)).toBe(
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["ERC20: transfer amount exceeds allowance"],
      }),
    );
    expect(await client.balanceOf({ erc20: USDC })).toBe(userAssetsBefore);
    expect(await client.balanceOf({ erc20: USDC, owner: BLUE })).toBe(
      blueAssetsBefore,
    );

    const refreshed = await action.getRequirements();
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]).toMatchObject({
      to: USDC,
      action: {
        type: "erc20Approval",
        args: { spender, amount: assets },
      },
    });
  }, 60_000);

  test("balance transferred away after requirements are satisfied", async ({
    client,
  }) => {
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const market = morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const action = market.supply({
      userAddress: client.account.address,
      assets,
      deadline: nextHour(),
    });
    const requirements = await action.getRequirements();
    await executeApprovals(client, requirements);
    expect(await action.getRequirements()).toEqual([]);
    const tx = action.buildTx();

    await client.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: ["0x000000000000000000000000000000000000dEaD", assets],
    });
    const err = await expectFailClosed(
      simulateFinalTransaction(client, tx),
      "revert",
    );
    expect(err).toBeInstanceOf(SimulationRevertedError);
    expect((err as SimulationRevertedError).message).toMatch(
      /ERC20InsufficientBalance|transfer amount exceeds balance/,
    );
    const userAssetsBefore = await client.balanceOf({ erc20: USDC });
    const blueAssetsBefore = await client.balanceOf({
      erc20: USDC,
      owner: BLUE,
    });
    expect(await sendRevertData(client, tx)).toBe(
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["ERC20: transfer amount exceeds balance"],
      }),
    );
    expect(await client.balanceOf({ erc20: USDC })).toBe(userAssetsBefore);
    expect(await client.balanceOf({ erc20: USDC, owner: BLUE })).toBe(
      blueAssetsBefore,
    );
    expect(await action.getRequirements()).toEqual([]);
  }, 60_000);

  test("Permit2 allowance revoked after signature is built", async ({
    client,
  }) => {
    const assets = parseUnits("1000", 6);
    await client.deal({ erc20: USDT, amount: assets });
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: true }),
    ).morpho;
    const vault = morpho.vaultV2(RE7_USDT, mainnet.id);
    const vaultData = await vault.getData();
    const action = vault.deposit({
      userAddress: client.account.address,
      amount: assets,
      vaultData,
      deadline: nextHour(),
    });
    const requirements = await action.getRequirements({
      permit2Nonce: 0n,
    });
    const approval = requirements.find(isRequirementApproval);
    expect(approval).toBeDefined();
    if (!approval) throw new Error("Permit2 approval requirement not found");
    expect(approval.action.args.spender).toBe(PERMIT2);
    await executeApprovals(client, requirements);

    const signatureRequirement = (
      await action.getRequirements({ permit2Nonce: 0n })
    ).find(isRequirementSignature);
    expect(signatureRequirement).toBeDefined();
    if (!signatureRequirement)
      throw new Error("Permit2 signature requirement not found");
    const signature = await signatureRequirement.sign(
      client,
      client.account.address,
    );
    expect(isPermit2SignatureTransferSignature(signature)).toBe(true);
    const tx = action.buildTx([signature]);

    await client.approve({ address: USDT, args: [PERMIT2, 0n] });
    const err = await expectFailClosed(
      simulateFinalTransaction(client, tx),
      "revert",
    );
    expect(err).toBeInstanceOf(SimulationRevertedError);
    expect((err as SimulationRevertedError).message).toContain(
      "TRANSFER_FROM_FAILED",
    );
    const userAssetsBefore = await client.balanceOf({ erc20: USDT });
    const userSharesBefore = await client.balanceOf({ erc20: RE7_USDT });
    expect(await sendRevertData(client, tx)).toBe(
      encodeErrorResult({
        abi: ERROR_STRING_ABI,
        errorName: "Error",
        args: ["TRANSFER_FROM_FAILED"],
      }),
    );
    expect(await client.balanceOf({ erc20: USDT })).toBe(userAssetsBefore);
    expect(await client.balanceOf({ erc20: RE7_USDT })).toBe(userSharesBefore);

    const refreshed = await action.getRequirements({
      permit2Nonce: 0n,
    });
    const restoredApproval = refreshed.find(isRequirementApproval);
    expect(restoredApproval).toBeDefined();
    expect(restoredApproval).toMatchObject({
      to: USDT,
      action: {
        type: "erc20Approval",
        args: { spender: PERMIT2, amount: maxUint256 },
      },
    });
  }, 60_000);
});
