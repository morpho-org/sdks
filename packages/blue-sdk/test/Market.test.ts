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
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";
import { ChainId, Market, MarketConfig, MathLib, addresses } from "../src";

describe("Market", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  it("should borrow borrowable assets", async () => {
    const { morpho: morphoAddress } = addresses[ChainId.EthMainnet];
    const morpho = MorphoBlue__factory.connect(morphoAddress, signer);

    const config = new MarketConfig({
      loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
      irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
      lltv: 86_0000000000000000n,
    });

    const collateral = MathLib.WAD;
    await deal(config.collateralToken, signer, collateral);
    await ERC20__factory.connect(config.collateralToken, signer).approve(
      morphoAddress,
      collateral,
    );
    await morpho.supplyCollateral(config, collateral, signer.address, "0x");
    await morpho.borrow(config, 1_000000n, 0n, signer.address, signer.address);

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

    await morpho.borrow(
      config,
      market.getMaxBorrowableAssets(position),
      0n,
      signer.address,
      signer.address,
    );
  });

  it("should borrow borrowable assets in a galaxy far far away", async () => {
    const { morpho: morphoAddress } = addresses[ChainId.EthMainnet];
    const morpho = MorphoBlue__factory.connect(morphoAddress, signer);

    const config = new MarketConfig({
      loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
      irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
      lltv: 86_0000000000000000n,
    });

    const collateral = MathLib.WAD * 10_000_000_000n;
    await deal(config.collateralToken, signer, collateral);
    await ERC20__factory.connect(config.collateralToken, signer).approve(
      morphoAddress,
      collateral,
    );
    await morpho.supplyCollateral(config, collateral, signer.address, "0x");
    await morpho.borrow(config, 1_000000n, 0n, signer.address, signer.address);

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
    const borrowable = market.getMaxBorrowableAssets(position);

    await deal(config.loanToken, signer, borrowable);
    await ERC20__factory.connect(config.loanToken, signer).approve(
      morphoAddress,
      borrowable,
    );
    await morpho.supply(config, borrowable, 0n, signer.address, "0x");

    await setNextBlockTimestamp(timestamp);

    await morpho.borrow(config, borrowable, 0n, signer.address, signer.address);
  });
});
