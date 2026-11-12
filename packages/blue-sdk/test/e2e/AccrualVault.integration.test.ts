import {
  metaMorphoFactoryAbi,
  metaMorphoAbi as vaultAbi,
} from "@morpho-org/morpho-ts/abis";
import {
  type AnvilTestClient,
  getErpcForkUrl,
  testAccount,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  maxUint256,
  numberToHex,
  parseEther,
  parseUnits,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { vaultInput, vaultMarketConfig } from "../../src/__test__/fixtures.js";
import {
  AccrualPosition,
  AccrualVault,
  addressesRegistry,
  Market,
  type MarketId,
  MarketParams,
} from "../../src/index.js";
import { adaptiveCurveIrmAbi, blueAbi } from "./abis.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 24_671_815,
});
const { blue, adaptiveCurveIrm, metaMorphoFactory, usdc, wNative } =
  addressesRegistry[mainnet.id];
const oracle: Address = "0xE2E0000000000000000000000000000000000001";

/** Installs an oracle at `oracle` whose `price()` returns `usdcPerWeth` USDC per WETH. */
const setOraclePrice = (client: AnvilTestClient, usdcPerWeth: bigint) =>
  client.setCode({
    address: oracle,
    // PUSH32 price, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0, RETURN
    bytecode: `0x7f${numberToHex(usdcPerWeth * 10n ** 24n, { size: 32 }).slice(2)}60005260206000f3`,
  });

/**
 * Creates a MetaMorpho v1.1 vault through the registered factory over a fresh USDC/WETH market,
 * then realizes bad debt in that market so the vault stores `lostAssets`.
 */
const createLossyVault = async (client: AnvilTestClient) => {
  await setOraclePrice(client, 3_000n);
  const marketParams = new MarketParams({
    loanToken: usdc,
    collateralToken: wNative,
    oracle,
    irm: adaptiveCurveIrm,
    lltv: parseUnits("0.86", 18),
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "createMarket",
    args: [marketParams],
  });
  const { result: vault, request } = await client.simulateContract({
    address: metaMorphoFactory,
    abi: metaMorphoFactoryAbi,
    functionName: "createMetaMorpho",
    args: [client.account.address, 0n, usdc, "Lossy", "LOSSY", zeroHash],
  });
  await client.writeContract(request);
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "setFeeRecipient",
    args: [client.account.address],
  });
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "setFee",
    args: [parseUnits("0.1", 18)],
  });
  // A zero timelock lets the owner accept the cap in the same block it is submitted.
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "submitCap",
    args: [marketParams, parseUnits("1000000", 6)],
  });
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "acceptCap",
    args: [marketParams],
  });
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "setSupplyQueue",
    args: [[marketParams.id]],
  });

  await client.deal({ erc20: usdc, amount: parseUnits("20000", 6) });
  await client.deal({ erc20: wNative, amount: parseEther("101") });
  await client.approve({ address: usdc, args: [vault, maxUint256] });
  await client.approve({ address: usdc, args: [blue, maxUint256] });
  await client.approve({ address: wNative, args: [blue, maxUint256] });
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "deposit",
    args: [parseUnits("10000", 6), client.account.address],
  });

  // The defaulting borrower is the test account; a healthy one keeps interest accruing afterwards.
  const healthyBorrower = testAccount(1).address;
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "supplyCollateral",
    args: [marketParams, parseEther("100"), healthyBorrower, "0x"],
  });
  await client.writeContract({
    account: healthyBorrower,
    address: blue,
    abi: blueAbi,
    functionName: "borrow",
    args: [
      marketParams,
      parseUnits("1000", 6),
      0n,
      healthyBorrower,
      healthyBorrower,
    ],
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "supplyCollateral",
    args: [marketParams, parseEther("1"), client.account.address, "0x"],
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "borrow",
    args: [
      marketParams,
      parseUnits("2000", 6),
      0n,
      client.account.address,
      client.account.address,
    ],
  });

  // Seizing all collateral at the crashed price leaves the remaining debt as bad debt.
  await setOraclePrice(client, 100n);
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "liquidate",
    args: [marketParams, client.account.address, parseEther("1"), 0n, "0x"],
  });
  // MetaMorpho v1.1 stores the realized loss in `lostAssets` on its next interaction.
  await client.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "deposit",
    args: [parseUnits("1", 6), client.account.address],
  });
  await client.mine({ blocks: 1, interval: 86_400 });

  return vault;
};

