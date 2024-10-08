import { expect } from "chai";
import { parseEther, parseUnits } from "ethers";
import { MetaMorpho__factory, PublicAllocator__factory } from "ethers-types";
import { ethers } from "hardhat";
import _omit from "lodash/omit";

import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { BlueService, ChainService, getLast } from "@morpho-org/blue-core-sdk";
import { MetaMorphoService } from "@morpho-org/blue-metamorpho-sdk";
import { ChainId, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/lib/tests/mocks/markets";
import { mine, setUp } from "@morpho-org/morpho-test";

import { SimulationService, simulateOperations } from "../../../../src";
import { steakUsdc } from "../../fixtures";

describe("MetaMorpho_PublicReallocate", () => {
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

  test("should simulate public reallocation accurately", async () => {
    const vault = MetaMorpho__factory.connect(steakUsdc.address, signer);

    const owner = await ethers.getImpersonatedSigner(await vault.owner());

    const publicAllocator = PublicAllocator__factory.connect(
      addresses[ChainId.EthMainnet].publicAllocator,
      owner,
    );

    const fee = parseEther("0.005");
    const assets = parseUnits("1000", 6);

    await publicAllocator.setFee(steakUsdc.address, fee);
    await publicAllocator.setFlowCaps(steakUsdc.address, [
      {
        id: MAINNET_MARKETS.usdc_wstEth.id,
        caps: {
          maxIn: 0n,
          maxOut: assets,
        },
      },
      {
        id: MAINNET_MARKETS.usdc_idle.id,
        caps: {
          maxIn: assets,
          maxOut: 0n,
        },
      },
    ]);

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
          type: "MetaMorpho_PublicReallocate",
          sender: signer.address,
          address: steakUsdc.address,
          args: {
            withdrawals: [{ id: MAINNET_MARKETS.usdc_wstEth.id, assets }],
            supplyMarketId: MAINNET_MARKETS.usdc_idle.id,
          },
        },
      ],
      dataBefore,
    );

    expect(steps.length).to.equal(2);

    await setNextBlockTimestamp(dataBefore.timestamp);
    await publicAllocator
      .connect(signer)
      .reallocateTo(
        steakUsdc.address,
        [{ marketParams: MAINNET_MARKETS.usdc_wstEth, amount: assets }],
        MAINNET_MARKETS.usdc_idle,
        { value: fee },
      );
    await mine(0);

    const { value: data } = await simulationService.data;

    const expected = getLast(steps);
    expected.blockNumber += 1n;

    expect(_omit(data, "cacheId")).to.eql(_omit(expected, "cacheId"));
  });
});
