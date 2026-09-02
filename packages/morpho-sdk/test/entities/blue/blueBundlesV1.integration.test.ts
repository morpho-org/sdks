import {
  getChainAddresses,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  readContractRestructured,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  maxUint128,
  maxUint256,
  parseUnits,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import {
  isRequirementBlueAuthorization,
  morphoViemExtension,
} from "../../../src/index.js";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";
import { withChainTimestamp } from "../../helpers/time.js";
import {
  deployMorphoMarketV1AdapterV2,
  deployVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

const baseTargetMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const baseSourceMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const baseTest = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 50_438_617n, // BlueBundlesV1 deployment block.
  stepsTracing: false,
});

const getBlueBundlesBalances = async (
  client: AnvilTestClient,
  markets: readonly MarketParams[],
) => {
  const blueBundlesV1 = getChainAddress(
    client.chain.id,
    "bundles.blueBundlesV1",
  );
  const tokens = [
    ...new Set(
      markets.flatMap(({ loanToken, collateralToken }) => [
        loanToken,
        collateralToken,
      ]),
    ),
  ];

  return Promise.all([
    client.getBalance({ address: blueBundlesV1 }),
    ...tokens.map((erc20) => client.balanceOf({ erc20, owner: blueBundlesV1 })),
  ]);
};

