import { expect } from "chai";
import { Wallet, toBigInt } from "ethers";
import { MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";

import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setCode, time } from "@nomicfoundation/hardhat-network-helpers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { ChainId, MarketConfig, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";

import { Market } from "../../src/augment/Market";

describe("augment/Market", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  it("should fetch market data", async () => {
    const expectedData = {
      config: MAINNET_MARKETS.usdc_wstEth,
      totalSupplyAssets: 32212092216793n,
      totalSupplyShares: 31693536738210306937n,
      totalBorrowAssets: 30448219939637n,
      totalBorrowShares: 29909458369905209203n,
      lastUpdate: 1711589915n,
      fee: 0n,
      rateAtTarget: 3386101241n,
      price: 4026279734253409453160432114n,
    };

    const value = await Market.fetch(MAINNET_MARKETS.usdc_wstEth.id, signer);

    expect(value).to.eql(expectedData);
  });

  it("should fetch market data from config", async () => {
    const expectedData = {
      config: MAINNET_MARKETS.usdc_wstEth,
      totalSupplyAssets: 32212092216793n,
      totalSupplyShares: 31693536738210306937n,
      totalBorrowAssets: 30448219939637n,
      totalBorrowShares: 29909458369905209203n,
      lastUpdate: 1711589915n,
      fee: 0n,
      rateAtTarget: 3386101241n,
      price: 4026279734253409453160432114n,
    };

    const value = await Market.fetchFromConfig(
      MAINNET_MARKETS.usdc_wstEth,
      signer,
    );

    expect(value).to.eql(expectedData);
  });

  it("should fetch price and rate if idle market", async () => {
    const expectedData = {
      config: MAINNET_MARKETS.usdc_idle,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 1711558175n,
      fee: 0n,
      price: 0n,
      rateAtTarget: undefined,
    };

    const value = await Market.fetch(MAINNET_MARKETS.usdc_idle.id, signer);

    expect(value).to.eql(expectedData);
  });

  it("should not fetch rate at target for unknown irm", async () => {
    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      signer,
    );
    const owner = await ethers.getImpersonatedSigner(await morpho.owner());

    const config = new MarketConfig({
      ...MAINNET_MARKETS.eth_wstEth,
      irm: Wallet.createRandom().address,
    });
    await setCode(
      config.irm,
      await ethers.provider.getCode(MAINNET_MARKETS.eth_wstEth.irm),
    );
    await morpho.connect(owner).enableIrm(config.irm);

    const timestamp = toBigInt(await time.latest());
    await setNextBlockTimestamp(timestamp);
    await morpho.createMarket(config);

    const expectedData = {
      config,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: timestamp,
      fee: 0n,
      price: 1160095030000000000000000000000000000n,
      rateAtTarget: undefined,
    };

    const value = await Market.fetch(config.id, signer);

    expect(value).to.eql(expectedData);
  });
});
