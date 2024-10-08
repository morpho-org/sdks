import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { ChainId, MarketId, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";

import { MarketConfig } from "../src/augment/MarketConfig";

describe("augment/MarketConfig", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  it("should fetch config from cache", async () => {
    const market = await MarketConfig.fetch(
      MAINNET_MARKETS.usdc_wstEth.id,
      signer,
    );

    expect(market).to.eql(MAINNET_MARKETS.usdc_wstEth);
  });

  it("should fetch config from chain", async () => {
    const marketParams = {
      collateralToken: ZeroAddress,
      loanToken: addresses[ChainId.EthMainnet].wNative,
      lltv: 0n,
      irm: ZeroAddress,
      oracle: ZeroAddress,
      id: "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284",
      liquidationIncentiveFactor: 1150000000000000000n,
    };

    const market = await MarketConfig.fetch(
      "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284" as MarketId,
      signer,
    );

    expect(market).to.eql(marketParams);
  });
});
