import { expect } from "chai";
import { MaxUint256, parseUnits } from "ethers";
import { MetaMorpho__factory } from "ethers-types";
import { ethers } from "hardhat";
import _omit from "lodash/omit";

import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { BlueService, ChainService, getLast } from "@morpho-org/blue-core-sdk";
import { MetaMorphoService } from "@morpho-org/blue-metamorpho-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/lib/tests/mocks/markets";
import { mine, setUp } from "@morpho-org/morpho-test";

import { SimulationService, simulateOperations } from "../../../../src";
import { steakUsdc } from "../../fixtures";

describe("MetaMorpho_Reallocate", () => {
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

  test("should simulate reallocation accurately", async () => {
    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), {
          users: [signer.address],
        }),
        { vaults: [steakUsdc.address] },
      ),
    );

    const { value: dataBefore } = await simulationService.data;

    const vault = MetaMorpho__factory.connect(steakUsdc.address, signer);

    const owner = await ethers.getImpersonatedSigner(await vault.owner());

    const assets =
      dataBefore.getAccrualPosition(
        steakUsdc.address,
        MAINNET_MARKETS.usdc_wstEth.id,
      ).supplyAssets - parseUnits("1000", 6);

    const steps = simulateOperations(
      [
        {
          type: "MetaMorpho_Reallocate",
          sender: owner.address,
          address: steakUsdc.address,
          args: [
            {
              id: MAINNET_MARKETS.usdc_wstEth.id,
              assets,
            },
            { id: MAINNET_MARKETS.usdc_idle.id, assets: MaxUint256 },
          ],
        },
      ],
      dataBefore,
    );

    expect(steps.length).to.equal(2);

    await setNextBlockTimestamp(dataBefore.timestamp);
    await vault.connect(owner).reallocate([
      {
        marketParams: MAINNET_MARKETS.usdc_wstEth,
        assets,
      },
      { marketParams: MAINNET_MARKETS.usdc_idle, assets: MaxUint256 },
    ]);
    await mine(0);

    const { value: data } = await simulationService.data;

    const expected = getLast(steps);
    expected.blockNumber += 1n;

    expect(_omit(data, "cacheId")).to.eql(_omit(expected, "cacheId"));
  });
});
