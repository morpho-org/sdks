import { expect } from "chai";
import { parseUnits } from "ethers";
import { ERC20__factory, MetaMorpho__factory } from "ethers-types";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";
import _omit from "lodash/omit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { BlueService, ChainService, getLast } from "@morpho-org/blue-core-sdk";
import { MetaMorphoService } from "@morpho-org/blue-metamorpho-sdk";
import { mine, setUp } from "@morpho-org/morpho-test";

import { SimulationService, simulateOperations } from "../../../../src";
import { steakUsdc } from "../../fixtures";

describe("MetaMorpho_AccrueInterest", () => {
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

  test("should accrue interest accurately upon withdraw", async () => {
    const assets = parseUnits("100", 6);

    await deal(steakUsdc.asset, signer.address, assets * 2n);
    await ERC20__factory.connect(steakUsdc.asset, signer).approve(
      steakUsdc.address,
      assets * 2n,
    );
    await (
      await MetaMorpho__factory.connect(steakUsdc.address, signer).deposit(
        assets * 2n,
        signer.address,
      )
    ).wait();

    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), {
          users: [signer.address],
        }),
        { vaults: [steakUsdc.address] },
      ),
    );

    const { value: dataBefore } = await simulationService.data;

    const steps = simulateOperations(
      [
        {
          type: "MetaMorpho_Withdraw",
          sender: signer.address,
          address: steakUsdc.address,
          args: {
            assets,
            owner: signer.address,
            receiver: signer.address,
          },
        },
      ],
      dataBefore,
    );

    expect(steps.length).to.equal(2);

    await setNextBlockTimestamp(dataBefore.timestamp);
    await MetaMorpho__factory.connect(steakUsdc.address, signer).withdraw(
      assets,
      signer.address,
      signer.address,
    );
    await mine(0);

    const { value: data } = await simulationService.data;

    const expected = getLast(steps);
    expected.blockNumber += 1n;

    expect(_omit(data, "cacheId")).to.eql(_omit(expected, "cacheId"));
  });
});
