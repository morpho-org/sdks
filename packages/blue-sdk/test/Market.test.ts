import { expect } from "chai";
import {
  AdaptiveCurveIrm__factory,
  BlueOracle__factory,
  ERC20__factory,
  MorphoBlue__factory,
} from "ethers-types";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { setUp } from "@morpho-org/morpho-test";
import { Time } from "@morpho-org/morpho-ts";
import {
  latest,
  setNextBlockTimestamp,
} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { parseUnits } from "ethers";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";
import { ChainId, Market, addresses } from "../src";
import { MAINNET_MARKETS } from "../src/tests/mocks/markets";

describe("Market", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  it("should borrow borrowable assets", async () => {
    const { morpho: morphoAddress } = addresses[ChainId.EthMainnet];
    const morpho = MorphoBlue__factory.connect(morphoAddress, signer);

    const config = MAINNET_MARKETS.usdc_wstEth;

    const collateral = parseUnits("1", 18);
    await deal(config.collateralToken, signer, collateral);
    await ERC20__factory.connect(config.collateralToken, signer).approve(
      morphoAddress,
      collateral,
    );
    await morpho.supplyCollateral(config, collateral, signer.address, "0x");
    await morpho.borrow(
      config,
      parseUnits("1", 6),
      0n,
      signer.address,
      signer.address,
    );

    const {
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    } = await morpho.market(config.id);

    const timestamp = (await latest()) + Time.s.from.d(10);

    const market = new Market({
      config,
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
      price: await BlueOracle__factory.connect(config.oracle, signer).price(),
      rateAtTarget: await AdaptiveCurveIrm__factory.connect(
        config.irm,
        signer,
      ).rateAtTarget(config.id),
    }).accrueInterest(timestamp);

    const position = await morpho.position(config.id, signer.address);

    await setNextBlockTimestamp(timestamp);

    const maxBorrowable = market.getMaxBorrowableAssets(position);

    await expect(
      morpho.borrow(
        config,
        maxBorrowable + 1n,
        0n,
        signer.address,
        signer.address,
      ),
    ).to.be.rejectedWith("insufficient collateral");

    await morpho.borrow(
      config,
      maxBorrowable,
      0n,
      signer.address,
      signer.address,
    );
  });

  it("should borrow borrowable assets in an extreme future", async () => {
    const { morpho: morphoAddress } = addresses[ChainId.EthMainnet];
    const morpho = MorphoBlue__factory.connect(morphoAddress, signer);

    const config = MAINNET_MARKETS.usdc_wstEth;

    const collateral = parseUnits("10000000000", 18);
    await deal(config.collateralToken, signer, collateral);
    await ERC20__factory.connect(config.collateralToken, signer).approve(
      morphoAddress,
      collateral,
    );
    await morpho.supplyCollateral(config, collateral, signer.address, "0x");
    await morpho.borrow(
      config,
      parseUnits("1", 6),
      0n,
      signer.address,
      signer.address,
    );

    const {
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    } = await morpho.market(config.id);

    const timestamp = (await latest()) + Time.s.from.y(10_000);

    const market = new Market({
      config,
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
      price: await BlueOracle__factory.connect(config.oracle, signer).price(),
      rateAtTarget: await AdaptiveCurveIrm__factory.connect(
        config.irm,
        signer,
      ).rateAtTarget(config.id),
    }).accrueInterest(timestamp);

    const position = await morpho.position(config.id, signer.address);
    const maxBorrowable = market.getMaxBorrowableAssets(position);

    await deal(config.loanToken, signer, maxBorrowable);
    await ERC20__factory.connect(config.loanToken, signer).approve(
      morphoAddress,
      maxBorrowable,
    );
    await morpho.supply(config, maxBorrowable, 0n, signer.address, "0x");

    await setNextBlockTimestamp(timestamp);

    await morpho.borrow(
      config,
      maxBorrowable,
      0n,
      signer.address,
      signer.address,
    );
  });
});