test("constructor matches MetaMorpho v1.1 totalAssets with stored losses", async ({
  client,
  expect,
}) => {
  const address = await createLossyVault(client);
  const block = await client.getBlock();
  const [
    lostAssets,
    lastTotalAssets,
    totalAssets,
    totalSupply,
    fee,
    asset,
    queueLength,
  ] = await Promise.all([
    client.readContract({ address, abi: vaultAbi, functionName: "lostAssets" }),
    client.readContract({
      address,
      abi: vaultAbi,
      functionName: "lastTotalAssets",
    }),
    client.readContract({
      address,
      abi: vaultAbi,
      functionName: "totalAssets",
    }),
    client.readContract({
      address,
      abi: vaultAbi,
      functionName: "totalSupply",
    }),
    client.readContract({ address, abi: vaultAbi, functionName: "fee" }),
    client.readContract({ address, abi: vaultAbi, functionName: "asset" }),
    client.readContract({
      address,
      abi: vaultAbi,
      functionName: "withdrawQueueLength",
    }),
  ]);
  expect(lostAssets).toBeGreaterThan(0n);
  const allocations = await Promise.all(
    Array.from({ length: Number(queueLength) }, async (_, index) => {
      const id = (await client.readContract({
        address,
        abi: vaultAbi,
        functionName: "withdrawQueue",
        args: [BigInt(index)],
      })) as MarketId;
      const [params, balances, position] = await Promise.all([
        client.readContract({
          address: blue,
          abi: blueAbi,
          functionName: "idToMarketParams",
          args: [id],
        }),
        client.readContract({
          address: blue,
          abi: blueAbi,
          functionName: "market",
          args: [id],
        }),
        client.readContract({
          address: blue,
          abi: blueAbi,
          functionName: "position",
          args: [id, address],
        }),
      ]);
      const marketParams = new MarketParams({
        loanToken: params[0],
        collateralToken: params[1],
        oracle: params[2],
        irm: params[3],
        lltv: params[4],
      });
      const rateAtTarget =
        params[3].toLowerCase() === adaptiveCurveIrm.toLowerCase()
          ? await client.readContract({
              address: params[3],
              abi: adaptiveCurveIrmAbi,
              functionName: "rateAtTarget",
              args: [id],
            })
          : undefined;
      const market = new Market({
        params: marketParams,
        totalSupplyAssets: balances[0],
        totalSupplyShares: balances[1],
        totalBorrowAssets: balances[2],
        totalBorrowShares: balances[3],
        lastUpdate: balances[4],
        fee: balances[5],
        rateAtTarget,
      }).accrueInterest(block.timestamp);
      return {
        config: vaultMarketConfig(id, { vault: address }),
        position: new AccrualPosition(
          {
            user: address,
            supplyShares: position[0],
            borrowShares: position[1],
            collateral: position[2],
          },
          market,
        ),
      };
    }),
  );
  const assetDecimals = await client.readContract({
    address: asset,
    abi: vaultAbi,
    functionName: "decimals",
  });
  const vault = new AccrualVault(
    vaultInput({
      address,
      asset,
      decimalsOffset: BigInt(Math.max(0, 18 - assetDecimals)),
      lostAssets,
      lastTotalAssets,
      totalSupply,
      fee,
    }),
    allocations,
  );
  expect(vault.totalAssets).toBe(totalAssets);
  const shares = 10n ** 18n;
  expect(vault.accrueInterest(block.timestamp).toAssets(shares)).toBe(
    await client.readContract({
      address,
      abi: vaultAbi,
      functionName: "convertToAssets",
      args: [shares],
    }),
  );
});