describe("BlueBundlesV1 Blue writes", () => {
  test("supply: executes with ERC-2612 without retaining assets", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({ erc20: CbbtcUsdcBlue.loanToken, amount });

    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const beforePosition = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [
      CbbtcUsdcBlue,
    ]);
    const action = market.supply({
      userAddress: client.account.address,
      assets: amount,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements({
      useSimplePermit: true,
    });
    expect(
      requirements.map(({ action: requirement }) => requirement.type),
    ).toEqual(["permit"]);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.supplyShares).toBeGreaterThan(
      beforePosition.supplyShares,
    );
    expect(await getBlueBundlesBalances(client, [CbbtcUsdcBlue])).toEqual(
      beforeBalances,
    );
  });

  test("supply: executes with Permit2 SignatureTransfer without retaining assets", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({ erc20: CbbtcUsdcBlue.loanToken, amount });

    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const beforePosition = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [
      CbbtcUsdcBlue,
    ]);
    const action = market.supply({
      userAddress: client.account.address,
      assets: amount,
      deadline: maxUint256,
    });

    // No `useSimplePermit`: the default signature path selects Permit2
    // SignatureTransfer, which needs an explicit unused nonce. It emits a
    // one-time ERC-20 approval to canonical Permit2 plus the signed transfer
    // naming BlueBundlesV1 as spender — verifying the deployed contract
    // interprets the `kind: 2` permit payload.
    const requirements = await action.getRequirements({ permit2Nonce: 0n });
    expect(
      requirements.map(({ action: requirement }) => requirement.type),
    ).toEqual(["erc20Approval", "permit2TransferFrom"]);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.supplyShares).toBeGreaterThan(
      beforePosition.supplyShares,
    );
    expect(await getBlueBundlesBalances(client, [CbbtcUsdcBlue])).toEqual(
      beforeBalances,
    );
  });

  test("withdraw: executes with signed BlueBundles authorization", async ({
    client,
  }) => {
    const supplied = parseUnits("1000", 6);
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
      supplyAmount: supplied,
    });

    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [
      CbbtcUsdcBlue,
    ]);
    const action = market.withdraw({
      userAddress: client.account.address,
      positionData,
      assets: supplied / 2n,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements();
    expect(
      requirements.map(({ action: requirement }) => requirement.type),
    ).toEqual(["authorization"]);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.supplyShares).toBeLessThan(positionData.supplyShares);
    expect(
      await client.readContract({
        address: getChainAddress(mainnet.id, "morpho"),
        abi: blueAbi,
        functionName: "isAuthorized",
        args: [
          client.account.address,
          getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
        ],
      }),
    ).toBe(true);
    expect(await getBlueBundlesBalances(client, [CbbtcUsdcBlue])).toEqual(
      beforeBalances,
    );
  });

  test("withdraw: closes the full position by shares and returns proceeds", async ({
    client,
  }) => {
    const supplied = parseUnits("1000", 6);
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
      supplyAmount: supplied,
    });

    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [
      CbbtcUsdcBlue,
    ]);
    const userBalanceBefore = await client.balanceOf({
      erc20: CbbtcUsdcBlue.loanToken,
      owner: client.account.address,
    });
    // Full-close by shares: burns every supply share and verifies the deployed
    // contract's shares-to-assets conversion, full burn, and returned proceeds,
    // which the assets-mode fork case above cannot exercise.
    const action = market.withdraw({
      userAddress: client.account.address,
      positionData,
      shares: positionData.supplyShares,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements();
    expect(
      requirements.map(({ action: requirement }) => requirement.type),
    ).toEqual(["authorization"]);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.supplyShares).toBe(0n);
    expect(
      await client.balanceOf({
        erc20: CbbtcUsdcBlue.loanToken,
        owner: client.account.address,
      }),
    ).toBeGreaterThan(userBalanceBefore);
    expect(await getBlueBundlesBalances(client, [CbbtcUsdcBlue])).toEqual(
      beforeBalances,
    );
  });

  test("supplyCollateralBorrow: executes with explicit-nonce SignatureTransfer", async ({
    client,
  }) => {
    const collateralAssets = parseUnits("10", 18);
    const borrowAssets = parseUnits("1000", 18);
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      supplyAmount: borrowAssets * 2n,
    });
    await client.deal({
      erc20: WethUsdsBlue.collateralToken,
      amount: collateralAssets,
    });

    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [WethUsdsBlue]);
    const action = market.supplyCollateralBorrow({
      userAddress: client.account.address,
      positionData,
      collateralAssets,
      borrowAssets,
      deadline: maxUint256,
    });

    const permit2Nonce = 42n;
    const requirements = await action.getRequirements({ permit2Nonce });
    expect(
      requirements.map(({ action: requirement }) => requirement.type),
    ).toEqual(["erc20Approval", "permit2TransferFrom", "authorization"]);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    expect(signatures).toMatchObject([
      {
        action: { type: "permit2TransferFrom" },
        args: { nonce: permit2Nonce },
      },
      { action: { type: "authorization" } },
    ]);
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.collateral).toBe(collateralAssets);
    expect(afterPosition.borrowShares).toBeGreaterThan(0n);
    expect(await getBlueBundlesBalances(client, [WethUsdsBlue])).toEqual(
      beforeBalances,
    );
  });

  test("repayWithdrawCollateral: saturates a full close", async ({
    client,
  }) => {
    const collateralAssets = parseUnits("10", 18);
    const borrowAssets = parseUnits("1000", 18);
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      supplyAmount: borrowAssets * 2n,
    });
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount: collateralAssets,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      borrowAmount: borrowAssets,
    });

    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [WethUsdsBlue]);
    const chainTimestamp = await client.timestamp();
    const deadline = chainTimestamp + 60n * 60n;
    const action = withChainTimestamp(chainTimestamp, () =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        positionData,
        repayShares: maxUint256,
        collateralAssets: positionData.collateral,
        deadline,
      }),
    );

    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements: await withChainTimestamp(chainTimestamp, () =>
        action.getRequirements(),
      ),
      approvalFundingToken: WethUsdsBlue.loanToken,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.borrowShares).toBe(0n);
    expect(afterPosition.collateral).toBe(0n);
    expect(await getBlueBundlesBalances(client, [WethUsdsBlue])).toEqual(
      beforeBalances,
    );
  });

  test("repay: improves an unhealthy position without authorization", async ({
    client,
  }) => {
    const collateralAssets = parseUnits("10", 18);
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount: collateralAssets,
    });

    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(WethUsdsBlue, mainnet.id);
    const collateralizedPosition = await market.getPositionData(
      client.account.address,
    );
    assert(collateralizedPosition.maxBorrowAssets != null);
    assert(collateralizedPosition.market.price != null);
    const borrowAssets =
      (collateralizedPosition.maxBorrowAssets * 9_999n) / 10_000n;
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      supplyAmount: borrowAssets * 2n,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      borrowAmount: borrowAssets,
    });
    const unhealthyPrice = (collateralizedPosition.market.price * 95n) / 100n;
    // Install a constant-price oracle response so the forked position becomes deterministically unhealthy.
    await client.setCode({
      address: WethUsdsBlue.oracle,
      bytecode: `0x7f${unhealthyPrice.toString(16).padStart(64, "0")}60005260206000f3`,
    });

    const positionData = await market.getPositionData(client.account.address);
    expect(positionData.isHealthy).toBe(false);
    const healthFactorBefore = positionData.healthFactor;
    assert(healthFactorBefore != null);
    const beforeBalances = await getBlueBundlesBalances(client, [WethUsdsBlue]);
    const chainTimestamp = await client.timestamp();
    const deadline = chainTimestamp + 60n * 60n;
    const action = withChainTimestamp(chainTimestamp, () =>
      market.repay({
        userAddress: client.account.address,
        positionData,
        repayShares: maxUint256,
        deadline,
      }),
    );

    const requirements = await withChainTimestamp(chainTimestamp, () =>
      action.getRequirements(),
    );
    expect(requirements.some(isRequirementBlueAuthorization)).toBe(false);
    expect(action.buildTx().action.args.maxLtv).toBe(maxUint256);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
      approvalFundingToken: WethUsdsBlue.loanToken,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.borrowShares).toBe(0n);
    expect(afterPosition.collateral).toBe(positionData.collateral);
    expect(afterPosition.isHealthy).toBe(true);
    expect(afterPosition.healthFactor).toBeGreaterThan(healthFactorBefore);
    expect(await getBlueBundlesBalances(client, [WethUsdsBlue])).toEqual(
      beforeBalances,
    );
  });

  test("supplyCollateral: native-only collateral improves an unhealthy position", async ({
    client,
  }) => {
    const collateralAssets = parseUnits("10", 18);
    const nativeAmount = parseUnits("1", 18);
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount: collateralAssets,
    });
    await client.setBalance({
      address: client.account.address,
      value: parseUnits("10", 18),
    });

    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(WethUsdsBlue, mainnet.id);
    const collateralizedPosition = await market.getPositionData(
      client.account.address,
    );
    assert(collateralizedPosition.maxBorrowAssets != null);
    assert(collateralizedPosition.market.price != null);
    const borrowAssets =
      (collateralizedPosition.maxBorrowAssets * 9_999n) / 10_000n;
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      supplyAmount: borrowAssets * 2n,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      borrowAmount: borrowAssets,
    });
    const unhealthyPrice = (collateralizedPosition.market.price * 95n) / 100n;
    // Install a constant-price oracle response so the forked position becomes deterministically unhealthy.
    await client.setCode({
      address: WethUsdsBlue.oracle,
      bytecode: `0x7f${unhealthyPrice.toString(16).padStart(64, "0")}60005260206000f3`,
    });

    const beforePosition = await market.getPositionData(client.account.address);
    expect(beforePosition.isHealthy).toBe(false);
    const healthFactorBefore = beforePosition.healthFactor;
    assert(healthFactorBefore != null);
    const beforeBalances = await getBlueBundlesBalances(client, [WethUsdsBlue]);
    const action = market.supplyCollateral({
      userAddress: client.account.address,
      collateralAssets: nativeAmount,
      nativeAmount,
      deadline: maxUint256,
    });

    expect(await action.getRequirements()).toEqual([]);
    expect(action.buildTx().value).toBe(nativeAmount);
    expect(action.buildTx().action.args.maxLtv).toBe(maxUint256);
    await client.sendTransaction(action.buildTx());

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.collateral).toBe(
      beforePosition.collateral + nativeAmount,
    );
    expect(afterPosition.isHealthy).toBe(true);
    expect(afterPosition.healthFactor).toBeGreaterThan(healthFactorBefore);
    expect(await getBlueBundlesBalances(client, [WethUsdsBlue])).toEqual(
      beforeBalances,
    );
  });

  test("withdrawCollateral: executes through the combined entrypoint", async ({
    client,
  }) => {
    const suppliedCollateral = parseUnits("2", 18);
    const withdrawnCollateral = suppliedCollateral / 2n;
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount: suppliedCollateral,
    });

    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [WethUsdsBlue]);
    const action = market.withdrawCollateral({
      userAddress: client.account.address,
      positionData,
      collateralAssets: withdrawnCollateral,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements();
    expect(requirements.some(isRequirementBlueAuthorization)).toBe(true);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.collateral).toBe(
      positionData.collateral - withdrawnCollateral,
    );
    expect(await getBlueBundlesBalances(client, [WethUsdsBlue])).toEqual(
      beforeBalances,
    );
  });
});

