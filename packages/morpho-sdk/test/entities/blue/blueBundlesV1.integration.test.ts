import type { MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

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
});
