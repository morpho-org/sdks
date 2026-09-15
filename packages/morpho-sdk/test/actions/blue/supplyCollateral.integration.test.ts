import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

test("supplyCollateral executes through BlueBundlesV1", async ({ client }) => {
  const collateralAssets = parseUnits("1", 18);
  await client.deal({
    erc20: WethUsdsBlue.collateralToken,
    amount: collateralAssets,
  });

  const market = client
    .extend(morphoViemExtension())
    .morpho.blue(WethUsdsBlue, mainnet.id);
  const action = market.supplyCollateral({
    userAddress: client.account.address,
    collateralAssets,
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });

  await client.sendTransaction(action.buildTx(signatures));

  const position = await market.getPositionData(client.account.address);
  expect(position.collateral).toBe(collateralAssets);
});
