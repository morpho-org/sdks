import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { type E2eScenario, getE2eAsset } from "@morpho-org/morpho-test";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  concatHex,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  numberToHex,
  padHex,
  parseEther,
  zeroAddress,
} from "viem";
import { expect } from "vitest";
import {
  getMidnightAuthorizationRequirement,
  morphoViemExtension,
} from "../../src/index.js";
import { describeE2e, installE2eAsset, wrapE2eNative } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnight",
  requires: ["midnight", "midnightBundlesV2", "setterRatifier"],
};

describeE2e(scenario, (test, { chainId }) => {
  test("take-lend routes through MidnightBundlesV2 and credits the lender", async ({
    client,
  }) => {
    const midnight = getChainAddress(chainId, "midnight");
    const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
    const setterRatifier = getChainAddress(chainId, "setterRatifier");
    const loanAsset = getE2eAsset(chainId);
    const loanToken = loanAsset.address.toLowerCase() as Address;
    const collateralToken =
      "0xE2e0000000000000000000000000000000000004" as Address;
    const oracle = "0xE2E0000000000000000000000000000000000001" as Address;
    const maker = "0x000000000000000000000000000000000000a11c" as Address;
    const units = parseEther("1");
    const collateralAssets = parseEther("10");
    const maturity = 2_000_000_000n;

    if (loanAsset.requiresInstall) await installE2eAsset(client, loanToken);
    await installE2eAsset(client, collateralToken);
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(numberToHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });

    const params = new MarketParams({
      chainId,
      midnight,
      loanToken,
      collateralParams: [
        {
          token: collateralToken,
          lltv: 770000000000000000n,
          liquidationCursor: 300000000000000000n,
          oracle,
        },
      ],
      maturity,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    });
    const marketData = new Market({
      params,
      totalUnits: 0n,
      lossFactor: 0n,
      withdrawable: 0n,
      continuousFeeCredit: 0n,
      settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
      continuousFee: 0,
      tickSpacing: 1,
    });

    await client.setBalance({ address: maker, value: parseEther("1") });
    await client.deal({
      erc20: collateralToken,
      account: maker,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: maker,
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await expect(
      client.readContract({
        address: collateralToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
      }),
    ).resolves.toBe(collateralAssets);
    await expect(
      client.readContract({
        address: collateralToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [maker, midnight],
      }),
    ).resolves.toBe(collateralAssets);
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(params), 0n, collateralAssets, maker],
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [setterRatifier, true, maker],
    });

    const tree = Tree.create([
      Offer.create({
        market: params,
        buy: false,
        maker,
        expiry: maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: 2n * units,
      }),
    ]);
    await client.writeContract({
      account: maker,
      address: setterRatifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [maker, tree.root, true],
    });
    const ratifiedOffer = SetterRatifierUtils.ratify({ tree })[0];
    if (!ratifiedOffer) throw new Error("Expected a ratified takeable offer");

    await wrapE2eNative(client, {
      wNative: loanToken,
      amount: units,
    });
    const take = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId)
      .takeLend({
        marketData,
        accountAddress: client.account.address,
        target: { type: "units", units, maxBuyerAssets: units },
        takeableOffers: [
          {
            units,
            offer: OfferUtils.toStruct({ offer: ratifiedOffer.offer }),
            ratifierData: ratifiedOffer.ratifierData,
          },
        ],
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
      });
    for (const requirement of await take.getRequirements()) {
      if (!("to" in requirement)) {
        throw new Error("expected an onchain call requirement");
      }
      await client.sendTransaction(
        requirement as Parameters<typeof client.sendTransaction>[0],
      );
    }

    const tx = take.buildTx();
    expect(tx.to).toBe(midnightBundlesV2);
    await client.sendTransaction(tx);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [MarketUtils.toId(params), client.account.address],
      }),
    ).resolves.toBe(units);
  });

  test("authorization: authorizes midnightBundlesV2 on Midnight from fork state", async ({
    client,
  }) => {
    const midnight = getChainAddress(chainId, "midnight");
    const authorized = getChainAddress(chainId, "midnightBundlesV2");
    // The registered operator must be bound to this chain's Midnight.
    const operatorMidnight = await client.readContract({
      address: authorized,
      abi: midnightBundlesV2Abi,
      functionName: "MIDNIGHT",
    });
    expect(isAddressEqual(operatorMidnight, midnight)).toBe(true);

    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [client.account.address, authorized],
      }),
    ).toBe(false);

    const requirement = await getMidnightAuthorizationRequirement({
      viemClient: client,
      chainId,
      owner: client.account.address,
      authorized,
    });
    if (requirement == null)
      throw new Error("Expected a midnightBundlesV2 authorization requirement");
    expect(requirement.action.type).toBe("midnightAuthorization");
    await client.sendTransaction(requirement);

    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [client.account.address, authorized],
      }),
    ).toBe(true);
    // Once authorized, the helper resolves no further requirement.
    await expect(
      getMidnightAuthorizationRequirement({
        viemClient: client,
        chainId,
        owner: client.account.address,
        authorized,
      }),
    ).resolves.toBeNull();
  });
});
