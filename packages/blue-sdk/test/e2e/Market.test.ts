import { Time } from "@morpho-org/morpho-ts";
import { parseUnits } from "viem";
import { describe, expect } from "vitest";
import {
  ChainId,
  Market,
  MarketParams,
  addressesRegistry,
} from "../../src/index.js";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "./abis.js";
import { test } from "./setup.js";

const { morpho, usdc, wstEth, adaptiveCurveIrm } =
  addressesRegistry[ChainId.EthMainnet];

const params = new MarketParams({
  // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
  loanToken: usdc,
  collateralToken: wstEth,
  oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
  irm: adaptiveCurveIrm,
  lltv: parseUnits("86", 16),
});

describe("Market", () => {
  test("should borrow borrowable assets", async ({ client, expect }) => {
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
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [ContractFunctionExecutionError: The contract function "borrow" reverted with the following reason:
      insufficient collateral

      Contract Call:
        address:   0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
        function:  borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv), uint256 assets, uint256 shares, address onBehalf, address receiver)
        args:            ({"collateralToken":"0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0","loanToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","oracle":"0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2","irm":"0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC","lltv":"860000000000000000","id":"0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc","liquidationIncentiveFactor":"1043841336116910229"}, 3461590871, 0, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.41.2]
    `);

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
