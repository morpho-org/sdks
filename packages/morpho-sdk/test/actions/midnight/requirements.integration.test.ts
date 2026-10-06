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
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
  isRequirementApproval,
  type MidnightSellTarget,
  type MidnightTakeableOffer,
  morphoViemExtension,
} from "../../../src/index.js";
import { deployMidnightBundlesV2 } from "../../fixtures/midnightBundlesV2.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 49_600_000n,
  hardfork: "Karst",
  stepsTracing: false,
});

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

/** Selectors of the MidnightBundlesV2 custom errors these tests expect. */
const OUT_OF_OFFERS = toFunctionSelector("OutOfOffers()");
const UNITS_TOO_LOW = toFunctionSelector("UnitsTooLow()");

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
  await params.client.writeContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, offerMaker],
    account: offerMaker,
  });

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
    const collateralBefore = await params.client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "collateral",
      args: [marketId, offerMaker, 0n],
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
      ...supply.buildTx(),
      account: offerMaker,
    });
    await expect(
      params.client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, offerMaker, 0n],
      }),
    ).resolves.toBe(collateralBefore + collateralAssets);
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
  await params.client.writeContract({
    account: offerMaker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [offerMaker, tree.root, true],
  });

  const item = SetterRatifierUtils.ratify({ tree })[0];
  if (!item) throw new Error("expected a ratified offer");

  return {
    root: tree.root,
    takeableOffer: {
      units: params.units,
      offer: OfferUtils.toStruct({ offer: item.offer }),
      ratifierData: item.ratifierData,
    },
  };
};

const sendRequirements = async (
  client: AnvilTestClient<typeof base>,
  requirements: readonly ({ readonly to?: Address } | object)[],
) => {
  for (const requirement of requirements) {
    if (!("to" in requirement)) {
      throw new Error("expected an onchain call requirement");
    }
    await client.sendTransaction(
      requirement as Parameters<typeof client.sendTransaction>[0],
    );
  }
};

/** Supplies 1 WETH and borrows 1 USDC through a lend offer; returns the borrower's debt. */
const openBorrowPosition = async (client: AnvilTestClient<typeof base>) => {
  const collateralAssets = parseEther("1");
  const loanAssets = parseUnits("1", 6);
  await installTestOracle(client);
  await deployMidnightBundlesV2(client);
  await client.deal({ erc20: wNative, amount: collateralAssets });
  const { takeableOffer: lendOffer } = await prepareTakeableOffer({
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
    collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
    target: { type: "assets", assets: loanAssets, maxUnits: 2n * loanAssets },
    takeableOffers: [lendOffer],
    deadline: maxUint256,
  });
  await sendRequirements(client, await borrow.getRequirements());
  await client.sendTransaction(borrow.buildTx());
  const debt = await readPosition(client, "debt");
  expect(debt).toBeGreaterThan(0n);
  return { midnightEntity, debt, collateralAssets };
};

const readPosition = (
  client: AnvilTestClient<typeof base>,
  functionName: "debt" | "credit",
) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName,
    args: [marketId, client.account.address],
  });

