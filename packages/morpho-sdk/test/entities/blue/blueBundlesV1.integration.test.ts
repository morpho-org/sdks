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
  getAddress,
  isAddressEqual,
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

// Refinance source sharing both tokens (and LLTV/IRM) with `baseTargetMarket` but a distinct
// oracle, so the pair form two valid, migration-compatible markets. The oracle has no code at the
// fork block; the refinance test stubs it with the destination's live price via `setCode`.
const baseRefinanceSource = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0x1111111111111111111111111111111111111111",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const migrationSource = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});

const migrationDestination = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
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

  test("supply: carves the referral fee to the recipient", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    const referralFeePct = MathLib.WAD / 100n;
    const referralFeeRecipient = getAddress(
      "0x000000000000000000000000000000000000dEaD",
    );
    await client.deal({ erc20: CbbtcUsdcBlue.loanToken, amount });

    const market = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const beforePosition = await market.getPositionData(client.account.address);
    const beforeBalances = await getBlueBundlesBalances(client, [
      CbbtcUsdcBlue,
    ]);
    const recipientBefore = await client.balanceOf({
      erc20: CbbtcUsdcBlue.loanToken,
      owner: referralFeeRecipient,
    });
    // Positive referral fee: BlueBundlesV1 carves it out of the funded `assets`,
    // credits the recipient, and supplies the remainder — accounting that
    // calldata-only unit tests cannot verify against the deployed contract.
    const action = market.supply({
      userAddress: client.account.address,
      assets: amount,
      referralFeePct,
      referralFeeRecipient,
      deadline: maxUint256,
    });

    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements: await action.getRequirements({ useSimplePermit: true }),
    });
    await client.sendTransaction(action.buildTx(signatures));

    // BlueBundlesV1 carves `fee = mulDivDown(assets, pct, WAD)` from the funded
    // `assets` and pays it to the recipient in loan tokens. `1%` of `1000e6`
    // divides evenly, so the expected fee is exact regardless of the contract's
    // rounding direction — a wrong base (net, or `pct/(WAD-pct)`) would not match.
    const expectedFee = MathLib.mulDivDown(amount, referralFeePct, MathLib.WAD);
    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.supplyShares).toBeGreaterThan(
      beforePosition.supplyShares,
    );
    expect(
      (await client.balanceOf({
        erc20: CbbtcUsdcBlue.loanToken,
        owner: referralFeeRecipient,
      })) - recipientBefore,
    ).toBe(expectedFee);
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

  test("withdraw: carves the referral fee from proceeds to the recipient", async ({
    client,
  }) => {
    const supplied = parseUnits("1000", 6);
    const referralFeePct = MathLib.WAD / 100n;
    const referralFeeRecipient = getAddress(
      "0x000000000000000000000000000000000000dEaD",
    );
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
    const withdrawAssets = supplied / 2n;
    const recipientBefore = await client.balanceOf({
      erc20: CbbtcUsdcBlue.loanToken,
      owner: referralFeeRecipient,
    });
    const userBalanceBefore = await client.balanceOf({
      erc20: CbbtcUsdcBlue.loanToken,
      owner: client.account.address,
    });
    // Positive referral fee: BlueBundlesV1 deducts it from withdrawal proceeds
    // and credits the recipient — accounting distinct from the supply route.
    const action = market.withdraw({
      userAddress: client.account.address,
      positionData,
      assets: withdrawAssets,
      referralFeePct,
      referralFeeRecipient,
      deadline: maxUint256,
    });

    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements: await action.getRequirements(),
    });
    await client.sendTransaction(action.buildTx(signatures));

    // No reallocations ⇒ zero penalty, so BlueBundlesV1 withdraws exactly
    // `withdrawAssets`, pays `fee = mulDivDown(withdrawAssets, pct, WAD)` to the
    // recipient, and returns the remainder to the user. `1%` of `500e6` divides
    // evenly, so both deltas are exact regardless of the contract's rounding.
    const expectedFee = MathLib.mulDivDown(
      withdrawAssets,
      referralFeePct,
      MathLib.WAD,
    );
    const afterPosition = await market.getPositionData(client.account.address);
    expect(afterPosition.supplyShares).toBeLessThan(positionData.supplyShares);
    expect(
      (await client.balanceOf({
        erc20: CbbtcUsdcBlue.loanToken,
        owner: referralFeeRecipient,
      })) - recipientBefore,
    ).toBe(expectedFee);
    expect(
      (await client.balanceOf({
        erc20: CbbtcUsdcBlue.loanToken,
        owner: client.account.address,
      })) - userBalanceBefore,
    ).toBe(withdrawAssets - expectedFee);
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

  test("refinance: moves the full live position", async ({ client }) => {
    const collateralAssets = parseUnits("5", 18);
    const borrowAssets = parseUnits("1", 18);
    for (const market of [migrationSource, migrationDestination]) {
      await supplyLoan({
        client,
        chainId: mainnet.id,
        market,
        supplyAmount: borrowAssets * 4n,
      });
    }
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: migrationSource,
      collateralAmount: collateralAssets,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: migrationSource,
      borrowAmount: borrowAssets,
    });

    const morpho = client.extend(morphoViemExtension()).morpho;
    const source = morpho.blue(migrationSource, mainnet.id);
    const destination = morpho.blue(migrationDestination, mainnet.id);
    const positionData = await source.getPositionData(client.account.address);
    const destinationPositionData = await destination.getPositionData(
      client.account.address,
    );
    const beforeBalances = await getBlueBundlesBalances(client, [
      migrationSource,
      migrationDestination,
    ]);
    const action = source.refinance({
      userAddress: client.account.address,
      positionData,
      destination: {
        marketParams: migrationDestination,
        positionData: destinationPositionData,
      },
      deadline: maxUint256,
    });

    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements: await action.getRequirements(),
    });
    await client.sendTransaction(action.buildTx(signatures));

    const sourceAfter = await source.getPositionData(client.account.address);
    const destinationAfter = await destination.getPositionData(
      client.account.address,
    );
    expect(sourceAfter.borrowShares).toBe(0n);
    expect(sourceAfter.collateral).toBe(0n);
    expect(destinationAfter.borrowShares).toBeGreaterThan(0n);
    expect(destinationAfter.collateral).toBe(
      destinationPositionData.collateral + collateralAssets,
    );
    expect(
      await getBlueBundlesBalances(client, [
        migrationSource,
        migrationDestination,
      ]),
    ).toEqual(beforeBalances);
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

  test("withdraw: standalone authorization targets Morpho, then clears on re-query", async ({
    client,
  }) => {
    const supplied = parseUnits("1000", 6);
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
      supplyAmount: supplied,
    });

    const morpho = getChainAddress(mainnet.id, "morpho");
    const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
    // `supportSignature: false` forces the standalone (unsigned) authorization transaction rather
    // than a signable requirement.
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);
    const action = market.withdraw({
      userAddress: client.account.address,
      positionData,
      assets: supplied / 2n,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements();
    expect(requirements).toHaveLength(1);
    const authorizationRequirements = requirements.filter(
      isRequirementBlueAuthorization,
    );
    expect(authorizationRequirements).toHaveLength(1);
    const [authorizationRequirement] = authorizationRequirements;
    assert(authorizationRequirement != null);
    // The standalone requirement is a Morpho `setAuthorization` call naming BlueBundlesV1 operator.
    expect(isAddressEqual(authorizationRequirement.to, morpho)).toBe(true);
    expect(
      isAddressEqual(
        authorizationRequirement.action.args.authorized,
        blueBundlesV1,
      ),
    ).toBe(true);
    expect(authorizationRequirement.action.args.isAuthorized).toBe(true);

    // Submitting it authorizes BlueBundlesV1 on Morpho without any signature.
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    expect(signatures).toEqual([]);
    expect(
      await client.readContract({
        address: morpho,
        abi: blueAbi,
        functionName: "isAuthorized",
        args: [client.account.address, blueBundlesV1],
      }),
    ).toBe(true);

    // Re-querying re-reads `isAuthorized`, which now returns true, so no authorization remains.
    const requirementsAfter = await action.getRequirements();
    expect(requirementsAfter).toHaveLength(0);
    expect(requirementsAfter.some(isRequirementBlueAuthorization)).toBe(false);

    // The withdraw still executes against the on-chain authorization with no signature supplied.
    await client.sendTransaction(action.buildTx(signatures));
    const afterWithdrawPosition = await market.getPositionData(
      client.account.address,
    );
    expect(afterWithdrawPosition.supplyShares).toBeLessThan(
      positionData.supplyShares,
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

  baseTest(
    "withdraw: deducts market and idle reallocation penalties from proceeds",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { morpho, vaultV2BluePublicAllocator: allocator } =
        getChainAddresses(base.id);
      assert(allocator != null);
      const sourceDepositAssets = parseUnits("100", 6);
      const initialIdleAssets = parseUnits("20", 6);
      const penalty = MathLib.WAD / 100n;
      const userSupplyAssets = parseUnits("100", 6);
      const withdrawAssets = parseUnits("50", 6);

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
      // The withdrawer supplies loan assets directly so there is a live supply position to exit.
      await supplyLoan({
        client: anvilClient,
        chainId: base.id,
        market: baseTargetMarket,
        supplyAmount: userSupplyAssets,
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
      // The penalty must stay within the withdrawn assets or the entity/contract rejects the plan.
      expect(totalPenaltyAssets).toBeLessThan(withdrawAssets);

      const positionData = await market.getPositionData(client.account.address);
      const [
        sourcePositionBefore,
        targetPositionBefore,
        vaultBalanceBefore,
        userBalanceBefore,
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
        client.balanceOf({
          erc20: baseTargetMarket.loanToken,
          owner: client.account.address,
        }),
        getBlueBundlesBalances(anvilClient, [
          baseSourceMarket,
          baseTargetMarket,
        ]),
      ]);
      const action = market.withdraw({
        userAddress: client.account.address,
        positionData,
        assets: withdrawAssets,
        reallocations: discovery.reallocations,
        deadline: maxUint256,
      });
      const signatures = await satisfyBlueBundlesV1Requirements(anvilClient, {
        requirements: await action.getRequirements(),
      });
      const transaction = action.buildTx(signatures);
      // The mapped allocations and their aggregate penalty are recorded in the built action.
      expect(transaction.action.args.withdrawAssets).toBe(withdrawAssets);
      expect(transaction.action.args.reallocations).toBe(
        discovery.reallocations.length,
      );
      expect(transaction.action.args.reallocationPenaltyAssets).toBe(
        totalPenaltyAssets,
      );
      await client.sendTransaction(transaction);

      const [
        positionAfter,
        sourcePositionAfter,
        targetPositionAfter,
        vaultBalanceAfter,
        userBalanceAfter,
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
        client.balanceOf({
          erc20: baseTargetMarket.loanToken,
          owner: client.account.address,
        }),
      ]);
      expect(positionAfter.supplyShares).toBeLessThan(
        positionData.supplyShares,
      );
      // Proceeds paid to the user equal the withdrawn assets minus the mapped allocator penalties.
      expect(userBalanceAfter - userBalanceBefore).toBe(
        withdrawAssets - totalPenaltyAssets,
      );
      // The market source drains and the target (idle + market) fills, confirming both ran.
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

  baseTest(
    "refinance: a Vault V2 reallocation penalty and referral fee increase destination debt",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { morpho, vaultV2BluePublicAllocator: allocator } =
        getChainAddresses(base.id);
      assert(allocator != null);
      const depositAssets = parseUnits("100", 6);
      const destinationLiquidity = parseUnits("20", 6);
      const penalty = MathLib.WAD / 100n;
      const relativeCap = MathLib.WAD / 2n;
      const referralFeePct = MathLib.WAD / 100n;
      const sourceCollateral = parseUnits("1", 18);
      const sourceSupply = parseUnits("10", 6);
      const sourceBorrow = parseUnits("2", 6);

      for (const marketParams of [baseTargetMarket, baseRefinanceSource]) {
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

      const morphoExtension = client.extend(morphoViemExtension()).morpho;
      const destination = morphoExtension.blue(baseTargetMarket, base.id);
      const source = morphoExtension.blue(baseRefinanceSource, base.id);

      // The source shares tokens with the destination but has a code-less oracle at the fork block;
      // stub it with the destination's live price so the source borrow and its migration are healthy.
      const destinationPrice = (
        await destination.getPositionData(client.account.address)
      ).market.price;
      assert(destinationPrice != null);
      await client.setCode({
        address: baseRefinanceSource.oracle,
        bytecode: `0x7f${destinationPrice.toString(16).padStart(64, "0")}60005260206000f3`,
      });

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

      const targetIdData = [
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["this", targetAdapter],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["collateralToken", baseTargetMarket.collateralToken],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }, marketParamsAbi],
          ["this/marketParams", targetAdapter, baseTargetMarket],
        ),
      ] as const;
      for (const idData of targetIdData) {
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
            args: [idData, relativeCap],
          }),
        });
      }

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
        amount: depositAssets,
      });
      await client.approve({
        address: baseTargetMarket.loanToken,
        args: [vault, depositAssets],
      });
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "deposit",
        args: [depositAssets, client.account.address],
      });

      // Pre-fund destination borrow liquidity so the migration never depends on the reallocation size.
      await supplyLoan({
        client: anvilClient,
        chainId: base.id,
        market: baseTargetMarket,
        supplyAmount: destinationLiquidity,
      });
      // Establish the live source borrow position refinance migrates in full.
      await supplyLoan({
        client: anvilClient,
        chainId: base.id,
        market: baseRefinanceSource,
        supplyAmount: sourceSupply,
      });
      await supplyCollateral({
        client: anvilClient,
        chainId: base.id,
        market: baseRefinanceSource,
        collateralAmount: sourceCollateral,
      });
      await borrow({
        client: anvilClient,
        chainId: base.id,
        market: baseRefinanceSource,
        borrowAmount: sourceBorrow,
      });

      const sourcePositionData = await source.getPositionData(
        client.account.address,
      );
      const destinationPositionData = await destination.getPositionData(
        client.account.address,
      );
      const block = await client.getBlock();
      const reallocationData = await destination.getVaultV2BlueReallocationData(
        {
          vaultAddresses: [vault],
          block,
        },
      );
      const discovery = reallocationData.computeVaultV2BlueReallocations(
        baseTargetMarket.id,
        { timestamp: block.timestamp, maxPenalty: penalty },
      );
      const reallocation = discovery.reallocations.find(
        ({ from }) => from.type === "idle",
      );
      assert(reallocation != null);

      const [vaultBalanceBefore, bundleBalancesBefore] = await Promise.all([
        client.balanceOf({
          erc20: baseTargetMarket.loanToken,
          owner: vault,
        }),
        getBlueBundlesBalances(anvilClient, [
          baseRefinanceSource,
          baseTargetMarket,
        ]),
      ]);
      const action = source.refinance({
        userAddress: client.account.address,
        positionData: sourcePositionData,
        destination: {
          marketParams: baseTargetMarket,
          positionData: destinationPositionData,
        },
        reallocations: [reallocation],
        deadline: maxUint256,
        referralFeePct,
        referralFeeRecipient: client.account.address,
      });
      const signatures = await satisfyBlueBundlesV1Requirements(anvilClient, {
        requirements: await action.getRequirements(),
      });
      const transaction = action.buildTx(signatures);
      // The single reallocation and its positive penalty are recorded in the built action.
      expect(transaction.action.args.reallocations).toBe(1);
      expect(transaction.action.args.reallocationPenaltyAssets).toBeGreaterThan(
        0n,
      );
      expect(transaction.action.args.referralFeePct).toBe(referralFeePct);
      await client.sendTransaction(transaction);

      const [sourceAfter, destinationAfter, vaultBalanceAfter] =
        await Promise.all([
          source.getPositionData(client.account.address),
          destination.getPositionData(client.account.address),
          client.balanceOf({
            erc20: baseTargetMarket.loanToken,
            owner: vault,
          }),
        ]);
      // The source position is fully closed.
      expect(sourceAfter.borrowShares).toBe(0n);
      expect(sourceAfter.collateral).toBe(0n);
      // The destination receives the migrated debt and collateral.
      expect(destinationAfter.borrowShares).toBeGreaterThan(
        destinationPositionData.borrowShares,
      );
      expect(destinationAfter.collateral).toBe(
        destinationPositionData.collateral + sourcePositionData.collateral,
      );
      // The reallocation executed, draining vault idle liquidity into the destination.
      expect(vaultBalanceAfter).toBeLessThan(vaultBalanceBefore);
      // The reallocation penalty and referral fee both add to the migrated destination debt.
      const referralFeeAssets = MathLib.mulDivDown(
        sourcePositionData.borrowAssets,
        referralFeePct,
        MathLib.WAD - referralFeePct,
      );
      expect(destinationAfter.borrowAssets).toBeGreaterThanOrEqual(
        sourcePositionData.borrowAssets +
          transaction.action.args.reallocationPenaltyAssets +
          referralFeeAssets,
      );
      expect(
        await getBlueBundlesBalances(anvilClient, [
          baseRefinanceSource,
          baseTargetMarket,
        ]),
      ).toEqual(bundleBalancesBefore);
    },
  );
});
