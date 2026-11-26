import { MathLib, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import { parseUnits, toFunctionSelector } from "viem";
import { mainnet } from "viem/chains";
import { assert, expect } from "vitest";
import { blueBorrow, morphoViemExtension } from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";

test.for(["deadline", "maxLtv"] as const)(
  "BlueBundlesV1 enforces the %s guard at execution",
  async (guard, { client }) => {
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      supplyAmount: parseUnits("2000", 18),
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
      borrowAmount: parseUnits("1000", 18),
    });
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WethUsdsBlue, mainnet.id);
    const block = await client.getBlock({
      blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
    });
    const now = block.timestamp;
    const positionData = await market.getPositionData(client.account.address, {
      blockNumber: block.number,
    });
    const borrowAssets = parseUnits("1", 18);
    const deadline = now + (guard === "deadline" ? 1_800n : 172_800n);
    const action = market.borrow({
      now,
      userAddress: client.account.address,
      positionData,
      borrowAssets,
      deadline,
    });
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements: await action.getRequirements(),
    });
    let tx = action.buildTx(signatures);
    expect(tx.action.args.deadline).toBe(deadline);
    if (guard === "maxLtv") {
      assert(positionData.market.price !== undefined);
      const collateralValue = MathLib.mulDivDown(
        positionData.collateral,
        positionData.market.price,
        ORACLE_PRICE_SCALE,
      );
      const earlyDebt = positionData.accrueInterest(now + 600n).borrowAssets;
      const lateDebt = positionData.accrueInterest(now + 86_400n).borrowAssets;
      const maxLtv = MathLib.wDivUp(earlyDebt + borrowAssets, collateralValue);
      expect(lateDebt).toBeGreaterThan(earlyDebt);
      expect(
        MathLib.wDivUp(lateDebt + borrowAssets, collateralValue),
      ).toBeGreaterThan(maxLtv);
      expect(
        MathLib.wDivUp(lateDebt + borrowAssets, collateralValue),
      ).toBeLessThan(WethUsdsBlue.lltv);
      tx = blueBorrow({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          userAddress: client.account.address,
          borrowAssets,
          deadline,
          maxLtv,
        },
      });
      expect(tx.action.args.maxLtv).toBe(maxLtv);
    }
    await expect(client.call(tx)).resolves.toBeDefined();
    const executionTimestamp =
      guard === "deadline" ? deadline + 1n : now + 86_400n;
    await client.setNextBlockTimestamp({ timestamp: executionTimestamp });
    await client.mine({ blocks: 1 });
    const error = guard === "deadline" ? "DeadlinePassed" : "LtvExceeded";
    await expect(client.sendTransaction(tx)).rejects.toThrow(
      new RegExp(`${error}|${toFunctionSelector(`${error}()`)}`),
    );
  },
);
