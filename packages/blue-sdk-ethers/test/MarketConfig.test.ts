import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";
import sinon from "sinon";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  ChainId,
  MarketConfig,
  MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/lib/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";

import "../src/augment/MarketConfig";

describe("augment/MarketConfig", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;

    sinon.spy(signer.provider, "call");
  });

  afterEach(() => {
    (signer.provider.call as sinon.SinonSpy).resetHistory();
  });

  after(() => {
    (signer.provider.call as sinon.SinonSpy).restore();
  });

  it("should fetch config from cache", async () => {
    const market = await MarketConfig.fetch(
      MAINNET_MARKETS.usdc_wstEth.id,
      signer,
    );

    expect(market).to.eql(MAINNET_MARKETS.usdc_wstEth);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      0,
    );
  });

  it("should fetch config from chain", async () => {
    const marketParams = {
      collateralToken: ZeroAddress,
      loanToken: addresses[ChainId.EthMainnet].wNative,
      lltv: 0n,
      irm: ZeroAddress,
      oracle: ZeroAddress,
    };

    const market = await MarketConfig.fetch(
      "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284" as MarketId,
      signer,
    );

    expect(market).to.eql(marketParams);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      1,
    );
  });
});
