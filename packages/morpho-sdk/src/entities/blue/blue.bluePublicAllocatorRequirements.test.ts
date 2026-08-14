import {
  AccrualPosition,
  getChainAddresses,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi, erc2612Abi, fetchToken } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import { CbbtcUsdcBlue } from "../../../test/fixtures/blue.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";

vi.mock("@morpho-org/blue-sdk-viem", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@morpho-org/blue-sdk-viem")>();
  return { ...original, fetchToken: vi.fn() };
});

const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const marketParams = new MarketParams(CbbtcUsdcBlue);

describe("MorphoBlue BluePublicAllocator requirements", () => {
  test("default: includes the classic loan-token approval for V2 penalties", async () => {
    const handle = createMockClient(mainnet);
    const {
      morpho,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "nonce",
      result: 0n,
    });
    mockRead(handle, {
      address: marketParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const positionData = new AccrualPosition(
      {
        user: USER,
        supplyShares: 0n,
        borrowShares: 10n ** 18n,
        collateral: 10n ** 24n,
      },
      new Market({
        params: marketParams,
        totalSupplyAssets: 10n ** 24n,
        totalBorrowAssets: 10n ** 24n / 2n,
        totalSupplyShares: 10n ** 24n,
        totalBorrowShares: 10n ** 24n / 2n,
        lastUpdate: 1_700_000_000n,
        fee: 0n,
        price: ORACLE_PRICE_SCALE,
      }),
    );
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const requirements = await market
      .borrow({
        amount: 1n,
        userAddress: USER,
        positionData,
        reallocations: [
          {
            type: "bluePublicAllocator",
            allocator: CbbtcUsdcBlue.irm,
            vault: CbbtcUsdcBlue.oracle,
            from: { type: "idle" },
            to: { adapter: CbbtcUsdcBlue.collateralToken },
            assets: 1n,
            penalty: 1n,
          },
        ],
      })
      .getRequirements();

    const approval = requirements.find(isRequirementApproval);
    expect(approval?.to).toBe(marketParams.loanToken);
    expect(approval?.action.args).toStrictEqual({
      spender: generalAdapter1,
      amount: 1n,
    });
  });

  test("behavior: aggregates collateral and penalty into one shared-token approval", async () => {
    const sharedTokenParams = new MarketParams({
      ...CbbtcUsdcBlue,
      collateralToken: CbbtcUsdcBlue.loanToken,
    });
    const handle = createMockClient(mainnet);
    const {
      morpho,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "nonce",
      result: 0n,
    });
    mockRead(handle, {
      address: sharedTokenParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const positionData = new AccrualPosition(
      {
        user: USER,
        supplyShares: 0n,
        borrowShares: 1n,
        collateral: 1_000_000n,
      },
      new Market({
        params: sharedTokenParams,
        totalSupplyAssets: 1_000_000n,
        totalBorrowAssets: 1n,
        totalSupplyShares: 1_000_000n,
        totalBorrowShares: 1n,
        lastUpdate: 1_700_000_000n,
        fee: 0n,
        price: ORACLE_PRICE_SCALE,
      }),
    );
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(sharedTokenParams, mainnet.id);

    const requirements = await market
      .supplyCollateralBorrow({
        amount: 100n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData,
        reallocations: [
          {
            type: "bluePublicAllocator",
            allocator: CbbtcUsdcBlue.irm,
            vault: CbbtcUsdcBlue.oracle,
            from: { type: "idle" },
            to: { adapter: CbbtcUsdcBlue.collateralToken },
            assets: 10n,
            penalty: 500_000_000_000_000_000n,
          },
        ],
      })
      .getRequirements();

    const approvals = requirements.filter(isRequirementApproval);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.to).toBe(sharedTokenParams.loanToken);
    expect(approvals[0]?.action.args).toStrictEqual({
      spender: generalAdapter1,
      amount: 105n,
    });
  });

  test("behavior: aggregates collateral and penalty into one shared-token simple permit", async () => {
    const sharedTokenParams = new MarketParams({
      ...CbbtcUsdcBlue,
      collateralToken: CbbtcUsdcBlue.loanToken,
    });
    const handle = createMockClient(mainnet);
    const { morpho } = getChainAddresses(mainnet.id);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "nonce",
      result: 0n,
    });
    mockRead(handle, {
      address: sharedTokenParams.loanToken,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    vi.mocked(fetchToken).mockResolvedValue({
      address: sharedTokenParams.loanToken,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      fromUsd: () => 0n,
      toUsd: () => 0n,
    });
    const positionData = new AccrualPosition(
      {
        user: USER,
        supplyShares: 0n,
        borrowShares: 1n,
        collateral: 1_000_000n,
      },
      new Market({
        params: sharedTokenParams,
        totalSupplyAssets: 1_000_000n,
        totalBorrowAssets: 1n,
        totalSupplyShares: 1_000_000n,
        totalBorrowShares: 1n,
        lastUpdate: 1_700_000_000n,
        fee: 0n,
        price: ORACLE_PRICE_SCALE,
      }),
    );
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(sharedTokenParams, mainnet.id);

    const requirements = await market
      .supplyCollateralBorrow({
        amount: 100n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData,
        reallocations: [
          {
            type: "bluePublicAllocator",
            allocator: CbbtcUsdcBlue.irm,
            vault: CbbtcUsdcBlue.oracle,
            from: { type: "idle" },
            to: { adapter: CbbtcUsdcBlue.collateralToken },
            assets: 10n,
            penalty: 500_000_000_000_000_000n,
          },
        ],
      })
      .getRequirements({ useSimplePermit: true });

    const permits = requirements.filter(isRequirementSignature);
    expect(permits).toHaveLength(1);
    expect(permits[0]?.action).toMatchObject({
      type: "permit",
      args: { amount: 105n },
    });
  });
});
