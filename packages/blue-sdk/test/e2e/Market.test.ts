import { Time } from "@morpho-org/morpho-ts";
import { erc20Abi, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { ChainId, Market, MarketConfig, addresses } from "../../src/index.js";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "./abis.js";
import { test } from "./setup.js";

const { morpho, usdc, wstEth, adaptiveCurveIrm } =
  addresses[ChainId.EthMainnet];

const config = new MarketConfig({
  // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
  loanToken: usdc,
  collateralToken: wstEth,
  oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
  irm: adaptiveCurveIrm,
  lltv: parseUnits("86", 16),
});

describe("Market", () => {
  test("should borrow borrowable assets", async ({ client }) => {
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
      args: [morpho, collateral],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "supplyCollateral",
      args: [config, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        config,
        parseUnits("1", 6),
        0n,
        client.account.address,
        client.account.address,
      ],
    });

    const timestamp = (await client.timestamp()) + Time.s.from.d(10n);

    const [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ] = await client.readContract({
      abi: blueAbi,
      address: morpho,
      functionName: "market",
      args: [config.id],
    });

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

    await client.setNextBlockTimestamp({ timestamp });

    const [supplyShares, borrowShares] = await client.readContract({
      abi: blueAbi,
      address: morpho,
      functionName: "position",
      args: [config.id, client.account.address],
    });

    const maxBorrowable = market.getMaxBorrowableAssets({
      supplyShares,
      borrowShares,
      collateral,
    });

    await expect(
      client.estimateContractGas({
        abi: blueAbi,
        address: morpho,
        functionName: "borrow",
        args: [
          config,
          maxBorrowable + 10n,
          0n,
          client.account.address,
          client.account.address,
        ],
      }),
    ).rejects.toThrow("insufficient collateral");

    const hash = await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        config,
        maxBorrowable,
        0n,
        client.account.address,
        client.account.address,
      ],
    });

    const receipt = await client.getTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
  });

  test("should borrow borrowable assets in an extreme future", async ({
    client,
  }) => {
    const collateral = parseUnits("10000000000", 18);
    await client.deal({
      erc20: config.collateralToken,
      recipient: client.account.address,
      amount: collateral,
    });
    await client.writeContract({
      abi: erc20Abi,
      address: config.collateralToken,
      functionName: "approve",
      args: [morpho, collateral],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "supplyCollateral",
      args: [config, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        config,
        parseUnits("1", 6),
        0n,
        client.account.address,
        client.account.address,
      ],
    });

    const timestamp = (await client.timestamp()) + Time.s.from.y(1_000n);

    const [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ] = await client.readContract({
      abi: blueAbi,
      address: morpho,
      functionName: "market",
      args: [config.id],
    });

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
      address: morpho,
      functionName: "position",
      args: [config.id, client.account.address],
    });

    const maxBorrowable = market.getMaxBorrowableAssets({
      supplyShares,
      borrowShares,
      collateral,
    });

    await client.deal({
      erc20: config.loanToken,
      recipient: client.account.address,
      amount: maxBorrowable,
    });
    await client.writeContract({
      abi: erc20Abi,
      address: config.loanToken,
      functionName: "approve",
      args: [morpho, maxBorrowable],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "supply",
      args: [config, maxBorrowable, 0n, client.account.address, "0x"],
    });

    await client.setNextBlockTimestamp({ timestamp });

    const hash = await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        config,
        maxBorrowable,
        0n,
        client.account.address,
        client.account.address,
      ],
    });

    const receipt = await client.getTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
  });
});
