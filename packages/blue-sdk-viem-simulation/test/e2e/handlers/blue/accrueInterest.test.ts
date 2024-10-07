import _omit from "lodash/omit";

import { ChainId, addresses } from "@morpho-org/blue-sdk";

import { markets } from "@morpho-org/morpho-test";
import { getLast } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";
import { type Operation, simulateOperations } from "../../../../src";
import { test } from "../../setup";

const { morpho } = addresses[ChainId.EthMainnet];
const { usdc_wstEth } = markets[ChainId.EthMainnet];

describe("Blue_AccrueInterest", () => {
  test("should accrue interest accurately", async ({ client }) => {
    const operations: Operation[] = [
      {
        type: "Blue_AccrueInterest",
        sender: client.account.address,
        args: {
          id: usdc_wstEth.id,
        },
      },
    ];

    const { value: dataBefore } = await simulationService.data;

    const steps = simulateOperations(operations, dataBefore);

    expect(steps.length).to.equal(2);

    await client.setNextBlockTimestamp(dataBefore.timestamp);

    await MorphoBlue__factory.connect(morpho, signer).accrueInterest(
      usdc_wstEth,
    );
    await mine(0);

    const expected = getLast(steps);
    const { value: data } = await simulationService.data;

    expected.blockNumber += 1n;

    expect(_omit(data, "cacheId")).to.eql(_omit(expected, "cacheId"));
  });
});
