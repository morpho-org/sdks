import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

test("repay executes through BlueBundlesV1", async ({ client }) => {
  const borrowAssets = parseUnits("100", 18);
  const repayAssets = borrowAssets / 2n;
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
    collateralAmount: parseUnits("10", 18),
  });
  await borrow({
    client,
    chainId: mainnet.id,
    market: WethUsdsBlue,
    borrowAmount: borrowAssets,
  });
  await client.deal({ erc20: WethUsdsBlue.loanToken, amount: repayAssets });

  const market = client
    .extend(morphoViemExtension())
    .morpho.blue(WethUsdsBlue, mainnet.id);
  const before = await market.getPositionData(client.account.address);
  const action = market.repay({
    userAddress: client.account.address,
    positionData: before,
    repayAssets,
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });

  await client.sendTransaction(action.buildTx(signatures));

  const after = await market.getPositionData(client.account.address);
  expect(after.borrowShares).toBeLessThan(before.borrowShares);
});
