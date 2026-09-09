import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

test("withdraw executes through BlueBundlesV1", async ({ client }) => {
  const suppliedAssets = parseUnits("1000", 6);
  await supplyLoan({
    client,
    chainId: mainnet.id,
    market: CbbtcUsdcBlue,
    supplyAmount: suppliedAssets,
  });

  const market = client
    .extend(morphoViemExtension())
    .morpho.blue(CbbtcUsdcBlue, mainnet.id);
  const before = await market.getPositionData(client.account.address);
  const action = market.withdraw({
    userAddress: client.account.address,
    positionData: before,
    assets: suppliedAssets / 2n,
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });

  await client.sendTransaction(action.buildTx(signatures));

  const after = await market.getPositionData(client.account.address);
  expect(after.supplyShares).toBeLessThan(before.supplyShares);
});
