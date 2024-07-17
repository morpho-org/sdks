import { expect } from "chai";
import { MetaMorpho__factory, PublicAllocator__factory } from "ethers-types";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  ChainId,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";

import "../src/augment/VaultMarketConfig";
import sinon from "sinon";
import { steakUsdc } from "./fixtures";

describe("augment/VaultMarketConfig", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;

    const mm = MetaMorpho__factory.connect(steakUsdc.address, signer);

    const owner = await ethers.getImpersonatedSigner(await mm.owner());

    await mm
      .connect(owner)
      .setIsAllocator(addresses[ChainId.EthMainnet].publicAllocator, true);

    const publicAllocator = PublicAllocator__factory.connect(
      addresses[ChainId.EthMainnet].publicAllocator,
      owner,
    );

    await publicAllocator.setFee(steakUsdc.address, 1);

    await (
      await publicAllocator.setFlowCaps(steakUsdc.address, [
        {
          id: MAINNET_MARKETS.usdc_wstEth.id,
          caps: { maxIn: 2, maxOut: 3 },
        },
      ])
    ).wait();

    sinon.spy(signer.provider, "call");
  });

  afterEach(() => {
    (signer.provider.call as sinon.SinonSpy).resetHistory();
  });

  after(() => {
    (signer.provider.call as sinon.SinonSpy).restore();
  });

  it("should fetch vault market data", async () => {
    const expectedData = new VaultMarketConfig({
      vault: steakUsdc.address,
      marketId: MAINNET_MARKETS.usdc_wstEth.id,
      cap: 1000000000000000000000000000000n,
      enabled: true,
      pendingCap: {
        value: 0n,
        validAt: 0n,
      },
      publicAllocatorConfig: new VaultMarketPublicAllocatorConfig({
        vault: steakUsdc.address,
        marketId: MAINNET_MARKETS.usdc_wstEth.id,
        maxIn: 2n,
        maxOut: 3n,
      }),
      removableAt: 0n,
    });

    const value = await VaultMarketConfig.fetch(
      steakUsdc.address,
      MAINNET_MARKETS.usdc_wstEth.id,
      signer,
    );

    expect(value).to.eql(expectedData);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      3,
    );
  });
});
