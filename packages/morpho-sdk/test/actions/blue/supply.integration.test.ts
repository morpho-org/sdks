import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

test("supply executes through BlueBundlesV1", async ({ client }) => {
  const assets = parseUnits("1000", 6);
  await client.deal({ erc20: CbbtcUsdcBlue.loanToken, amount: assets });

  const market = client
    .extend(morphoViemExtension())
    .morpho.blue(CbbtcUsdcBlue, mainnet.id);
  const before = await market.getPositionData(client.account.address);
  const action = market.supply({
    userAddress: client.account.address,
    assets,
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });

  await client.sendTransaction(action.buildTx(signatures));

  const after = await market.getPositionData(client.account.address);
  expect(after.supplyShares).toBeGreaterThan(before.supplyShares);
});
