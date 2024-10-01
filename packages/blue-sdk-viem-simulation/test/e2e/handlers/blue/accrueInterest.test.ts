import { expect } from "chai";
import { MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";
import _omit from "lodash/omit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { BlueService, ChainService, getLast } from "@morpho-org/blue-core-sdk";
import { MetaMorphoService } from "@morpho-org/blue-metamorpho-sdk";
import { ChainId, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/lib/tests/mocks/markets";
import { mine, setUp } from "@morpho-org/morpho-test";

import {
  Operation,
  SimulationService,
  simulateOperations,
} from "../../../../src";

const { morpho } = addresses[ChainId.EthMainnet];

describe("Blue_AccrueInterest", () => {
  let signer: SignerWithAddress;

  let simulationService: SimulationService;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  afterEach(async () => {
    simulationService?.chainService.close();
    simulationService?.metaMorphoService.blueService.close();
    simulationService?.metaMorphoService.close();
    simulationService?.close();
  });

  test("should accrue interest accurately", async () => {
    const id = MAINNET_MARKETS.usdc_wstEth.id;
    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), {
          users: [signer.address],
          markets: [id],
        }),
      ),
    );

    const operations: Operation[] = [
      {
        type: "Blue_AccrueInterest",
        sender: signer.address,
        address: morpho,
        args: {
          id,
        },
      },
    ];

    const { value: dataBefore } = await simulationService.data;

    const steps = simulateOperations(operations, dataBefore);

    expect(steps.length).to.equal(2);

    await setNextBlockTimestamp(dataBefore.timestamp);

    await MorphoBlue__factory.connect(morpho, signer).accrueInterest(
      MAINNET_MARKETS.usdc_wstEth,
    );
    await mine(0);

    const expected = getLast(steps);
    const { value: data } = await simulationService.data;

    expected.blockNumber += 1n;

    expect(_omit(data, "cacheId")).to.eql(_omit(expected, "cacheId"));
  });
});
