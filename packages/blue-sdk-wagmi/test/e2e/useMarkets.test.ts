import { describe, expect } from "vitest";

import { ChainId, Market } from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { useMarkets } from "../../src/index.js";
import { test } from "./setup.js";

const { eth_idle, dai_sUsde } = markets[ChainId.EthMainnet];

describe("useMarkets", () => {
  test("should render", async ({ config }) => {
    const { result } = await renderHook(config, () =>
      useMarkets({ marketIds: [dai_sUsde.id, eth_idle.id] }),
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(result.current).toEqual({
      data: {
        [eth_idle.id]: new Market({
          fee: 0n,
          lastUpdate: 1711392767n,
          params: eth_idle,
          price: undefined,
          rateAtTarget: undefined,
          totalBorrowAssets: 0n,
          totalBorrowShares: 0n,
          totalSupplyAssets: 449966906079134338n,
          totalSupplyShares: 449966906079134338000000n,
        }),
        [dai_sUsde.id]: new Market({
          fee: 0n,
          lastUpdate: 1710859535n,
          params: dai_sUsde,
          price: 1036607942310354842000000000000000000n,
          rateAtTarget: 1985402573n,
          totalBorrowAssets: 9019752098990591n,
          totalBorrowShares: 9000000000000000000000n,
          totalSupplyAssets: 10021946776656213n,
          totalSupplyShares: 10000000000000000000000n,
        }),
      },
      error: {
        [eth_idle.id]: null,
        [dai_sUsde.id]: null,
      },
      isFetching: {
        [eth_idle.id]: false,
        [dai_sUsde.id]: false,
      },
      isFetchingAny: false,
    });
  });
});
