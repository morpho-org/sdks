import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import { supplyCollateral } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

test("withdrawCollateral executes through BlueBundlesV1", async ({
  client,
}) => {
  const collateralAssets = parseUnits("10", 18);
  const withdrawAssets = parseUnits("1", 18);
  await supplyCollateral({
    client,
    chainId: mainnet.id,
    market: WethUsdsBlue,
    collateralAmount: collateralAssets,
  });

  const market = client
    .extend(morphoViemExtension())
    .morpho.blue(WethUsdsBlue, mainnet.id);
  const before = await market.getPositionData(client.account.address);
  const action = market.withdrawCollateral({
    userAddress: client.account.address,
    positionData: before,
    collateralAssets: withdrawAssets,
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });

  await client.sendTransaction(action.buildTx(signatures));

  const after = await market.getPositionData(client.account.address);
  expect(after.collateral).toBe(before.collateral - withdrawAssets);
});