describe("BlueBundlesV1 Vault V2 reallocations", () => {
  baseTest(
    "borrow: executes market and idle reallocations through live Base contracts",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { morpho, vaultV2BluePublicAllocator: allocator } =
        getChainAddresses(base.id);
      assert(allocator != null);
      const sourceDepositAssets = parseUnits("100", 6);
      const initialIdleAssets = parseUnits("20", 6);
      const penalty = MathLib.WAD / 100n;
      const borrowAssets = parseUnits("2", 6);

      for (const marketParams of [baseSourceMarket, baseTargetMarket]) {
        const marketState = await readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "market",
          args: [marketParams.id],
        });
        if (marketState.lastUpdate === 0n) {
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "createMarket",
            args: [marketParams],
          });
        }
      }

      const vault = await deployVaultV2(
        anvilClient,
        baseTargetMarket.loanToken,
      );
      await submitAndAcceptVaultV2Call(anvilClient, {
        vault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "setIsAllocator",
          args: [client.account.address, true],
        }),
      });
      const targetAdapter = await deployMorphoMarketV1AdapterV2(
        anvilClient,
        vault,
      );
      await submitAndAcceptVaultV2Call(anvilClient, {
        vault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "addAdapter",
          args: [targetAdapter],
        }),
      });

      const sharedCapId = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", targetAdapter],
      );
      const capIds = new Set([
        sharedCapId,
        ...[baseSourceMarket, baseTargetMarket].flatMap((marketParams) => [
          encodeAbiParameters(
            [{ type: "string" }, { type: "address" }],
            ["collateralToken", marketParams.collateralToken],
          ),
          encodeAbiParameters(
            [{ type: "string" }, { type: "address" }, marketParamsAbi],
            ["this/marketParams", targetAdapter, marketParams],
          ),
        ]),
      ]);
      for (const idData of capIds) {
        await submitAndAcceptVaultV2Call(anvilClient, {
          vault,
          data: encodeFunctionData({
            abi: vaultV2Abi,
            functionName: "increaseAbsoluteCap",
            args: [idData, maxUint128],
          }),
        });
        await submitAndAcceptVaultV2Call(anvilClient, {
          vault,
          data: encodeFunctionData({
            abi: vaultV2Abi,
            functionName: "increaseRelativeCap",
            args: [idData, MathLib.WAD],
          }),
        });
      }

      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [
          targetAdapter,
          encodeAbiParameters([marketParamsAbi], [baseSourceMarket]),
        ],
      });

      await submitAndAcceptVaultV2Call(anvilClient, {
        vault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "setIsAllocator",
          args: [allocator, true],
        }),
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setIsActiveAdapter",
        args: [vault, targetAdapter, true],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setAbsoluteCap",
        args: [vault, targetAdapter, baseTargetMarket, maxUint128],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromMarket",
        args: [vault, targetAdapter, baseSourceMarket, true],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromIdle",
        args: [vault, true],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setPenalty",
        args: [vault, penalty],
      });

      await client.deal({
        account: client.account.address,
        erc20: baseTargetMarket.loanToken,
        amount: sourceDepositAssets + initialIdleAssets,
      });
      await client.approve({
        address: baseTargetMarket.loanToken,
        args: [vault, sourceDepositAssets + initialIdleAssets],
      });
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "deposit",
        args: [sourceDepositAssets + initialIdleAssets, client.account.address],
      });
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "deallocate",
        args: [
          targetAdapter,
          encodeAbiParameters([marketParamsAbi], [baseSourceMarket]),
          initialIdleAssets,
        ],
      });
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [sharedCapId, (MathLib.WAD * 9n) / 10n],
      });
      await supplyCollateral({
        client: anvilClient,
        chainId: base.id,
        market: baseTargetMarket,
        collateralAmount: parseUnits("1", 18),
      });

      const market = client
        .extend(morphoViemExtension())
        .morpho.blue(baseTargetMarket, base.id);
      const block = await client.getBlock();
      const reallocationData = await market.getVaultV2BlueReallocationData({
        vaultAddresses: [vault],
        block,
      });
      const discovery = reallocationData.computeVaultV2BlueReallocations(
        baseTargetMarket.id,
        { timestamp: block.timestamp, maxPenalty: penalty },
      );
      expect(discovery.reallocations.length).toBeGreaterThan(0);
      expect(
        discovery.reallocations.some(({ from }) => from.type === "market"),
      ).toBe(true);
      expect(
        discovery.reallocations.some(({ from }) => from.type === "idle"),
      ).toBe(true);
      const totalPenaltyAssets = discovery.reallocations.reduce(
        (assets, reallocation) =>
          assets + MathLib.wMulUp(reallocation.assets, reallocation.penalty),
        0n,
      );
      expect(totalPenaltyAssets).toBeGreaterThan(0n);

      const positionData = await market.getPositionData(client.account.address);
      const [
        sourcePositionBefore,
        targetPositionBefore,
        vaultBalanceBefore,
        bundleBalancesBefore,
      ] = await Promise.all([
        readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "position",
          args: [baseSourceMarket.id, targetAdapter],
        }),
        readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "position",
          args: [baseTargetMarket.id, targetAdapter],
        }),
        client.balanceOf({
          erc20: baseTargetMarket.loanToken,
          owner: vault,
        }),
        getBlueBundlesBalances(anvilClient, [
          baseSourceMarket,
          baseTargetMarket,
        ]),
      ]);
      const action = market.borrow({
        userAddress: client.account.address,
        positionData,
        borrowAssets,
        reallocations: discovery.reallocations,
        deadline: maxUint256,
      });
      const signatures = await satisfyBlueBundlesV1Requirements(anvilClient, {
        requirements: await action.getRequirements(),
        approvalFundingToken: baseTargetMarket.loanToken,
      });
      await client.sendTransaction(action.buildTx(signatures));

      const [
        positionAfter,
        sourcePositionAfter,
        targetPositionAfter,
        vaultBalanceAfter,
      ] = await Promise.all([
        market.getPositionData(client.account.address),
        readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "position",
          args: [baseSourceMarket.id, targetAdapter],
        }),
        readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "position",
          args: [baseTargetMarket.id, targetAdapter],
        }),
        client.balanceOf({
          erc20: baseTargetMarket.loanToken,
          owner: vault,
        }),
      ]);
      expect(positionAfter.borrowShares).toBeGreaterThan(
        positionData.borrowShares,
      );
      expect(sourcePositionAfter.supplyShares).toBeLessThan(
        sourcePositionBefore.supplyShares,
      );
      expect(targetPositionAfter.supplyShares).toBeGreaterThan(
        targetPositionBefore.supplyShares,
      );
      expect(vaultBalanceAfter).toBeLessThan(vaultBalanceBefore);
      expect(
        await getBlueBundlesBalances(anvilClient, [
          baseSourceMarket,
          baseTargetMarket,
        ]),
      ).toEqual(bundleBalancesBefore);
    },
  );
});
