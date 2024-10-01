import { expect } from "chai";
import { MaxUint256, parseUnits } from "ethers";
import { ERC20__factory, MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { Address, ChainId, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";
import { Position } from "../../src/augment/Position";

const market = MAINNET_MARKETS.usdc_wstEth;

const supplyAssets = parseUnits("10", 6);
const borrowShares = parseUnits("7", 12);
const collateral = parseUnits("1");

describe("augment/Position", () => {
  let signer: SignerWithAddress;
  let supplier: SignerWithAddress;

  setUp(async () => {
    const signers = await ethers.getSigners();
    signer = signers[0]!;
    supplier = signers[1]!;

    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      signer,
    );
    const usdc = ERC20__factory.connect(market.loanToken, signer);
    const wstEth = ERC20__factory.connect(market.collateralToken, signer);

    await deal(market.loanToken, supplier.address, supplyAssets);
    await usdc
      .connect(supplier)
      .approve(addresses[ChainId.EthMainnet].morpho, MaxUint256);
    await morpho
      .connect(supplier)
      .supply(market, supplyAssets, 0, supplier.address, "0x");

    await deal(market.collateralToken, signer.address, collateral);
    await wstEth.approve(addresses[ChainId.EthMainnet].morpho, MaxUint256);
    await morpho.supplyCollateral(market, collateral, signer.address, "0x");
    await morpho.borrow(
      market,
      0,
      borrowShares,
      signer.address,
      signer.address,
    );
  });

  it("should fetch position", async () => {
    const expectedData = new Position({
      user: signer.address as Address,
      marketId: market.id,
      supplyShares: 0n,
      borrowShares,
      collateral,
    });

    const value = await Position.fetch(
      signer.address as Address,
      market.id,
      signer,
    );

    expect(value).to.eql(expectedData);
  });
});
