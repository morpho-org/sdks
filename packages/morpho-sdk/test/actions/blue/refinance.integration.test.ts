import { MarketParams } from "@morpho-org/blue-sdk";
import { maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

const sourceMarket = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});

const destinationMarket = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});

test("refinance executes a full migration through BlueBundlesV1", async ({
  client,
}) => {
  const collateralAssets = parseUnits("5", 18);
  const borrowAssets = parseUnits("1", 18);
  for (const market of [sourceMarket, destinationMarket]) {
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market,
      supplyAmount: borrowAssets * 4n,
    });
  }
  await supplyCollateral({
    client,
    chainId: mainnet.id,
    market: sourceMarket,
    collateralAmount: collateralAssets,
  });
  await borrow({
    client,
    chainId: mainnet.id,
    market: sourceMarket,
    borrowAmount: borrowAssets,
  });

  const morpho = client.extend(morphoViemExtension()).morpho;
  const source = morpho.blue(sourceMarket, mainnet.id);
  const destination = morpho.blue(destinationMarket, mainnet.id);
  const positionData = await source.getPositionData(client.account.address);
  const destinationPositionData = await destination.getPositionData(
    client.account.address,
  );
  const action = source.refinance({
    userAddress: client.account.address,
    positionData,
    destination: {
      marketParams: destinationMarket,
      positionData: destinationPositionData,
    },
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });

  await client.sendTransaction(action.buildTx(signatures));

  const sourceAfter = await source.getPositionData(client.account.address);
  const destinationAfter = await destination.getPositionData(
    client.account.address,
  );
  expect(sourceAfter.borrowShares).toBe(0n);
  expect(sourceAfter.collateral).toBe(0n);
  expect(destinationAfter.borrowShares).toBeGreaterThan(0n);
  expect(destinationAfter.collateral).toBe(
    destinationPositionData.collateral + collateralAssets,
  );
});
