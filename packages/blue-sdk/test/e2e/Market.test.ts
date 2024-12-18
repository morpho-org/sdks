import { Time } from "@morpho-org/morpho-ts";
import { parseUnits } from "viem";
import { describe, expect } from "vitest";
import { ChainId, Market, MarketParams, addresses } from "../../src/index.js";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "./abis.js";
import { test } from "./setup.js";

const { morpho, usdc, wstEth, adaptiveCurveIrm } =
  addresses[ChainId.EthMainnet];

const params = new MarketParams({
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
      erc20: params.collateralToken,
      amount: collateral,
    });
    await client.approve({
      address: params.collateralToken,
      args: [morpho, collateral],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "supplyCollateral",
      args: [params, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        { ...params },
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
      args: [params.id],
    });

    const market = new Market({
      params,
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
      price: await client.readContract({
        abi: blueOracleAbi,
        address: params.oracle,
        functionName: "price",
      }),
      rateAtTarget: await client.readContract({
        abi: adaptiveCurveIrmAbi,
        address: params.irm,
        functionName: "rateAtTarget",
        args: [params.id],
      }),
    }).accrueInterest(timestamp);

    await client.setNextBlockTimestamp({ timestamp });

    const [, borrowShares] = await client.readContract({
      abi: blueAbi,
      address: morpho,
      functionName: "position",
      args: [params.id, client.account.address],
    });

    const maxBorrowable = market.getMaxBorrowableAssets({
      borrowShares,
      collateral,
    })!;

    client.transport.tracer.next = false;

    await expect(
      client.writeContract({
        abi: blueAbi,
        address: morpho,
        functionName: "borrow",
        args: [
          { ...params },
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
        { ...params },
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
      erc20: params.collateralToken,
      amount: collateral,
    });
    await client.approve({
      address: params.collateralToken,
      args: [morpho, collateral],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "supplyCollateral",
      args: [params, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        { ...params },
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
      args: [params.id],
    });

    const market = new Market({
      params,
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
      price: await client.readContract({
        abi: blueOracleAbi,
        address: params.oracle,
        functionName: "price",
      }),
      rateAtTarget: await client.readContract({
        abi: adaptiveCurveIrmAbi,
        address: params.irm,
        functionName: "rateAtTarget",
        args: [params.id],
      }),
    }).accrueInterest(timestamp);

    const [, borrowShares] = await client.readContract({
      abi: blueAbi,
      address: morpho,
      functionName: "position",
      args: [params.id, client.account.address],
    });

    const maxBorrowable = market.getMaxBorrowableAssets({
      borrowShares,
      collateral,
    })!;

    await client.deal({
      erc20: params.loanToken,
      amount: maxBorrowable,
    });
    await client.approve({
      address: params.loanToken,
      args: [morpho, maxBorrowable],
    });
    await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "supply",
      args: [params, maxBorrowable, 0n, client.account.address, "0x"],
    });

    await client.setNextBlockTimestamp({ timestamp });

    const hash = await client.writeContract({
      abi: blueAbi,
      address: morpho,
      functionName: "borrow",
      args: [
        { ...params },
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
