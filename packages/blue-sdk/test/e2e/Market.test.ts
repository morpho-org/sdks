import { Time } from "@morpho-org/morpho-ts";
import { erc20Abi, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { ChainId, Market, addresses } from "../../src";
import { MAINNET_MARKETS } from "../../src/tests/mocks/markets.js";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "./abis.js";
import { test } from "./setup.js";

describe("Market", () => {
  test("should borrow borrowable assets", async ({ client }) => {
    const { morpho: morphoAddress } = addresses[ChainId.EthMainnet];

    const config = MAINNET_MARKETS.usdc_wstEth;

    const collateral = parseUnits("1", 18);
    await client.deal({
      erc20: config.collateralToken,
      recipient: client.account.address,
      amount: collateral,
    });
    await client.writeContract({
      abi: erc20Abi,
      address: config.collateralToken,
      functionName: "approve",
      args: [morphoAddress, collateral],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morphoAddress,
      functionName: "supplyCollateral",
      args: [config, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morphoAddress,
      functionName: "borrow",
      args: [
        config,
        parseUnits("1", 6),
        0n,
        client.account.address,
        client.account.address,
      ],
    });

    const [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ] = await client.readContract({
      abi: blueAbi,
      address: morphoAddress,
      functionName: "market",
      args: [config.id],
    });

    const timestamp = (await client.timestamp()) + Time.s.from.d(10n);

    const market = new Market({
      config,
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
      price: await client.readContract({
        abi: blueOracleAbi,
        address: config.oracle,
        functionName: "price",
      }),
      rateAtTarget: await client.readContract({
        abi: adaptiveCurveIrmAbi,
        address: config.irm,
        functionName: "rateAtTarget",
        args: [config.id],
      }),
    }).accrueInterest(timestamp);

    const [supplyShares, borrowShares] = await client.readContract({
      abi: blueAbi,
      address: morphoAddress,
      functionName: "position",
      args: [config.id, client.account.address],
    });

    await client.setNextBlockTimestamp({ timestamp });

    const maxBorrowable = market.getMaxBorrowableAssets({
      supplyShares,
      borrowShares,
      collateral,
    });

    await expect(
      client.writeContract({
        abi: blueAbi,
        address: morphoAddress,
        functionName: "borrow",
        args: [
          config,
          maxBorrowable,
          0n,
          client.account.address,
          client.account.address,
        ],
      }),
    ).toThrow("insufficient collateral");

    await client.writeContract({
      abi: blueAbi,
      address: morphoAddress,
      functionName: "borrow",
      args: [
        config,
        maxBorrowable,
        0n,
        client.account.address,
        client.account.address,
      ],
    });
  });

  test.skip("should borrow borrowable assets in an extreme future", async () => {
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
