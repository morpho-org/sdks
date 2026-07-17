import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
  getSetterRatifierRatifyRootRequirement,
  isRequirementApproval,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 48_287_000n,
  hardfork: "Osaka",
  stepsTracing: false,
});

const root =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const marketData = new Market({
  params: new MarketParams({
    chainId: base.id,
    midnight,
    loanToken: usdc,
    collateralParams: [
      {
        token: wNative,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle,
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
const marketId = MarketUtils.toId(marketData.params);

const offerMaker = "0x9000000000000000000000000000000000000000" as Address;

const installTestOracle = (client: AnvilTestClient<typeof base>) =>
  client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });

const prepareTakeableOffer = async (params: {
  readonly client: AnvilTestClient<typeof base>;
  readonly buy: boolean;
  readonly units: bigint;
}) => {
  await params.client.setBalance({
    address: offerMaker,
    value: parseEther("1"),
  });
  const authorization = await getMidnightAuthorizationRequirement({
    viemClient: params.client,
    chainId: base.id,
    owner: offerMaker,
    authorized: setterRatifier,
  });
  if (authorization) {
    await params.client.sendTransaction({
      ...authorization,
      account: offerMaker,
    });
  }

  if (params.buy) {
    await params.client.deal({
      erc20: usdc,
      account: offerMaker,
      amount: parseUnits("10", 6),
    });
    await params.client.writeContract({
      account: offerMaker,
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, maxUint256],
    });
  } else {
    const collateralAssets = parseEther("10");
    await params.client.deal({
      erc20: wNative,
      account: offerMaker,
      amount: collateralAssets,
    });
    await params.client.writeContract({
      account: offerMaker,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    const supply = params.client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateral({
        marketData,
        accountAddress: offerMaker,
        collateralAssets,
        reservedCollateralAssets: 0n,
      });
    await params.client.sendTransaction({
      ...(await supply.prepare()).build().primaryTransaction,
      account: offerMaker,
    });
    await expect(
      params.client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, offerMaker, 0n],
      }),
    ).resolves.toBe(collateralAssets);
  }

  const tree = Tree.create([
    Offer.create({
      market: marketData.params,
      buy: params.buy,
      maker: offerMaker,
      expiry: marketData.params.maturity,
      tick: 5_000n,
      ratifier: setterRatifier,
      maxUnits: params.units,
    }),
  ]);
  const ratifyRoot = await getSetterRatifierRatifyRootRequirement({
    viemClient: params.client,
    chainId: base.id,
    maker: offerMaker,
    root: tree.root,
  });
  if (ratifyRoot) {
    await params.client.sendTransaction({
      ...ratifyRoot,
      account: offerMaker,
    });
  }

  const item = SetterRatifierUtils.ratify({ tree })[0];
  if (!item) throw new Error("expected a ratified offer");

  return {
    units: params.units,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    ratifierData: item.ratifierData,
  };
};

describe("Midnight requirements on fork", () => {
  test("resolves ERC20 approvals from live token allowance state", async ({
    client,
  }) => {
    const amount = parseUnits("1", 6);
    const owner = client.account.address;
    const spender = getChainAddress(ChainId.BaseMainnet, "midnightBundles");

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
    const authorized = getChainAddress(ChainId.BaseMainnet, "midnightBundles");
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
        address: getChainAddress(ChainId.BaseMainnet, "midnight"),
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
        address: getChainAddress(ChainId.BaseMainnet, "setterRatifier"),
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

    const requirements = (await output.prepare()).requirements;
    expect(requirements).toHaveLength(1);
    const approval = requirements[0];
    if (!isRequirementApproval(approval)) {
      throw new Error("expected an ERC20 approval requirement");
    }
    expect(approval.action.args.spender).toBe(
      getChainAddress(ChainId.BaseMainnet, "midnight"),
    );
    expect(approval.action.args.amount).toBe(
      collateralAssets + reservedCollateralAssets,
    );

    await client.sendTransaction(approval);
    await expect((await output.prepare()).requirements).toEqual([]);
    expect((await output.prepare()).build().primaryTransaction.to).toBe(
      getChainAddress(ChainId.BaseMainnet, "midnight"),
    );
  });

  test("executes take-lend output after resolving requirements", async ({
    client,
  }) => {
    const amount = parseUnits("1", 6);
    await installTestOracle(client);
    await client.deal({ erc20: usdc, amount });
    const takeableOffer = await prepareTakeableOffer({
      client,
      buy: false,
      units: 2n * amount,
    });
    const output = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .takeLend({
        marketData,
        accountAddress: client.account.address,
        assets: amount,
        minUnits: 0n,
        takeableOffers: [takeableOffer],
        deadline: maxUint256,
      });
    const requirements = (await output.prepare()).requirements;
    expect(requirements.map((requirement) => requirement.action.type)).toEqual([
      "erc20Approval",
      "midnightAuthorization",
    ]);
    for (const requirement of requirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await expect((await output.prepare()).requirements).toEqual([]);

    await client.sendTransaction(
      (await output.prepare()).build().primaryTransaction,
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, client.account.address],
      }),
    ).resolves.toBeGreaterThan(0n);
  });

  test("executes supply-collateral and take-borrow outputs", async ({
    client,
  }) => {
    const collateralAssets = parseEther("1");
    const loanAssets = parseUnits("1", 6);
    await installTestOracle(client);
    await client.deal({ erc20: wNative, amount: collateralAssets });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const supply = midnightEntity.supplyCollateral({
      marketData,
      accountAddress: client.account.address,
      collateralAssets,
      reservedCollateralAssets: 0n,
    });
    const supplyRequirements = (await supply.prepare()).requirements;
    expect(
      supplyRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval"]);
    for (const requirement of supplyRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(
      (await supply.prepare()).build().primaryTransaction,
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, client.account.address, 0n],
      }),
    ).resolves.toBe(collateralAssets);

    const takeableOffer = await prepareTakeableOffer({
      client,
      buy: true,
      units: 2n * loanAssets,
    });
    const borrow = midnightEntity.takeBorrow({
      marketData,
      accountAddress: client.account.address,
      loanAssets,
      maxUnits: 2n * loanAssets,
      takeableOffers: [takeableOffer],
      deadline: maxUint256,
    });
    const borrowRequirements = (await borrow.prepare()).requirements;
    expect(
      borrowRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["midnightAuthorization"]);
    for (const requirement of borrowRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(
      (await borrow.prepare()).build().primaryTransaction,
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, client.account.address],
      }),
    ).resolves.toBeGreaterThan(0n);
  });

  test("executes supply-collateral-take-borrow and repay outputs", async ({
    client,
  }) => {
    const collateralAssets = parseEther("1");
    const loanAssets = parseUnits("1", 6);
    await installTestOracle(client);
    await client.deal({ erc20: wNative, amount: collateralAssets });
    const takeableOffer = await prepareTakeableOffer({
      client,
      buy: true,
      units: 2n * loanAssets,
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const borrow = midnightEntity.supplyCollateralTakeBorrow({
      marketData,
      accountAddress: client.account.address,
      collateralAssets,
      loanAssets,
      maxUnits: 2n * loanAssets,
      takeableOffers: [takeableOffer],
      deadline: maxUint256,
    });
    const borrowRequirements = (await borrow.prepare()).requirements;
    expect(
      borrowRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval", "midnightAuthorization"]);
    for (const requirement of borrowRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(
      (await borrow.prepare()).build().primaryTransaction,
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, client.account.address, 0n],
      }),
    ).resolves.toBe(collateralAssets);
    const debtBeforeRepay = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "debt",
      args: [marketId, client.account.address],
    });
    expect(debtBeforeRepay).toBeGreaterThan(0n);

    const repay = midnightEntity.repayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      repayAssets: loanAssets / 2n,
      withdrawCollateralAssets: 0n,
      deadline: maxUint256,
    });
    const repayRequirements = (await repay.prepare()).requirements;
    expect(
      repayRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval"]);
    for (const requirement of repayRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(
      (await repay.prepare()).build().primaryTransaction,
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, client.account.address],
      }),
    ).resolves.toBeLessThan(debtBeforeRepay);
  });
});
