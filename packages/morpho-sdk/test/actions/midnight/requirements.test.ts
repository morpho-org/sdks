import { addressesRegistry } from "@morpho-org/blue-sdk";
import {
  Market,
  MarketParams,
  midnightAbi,
  setterRatifierAbi,
} from "@morpho-org/midnight-sdk";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, maxUint256, parseUnits, zeroAddress } from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
  getSetterRatifierRatifyRootRequirement,
  isRequirementApproval,
  morphoViemExtension,
} from "../../../src/index.js";
import { midnightForkAddresses } from "../../helpers/midnight.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 48_287_000n,
  stepsTracing: false,
});

const root =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const usdc = addressesRegistry[base.id].usdc;
const marketData = new Market({
  params: new MarketParams({
    chainId: base.id,
    midnight: midnightForkAddresses.midnight,
    loanToken: usdc,
    collateralParams: [
      {
        token: usdc,
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: midnightForkAddresses.oracle,
      },
    ],
    maturity: 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  }),
  totalUnits: 1_000_000n,
  lossFactor: 0n,
  withdrawable: 1_000_000n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});

describe("Midnight requirements on fork", () => {
  test("resolves ERC20 approvals from live token allowance state", async ({
    client,
  }) => {
    const amount = parseUnits("1", 6);
    const owner = client.account.address;
    const spender = midnightForkAddresses.midnightBundles;

    const requirements = await getMidnightApprovalRequirements({
      viemClient: client,
      chainId: base.id,
      token: usdc,
      owner,
      spender,
      amount,
    });

    expect(requirements).toHaveLength(1);
    const approval = requirements[0];
    if (!isRequirementApproval(approval)) {
      throw new Error("expected an ERC20 approval requirement");
    }
    expect(approval.action.args.spender).toBe(spender);
    expect(approval.action.args.amount).toBe(amount);

    await client.sendTransaction(approval);

    await expect(
      getMidnightApprovalRequirements({
        viemClient: client,
        chainId: base.id,
        token: usdc,
        owner,
        spender,
        amount,
      }),
    ).resolves.toEqual([]);
    await expect(
      client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      }),
    ).resolves.toBe(amount);
  });

  test("resolves Midnight authorization from fork contract state", async ({
    client,
  }) => {
    const owner = client.account.address;
    const authorized = midnightForkAddresses.midnightBundles;
    const requirement = await getMidnightAuthorizationRequirement({
      viemClient: client,
      chainId: base.id,
      owner,
      authorized,
    });

    expect(requirement?.action.type).toBe("midnightAuthorization");
    if (requirement == null) {
      throw new Error("expected a Midnight authorization requirement");
    }

    await client.sendTransaction(requirement);

    await expect(
      client.readContract({
        address: midnightForkAddresses.midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [owner, authorized],
      }),
    ).resolves.toBe(true);
    await expect(
      getMidnightAuthorizationRequirement({
        viemClient: client,
        chainId: base.id,
        owner,
        authorized,
      }),
    ).resolves.toBeNull();
  });

  test("resolves SetterRatifier root approval from fork contract state", async ({
    client,
  }) => {
    const maker = client.account.address;
    const requirement = await getSetterRatifierRatifyRootRequirement({
      viemClient: client,
      chainId: base.id,
      maker,
      root,
    });

    expect(requirement?.action.type).toBe("setterRatifierRatifyRoot");
    if (requirement == null) {
      throw new Error("expected a SetterRatifier root requirement");
    }

    await client.sendTransaction(requirement);

    await expect(
      client.readContract({
        address: midnightForkAddresses.setterRatifier,
        abi: setterRatifierAbi,
        functionName: "isRootRatified",
        args: [maker, root],
      }),
    ).resolves.toBe(true);
    await expect(
      getSetterRatifierRatifyRootRequirement({
        viemClient: client,
        chainId: base.id,
        maker,
        root,
      }),
    ).resolves.toBeNull();
  });

  test("resolves supply-collateral requirements through the Midnight entity", async ({
    client,
  }) => {
    const collateralAssets = parseUnits("1", 6);
    const reservedCollateralAssets = parseUnits("0.5", 6);
    const output = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateral({
        marketData,
        accountAddress: client.account.address,
        collateralAssets,
        reservedCollateralAssets,
      });

    const requirements = await output.getRequirements();
    expect(requirements).toHaveLength(1);
    const approval = requirements[0];
    if (!isRequirementApproval(approval)) {
      throw new Error("expected an ERC20 approval requirement");
    }
    expect(approval.action.args.spender).toBe(midnightForkAddresses.midnight);
    expect(approval.action.args.amount).toBe(
      collateralAssets + reservedCollateralAssets,
    );

    await client.sendTransaction(approval);
    await expect(output.getRequirements()).resolves.toEqual([]);
    expect(output.buildTx().to).toBe(midnightForkAddresses.midnight);
  });

  test("resolves take and repay bundle requirements through the Midnight entity", async ({
    client,
  }) => {
    const amount = parseUnits("1", 6);
    const morpho = client.extend(morphoViemExtension()).morpho;
    const midnight = morpho.midnight(base.id);

    const outputs = [
      midnight.takeLend({
        marketData,
        accountAddress: client.account.address,
        assets: amount,
        minUnits: 0n,
        takeableOffers: [],
        deadline: maxUint256,
      }),
      midnight.supplyCollateralTakeBorrow({
        marketData,
        accountAddress: client.account.address,
        collateralAssets: amount,
        loanAssets: amount,
        maxUnits: 0n,
        takeableOffers: [],
        deadline: maxUint256,
      }),
      midnight.repayWithdrawCollateral({
        marketData,
        accountAddress: client.account.address,
        repayAssets: amount,
        withdrawCollateralAssets: 0n,
        deadline: maxUint256,
      }),
    ];

    const requirementsByOutput = [];
    for (const output of outputs) {
      const requirements = await output.getRequirements();
      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["erc20Approval", "midnightAuthorization"]);
      requirementsByOutput.push({ output, requirements });
    }

    for (const { requirements } of requirementsByOutput) {
      for (const requirement of requirements) {
        if (!("to" in requirement)) {
          throw new Error("expected an onchain call requirement");
        }
        await client.sendTransaction(requirement);
      }
    }

    for (const { output } of requirementsByOutput) {
      await expect(output.getRequirements()).resolves.toEqual([]);
    }

    const borrow = midnight.takeBorrow({
      marketData,
      accountAddress: client.account.address,
      loanAssets: amount,
      maxUnits: 0n,
      takeableOffers: [],
      deadline: maxUint256,
    });

    await expect(borrow.getRequirements()).resolves.toEqual([]);
  });
});