describe("Midnight requirements on fork", () => {
  test("resolves ERC20 approvals from live token allowance state", async ({
    client,
  }) => {
    const amount = parseUnits("1", 6);
    const owner = client.account.address;
    const spender = getChainAddress(ChainId.BaseMainnet, "midnight");

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
    const authorized = await deployMidnightBundlesV2(client);
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
    expect(approval.action.args.spender).toBe(
      getChainAddress(ChainId.BaseMainnet, "midnight"),
    );
    expect(approval.action.args.amount).toBe(
      collateralAssets + reservedCollateralAssets,
    );

    await client.sendTransaction(approval);
    await expect(output.getRequirements()).resolves.toEqual([]);
    expect(output.buildTx().to).toBe(
      getChainAddress(ChainId.BaseMainnet, "midnight"),
    );
  });

  const takeLendAmount = parseUnits("1", 6);
  test.for([
    { type: "assets", assets: takeLendAmount, minUnits: 0n },
    { type: "units", units: takeLendAmount, maxBuyerAssets: takeLendAmount },
  ] as const)(
    "executes take-lend output ($type target) after resolving requirements",
    async (target, { client }) => {
      const amount = takeLendAmount;
      await installTestOracle(client);
      await deployMidnightBundlesV2(client);
      await client.deal({ erc20: usdc, amount });
      const { takeableOffer } = await prepareTakeableOffer({
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
          target,
          takeableOffers: [takeableOffer],
          maxContinuousFee: maxUint256,
          deadline: maxUint256,
        });
      const requirements = await output.getRequirements();
      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["erc20Approval", "midnightAuthorization"]);
      for (const requirement of requirements) {
        if (!("to" in requirement)) {
          throw new Error("expected an onchain call requirement");
        }
        await client.sendTransaction(requirement);
      }
      await expect(output.getRequirements()).resolves.toEqual([]);

      await client.sendTransaction(output.buildTx());
      await expect(
        client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName: "credit",
          args: [marketId, client.account.address],
        }),
      ).resolves.toSatisfy((credit: bigint) =>
        target.type === "units" ? credit === target.units : credit > 0n,
      );
    },
  );

  describe("take-withdraw", () => {
    const amount = parseUnits("1", 6);

    /** Lends `amount` units through a borrow-side offer so the test account holds `amount` credit. */
    const setup = async (client: AnvilTestClient<typeof base>) => {
      await installTestOracle(client);
      await deployMidnightBundlesV2(client);
      await client.deal({ erc20: usdc, amount });
      const midnightEntity = client
        .extend(morphoViemExtension())
        .morpho.midnight(base.id);
      const lend = midnightEntity.takeLend({
        marketData,
        accountAddress: client.account.address,
        target: { type: "units", units: amount, maxBuyerAssets: amount },
        takeableOffers: [
          await prepareTakeableOffer({
            client,
            buy: false,
            units: 2n * amount,
          }),
        ],
        maxContinuousFee: maxUint256,
        deadline: maxUint256,
      });
      for (const requirement of await lend.getRequirements()) {
        if (!("to" in requirement)) {
          throw new Error("expected an onchain call requirement");
        }
        await client.sendTransaction(requirement);
      }
      await client.sendTransaction(lend.buildTx());
      const read = (functionName: "credit" | "debt") =>
        client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName,
          args: [marketId, client.account.address],
        });
      const readWithdrawable = () =>
        client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName: "withdrawable",
          args: [marketId],
        });
      await expect(read("credit")).resolves.toBe(amount);
      await expect(readWithdrawable()).resolves.toBe(0n);

      const withdraw = (
        target: MidnightSellTarget,
        takeableOffers: readonly MidnightTakeableOffer[],
      ) =>
        midnightEntity
          .takeWithdraw({
            marketData,
            accountAddress: client.account.address,
            target,
            takeableOffers,
            deadline: maxUint256,
          })
          .buildTx();
      return { midnightEntity, read, readWithdrawable, withdraw };
    };

    test("sells all credit to offers and rejects selling past credit", async ({
      client,
    }) => {
      const { midnightEntity, read, withdraw } = await setup(client);
      const lendOffer = await prepareTakeableOffer({
        client,
        buy: true,
        units: 4n * amount,
      });
      // With collateral, the oversized sell below could open healthy debt, so only reduceOnly reverts it.
      const collateralAssets = parseEther("1");
      await client.deal({ erc20: wNative, amount: collateralAssets });
      const supply = midnightEntity.supplyCollateral({
        marketData,
        accountAddress: client.account.address,
        collateralAssets,
        reservedCollateralAssets: 0n,
      });
      for (const requirement of await supply.getRequirements()) {
        if (!("to" in requirement)) {
          throw new Error("expected an onchain call requirement");
        }
        await client.sendTransaction(requirement);
      }
      await client.sendTransaction(supply.buildTx());

      await expect(
        client.sendTransaction(
          withdraw({ type: "units", units: 2n * amount, minSellerAssets: 0n }, [
            lendOffer,
          ]),
        ),
      ).rejects.toThrow(toFunctionSelector("NotReduceOnly()"));

      const balanceBefore = await client.balanceOf({ erc20: usdc });
      await client.sendTransaction(
        withdraw({ type: "units", units: amount, minSellerAssets: 0n }, [
          lendOffer,
        ]),
      );
      await expect(read("credit")).resolves.toBe(0n);
      await expect(read("debt")).resolves.toBe(0n);
      await expect(client.balanceOf({ erc20: usdc })).resolves.toBeGreaterThan(
        balanceBefore,
      );
    });

    test("redeems idle liquidity first and sells the rest to offers", async ({
      client,
    }) => {
      const { read, readWithdrawable, withdraw } = await setup(client);
      // The borrow-side maker repays part of its debt, leaving idle loan assets to redeem.
      const repaid = (2n * amount) / 5n;
      await client.deal({ erc20: usdc, account: offerMaker, amount: repaid });
      await client.writeContract({
        account: offerMaker,
        address: usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [midnight, repaid],
      });
      await client.writeContract({
        account: offerMaker,
        address: midnight,
        abi: midnightAbi,
        functionName: "repay",
        args: [
          MarketUtils.toStruct(marketData.params),
          repaid,
          offerMaker,
          zeroAddress,
          "0x",
        ],
      });
      await expect(readWithdrawable()).resolves.toBe(repaid);
      const lendOffer = await prepareTakeableOffer({
        client,
        buy: true,
        units: 4n * amount,
      });

      const balanceBefore = await client.balanceOf({ erc20: usdc });
      await client.sendTransaction(
        withdraw({ type: "units", units: amount, minSellerAssets: 0n }, [
          lendOffer,
        ]),
      );
      const received =
        (await client.balanceOf({ erc20: usdc })) - balanceBefore;
      await expect(readWithdrawable()).resolves.toBe(0n);
      await expect(read("credit")).resolves.toBe(0n);
      await expect(read("debt")).resolves.toBe(0n);
      // Redeemed units pay 1:1; the offer fill pays the rest below par.
      expect(received).toBeGreaterThan(repaid);
      expect(received).toBeLessThan(amount);
    });

    test("skips stale offers and reverts when only stale offers remain", async ({
      client,
    }) => {
      const { read, withdraw } = await setup(client);
      const half = amount / 2n;
      const staleOffer = await prepareTakeableOffer({
        client,
        buy: true,
        units: half,
      });
      await client.sendTransaction(
        withdraw({ type: "units", units: half, minSellerAssets: 0n }, [
          staleOffer,
        ]),
      );
      await expect(read("credit")).resolves.toBe(half);

      await expect(
        client.sendTransaction(
          withdraw({ type: "units", units: half, minSellerAssets: 0n }, [
            staleOffer,
          ]),
        ),
      ).rejects.toThrow(toFunctionSelector("OutOfOffers()"));

      const freshOffer = await prepareTakeableOffer({
        client,
        buy: true,
        units: amount,
      });
      await client.sendTransaction(
        withdraw({ type: "units", units: half, minSellerAssets: 0n }, [
          staleOffer,
          freshOffer,
        ]),
      );
      await expect(read("credit")).resolves.toBe(0n);
    });

    test("enforces net proceeds bounds", async ({ client }) => {
      const { read, withdraw } = await setup(client);
      const lendOffer = await prepareTakeableOffer({
        client,
        buy: true,
        units: 4n * amount,
      });
      // Offers buy below par, so selling `amount` units pays less than `amount` assets.
      await expect(
        client.sendTransaction(
          withdraw({ type: "units", units: amount, minSellerAssets: amount }, [
            lendOffer,
          ]),
        ),
      ).rejects.toThrow(toFunctionSelector("SellerAssetsTooLow()"));
      const assets = amount / 2n;
      await expect(
        client.sendTransaction(
          withdraw({ type: "assets", assets, maxUnits: assets }, [lendOffer]),
        ),
      ).rejects.toThrow(toFunctionSelector("UnitsTooHigh()"));

      const balanceBefore = await client.balanceOf({ erc20: usdc });
      await client.sendTransaction(
        withdraw({ type: "assets", assets, maxUnits: amount }, [lendOffer]),
      );
      await expect(client.balanceOf({ erc20: usdc })).resolves.toBe(
        balanceBefore + assets,
      );
      await expect(read("credit")).resolves.toBeGreaterThan(0n);
    });
  });

  test("executes supply-collateral and take-borrow outputs", async ({
    client,
  }) => {
    const collateralAssets = parseEther("1");
    const loanAssets = parseUnits("1", 6);
    await installTestOracle(client);
    await deployMidnightBundlesV2(client);
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
    const supplyRequirements = await supply.getRequirements();
    expect(
      supplyRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval"]);
    for (const requirement of supplyRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(supply.buildTx());
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, client.account.address, 0n],
      }),
    ).resolves.toBe(collateralAssets);

    const { takeableOffer } = await prepareTakeableOffer({
      client,
      buy: true,
      units: 2n * loanAssets,
    });
    const borrow = midnightEntity.takeBorrow({
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: loanAssets, minSellerAssets: 0n },
      takeableOffers: [takeableOffer],
      deadline: maxUint256,
    });
    const borrowRequirements = await borrow.getRequirements();
    expect(
      borrowRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["midnightAuthorization"]);
    for (const requirement of borrowRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(borrow.buildTx());
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, client.account.address],
      }),
    ).resolves.toBe(loanAssets);
  });

  test("executes supply-collateral-take-borrow and repay outputs", async ({
    client,
  }) => {
    const collateralAssets = parseEther("1");
    const loanAssets = parseUnits("1", 6);
    await installTestOracle(client);
    await deployMidnightBundlesV2(client);
    await client.deal({ erc20: wNative, amount: collateralAssets });
    const { takeableOffer } = await prepareTakeableOffer({
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
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      target: { type: "units", units: loanAssets, minSellerAssets: 0n },
      takeableOffers: [takeableOffer],
      deadline: maxUint256,
    });
    const borrowRequirements = await borrow.getRequirements();
    expect(
      borrowRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval", "midnightAuthorization"]);
    for (const requirement of borrowRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(borrow.buildTx());
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

    // Prepared for the current debt, then the debt grows before execution.
    const repay = midnightEntity.repayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      repay: { type: "full", maxBuyerAssets: 4n * loanAssets },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      deadline: maxUint256,
    });
    await client.sendTransaction(
      midnightEntity
        .takeBorrow({
          marketData,
          accountAddress: client.account.address,
          target: {
            type: "units",
            units: loanAssets / 2n,
            minSellerAssets: 0n,
          },
          takeableOffers: [takeableOffer],
          deadline: maxUint256,
        })
        .buildTx(),
    );
    await client.deal({ erc20: usdc, amount: 4n * loanAssets });
    const repayRequirements = await repay.getRequirements();
    // MidnightBundlesV2 was already authorized for the borrow above.
    expect(
      repayRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval"]);
    for (const requirement of repayRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(repay.buildTx());
    for (const [functionName, args] of [
      ["debt", [marketId, client.account.address]],
      ["collateral", [marketId, client.account.address, 0n]],
    ] as const) {
      await expect(
        client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName,
          args,
        }),
      ).resolves.toBe(0n);
    }
  });

  test("executes take-repay-withdraw-collateral with direct repayment fallback", async ({
    client,
  }) => {
    const collateralAssets = parseEther("1");
    const loanAssets = parseUnits("1", 6);
    await installTestOracle(client);
    await deployMidnightBundlesV2(client);
    await client.deal({ erc20: wNative, amount: collateralAssets });
    const { takeableOffer: lendOffer } = await prepareTakeableOffer({
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
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      target: { type: "assets", assets: loanAssets, maxUnits: 2n * loanAssets },
      takeableOffers: [lendOffer],
      deadline: maxUint256,
    });
    for (const requirement of await borrow.getRequirements()) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(borrow.buildTx());
    const debt = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "debt",
      args: [marketId, client.account.address],
    });
    expect(debt).toBeGreaterThan(0n);

    // The offer covers half the debt; repayEnabled repays the rest directly.
    const { takeableOffer: borrowOffer } = await prepareTakeableOffer({
      client,
      buy: false,
      units: debt / 2n,
    });
    await client.deal({ erc20: usdc, amount: 2n * debt });
    const repay = midnightEntity.takeRepayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: maxUint256, maxBuyerAssets: 2n * debt },
      takeableOffers: [borrowOffer],
      repayEnabled: true,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      maxContinuousFee: maxUint256,
      deadline: maxUint256,
    });
    const repayRequirements = await repay.getRequirements();
    expect(
      repayRequirements.map((requirement) => requirement.action.type),
    ).toEqual(["erc20Approval"]);
    for (const requirement of repayRequirements) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(requirement);
    }
    await client.sendTransaction(repay.buildTx());

    const account = client.account.address;
    const read = (functionName: "debt" | "credit") =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName,
        args: [marketId, account],
      });
    await expect(read("debt")).resolves.toBe(0n);
    await expect(read("credit")).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, account, 0n],
      }),
    ).resolves.toBe(0n);
  });

  test("take-repay-withdraw-collateral partially fills an offer larger than the target", async ({
    client,
  }) => {
    const { midnightEntity, debt } = await openBorrowPosition(client);
    const { takeableOffer: borrowOffer } = await prepareTakeableOffer({
      client,
      buy: false,
      units: 2n * debt,
    });
    const maxBuyerAssets = 2n * debt;
    await client.deal({ erc20: usdc, amount: maxBuyerAssets });
    const repay = midnightEntity.takeRepayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: debt / 2n, maxBuyerAssets },
      takeableOffers: [borrowOffer],
      repayEnabled: false,
      maxContinuousFee: maxUint256,
      deadline: maxUint256,
    });
    await sendRequirements(client, await repay.getRequirements());
    await client.sendTransaction(repay.buildTx());

    await expect(readPosition(client, "debt")).resolves.toBe(debt - debt / 2n);
    await expect(readPosition(client, "credit")).resolves.toBe(0n);
    // The unspent part of maxBuyerAssets is refunded.
    await expect(
      client.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [client.account.address],
      }),
    ).resolves.toBeGreaterThan(maxBuyerAssets - debt / 2n);
  });

  test("take-repay-withdraw-collateral skips a stale offer and fills the next one", async ({
    client,
  }) => {
    const { midnightEntity, debt } = await openBorrowPosition(client);
    const stale = await prepareTakeableOffer({
      client,
      buy: false,
      units: debt,
    });
    await client.writeContract({
      account: offerMaker,
      address: setterRatifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [offerMaker, stale.root, false],
    });
    const { takeableOffer: liveOffer } = await prepareTakeableOffer({
      client,
      buy: false,
      units: debt + 1n,
    });
    await client.deal({ erc20: usdc, amount: 2n * debt });
    const staleOnly = midnightEntity.takeRepayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: maxUint256, maxBuyerAssets: 2n * debt },
      takeableOffers: [stale.takeableOffer],
      repayEnabled: false,
      maxContinuousFee: maxUint256,
      deadline: maxUint256,
    });
    await sendRequirements(client, await staleOnly.getRequirements());
    await expect(client.sendTransaction(staleOnly.buildTx())).rejects.toThrow(
      OUT_OF_OFFERS,
    );

    const repay = midnightEntity.takeRepayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: maxUint256, maxBuyerAssets: 2n * debt },
      takeableOffers: [stale.takeableOffer, liveOffer],
      repayEnabled: false,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      maxContinuousFee: maxUint256,
      deadline: maxUint256,
    });
    await sendRequirements(client, await repay.getRequirements());
    await client.sendTransaction(repay.buildTx());

    await expect(readPosition(client, "debt")).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, client.account.address, 0n],
      }),
    ).resolves.toBe(0n);
  });

  test.for([
    { name: "units target above maxBuyerAssets", type: "units" },
    { name: "assets target below minUnits", type: "assets" },
  ] as const)(
    "take-repay-withdraw-collateral reverts when the aggregate bound is not met ($name)",
    async ({ type }, { client }) => {
      const { midnightEntity, debt } = await openBorrowPosition(client);
      const { takeableOffer: borrowOffer } = await prepareTakeableOffer({
        client,
        buy: false,
        units: debt,
      });
      await client.deal({ erc20: usdc, amount: debt });
      const repay = midnightEntity.takeRepayWithdrawCollateral({
        marketData,
        accountAddress: client.account.address,
        target:
          type === "units"
            ? { type, units: debt, maxBuyerAssets: 1n }
            : { type, assets: debt / 2n, minUnits: debt },
        takeableOffers: [borrowOffer],
        repayEnabled: false,
        maxContinuousFee: maxUint256,
        deadline: maxUint256,
      });
      await sendRequirements(client, await repay.getRequirements());

      await expect(client.sendTransaction(repay.buildTx())).rejects.toThrow(
        type === "units" ? OUT_OF_OFFERS : UNITS_TOO_LOW,
      );
      await expect(readPosition(client, "debt")).resolves.toBe(debt);
    },
  );

  test("take-repay-withdraw-collateral reverts when offers run out and repayEnabled is false", async ({
    client,
  }) => {
    const { midnightEntity, debt } = await openBorrowPosition(client);
    const { takeableOffer: borrowOffer } = await prepareTakeableOffer({
      client,
      buy: false,
      units: debt / 2n,
    });
    await client.deal({ erc20: usdc, amount: 2n * debt });
    const repay = midnightEntity.takeRepayWithdrawCollateral({
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: maxUint256, maxBuyerAssets: 2n * debt },
      takeableOffers: [borrowOffer],
      repayEnabled: false,
      maxContinuousFee: maxUint256,
      deadline: maxUint256,
    });
    await sendRequirements(client, await repay.getRequirements());

    await expect(client.sendTransaction(repay.buildTx())).rejects.toThrow(
      OUT_OF_OFFERS,
    );
    await expect(readPosition(client, "debt")).resolves.toBe(debt);
  });
});
