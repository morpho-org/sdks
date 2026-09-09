import {
  AccrualPosition,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { morphoViemExtension } from "../../client/index.js";
import type { VaultV2BlueReallocation } from "../../types/index.js";

const userAddress: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const marketParams = new MarketParams({
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: "0x1111111111111111111111111111111111111111",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
const positionData = new AccrualPosition(
  {
    user: userAddress,
    supplyShares: 0n,
    borrowShares: 0n,
    collateral: 10n ** 24n,
  },
  new Market({
    params: marketParams,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 23n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 23n,
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
  }),
);
const reallocations = [
  {
    vault: "0x2222222222222222222222222222222222222222",
    from: { type: "idle" },
    to: { adapter: "0x3333333333333333333333333333333333333333" },
    assets: 10n,
    penalty: MathLib.WAD / 10n,
  },
] satisfies readonly VaultV2BlueReallocation[];

const mockUnauthorized = (handle: ReturnType<typeof createMockClient>) => {
  mockRead(handle, {
    address: getChainAddress(mainnet.id, "morpho"),
    abi: blueAbi,
    functionName: "isAuthorized",
    result: false,
  });
};

describe("MorphoBlue BluePublicAllocator requirements", () => {
  test("borrow: penalties are deducted from proceeds without a token approval", async () => {
    const handle = createMockClient(mainnet);
    mockUnauthorized(handle);
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);
    const action = market.borrow({
      userAddress,
      positionData,
      borrowAssets: 100n,
      reallocations: reallocations.values(),
      deadline: maxUint256,
    });

    expect(
      (await action.getRequirements()).map(
        ({ action: requirement }) => requirement.type,
      ),
    ).toEqual(["blueAuthorization"]);
    expect(action.buildTx().action.args.reallocationPenaltyAssets).toBe(1n);
  });

  test("supplyCollateralBorrow: requires collateral funding and Blue authorization only", async () => {
    const handle = createMockClient(mainnet);
    mockUnauthorized(handle);
    mockRead(handle, {
      address: marketParams.collateralToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);
    const action = market.supplyCollateralBorrow({
      userAddress,
      positionData,
      collateralAssets: 10n,
      borrowAssets: 100n,
      reallocations,
      deadline: maxUint256,
    });

    const requirements = await action.getRequirements();
    expect(
      requirements.map(({ action: requirement }) => requirement.type),
    ).toEqual(["erc20Approval", "blueAuthorization"]);
    expect(requirements[0]).toMatchObject({
      to: marketParams.collateralToken,
      action: {
        args: {
          spender: getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
        },
      },
    });
  });
});
