import type { IPosition } from "@morpho-org/blue-sdk";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import nock from "nock";
import type { Address } from "viem";

export function nockBlueApi(
  {
    ethPriceUsd,
    collateralToken,
    loanToken,
    collateralPriceUsd,
    loanPriceUsd,
    position,
  }: {
    ethPriceUsd: number;
    collateralToken: { address: Address; decimals: number };
    loanToken: { address: Address; decimals: number };
    collateralPriceUsd: number;
    loanPriceUsd: number;
    position: IPosition;
  },
  forPreLiquidations = false,
) {
  const marketAssetsData = {
    markets: {
      pageInfo: {
        count: 1,
        countTotal: 1,
        limit: 100,
        skip: 0,
      },
      items: [
        {
          uniqueKey: position.marketId,
          collateralAsset: {
            address: collateralToken.address,
            decimals: collateralToken.decimals,
            priceUsd: collateralPriceUsd,
          },
          loanAsset: {
            address: loanToken.address,
            decimals: loanToken.decimals,
            priceUsd: loanPriceUsd,
          },
        },
      ],
    },
  };

  nock(BLUE_API_BASE_URL)
    // request for whitelisted marketIds
    .post("/graphql")
    .reply(200, {
      data: { markets: { items: [{ uniqueKey: position.marketId }] } },
    })
    // request for wNative price
    .post("/graphql")
    .reply(200, {
      data: {
        assetByAddress: {
          priceUsd: ethPriceUsd,
        },
      },
    })
    // request for market assets
    .post("/graphql")
    .reply(200, { data: marketAssetsData })
    // request for liquidatable positions
    .post("/graphql")
    .reply(200, {
      data: {
        marketPositions: {
          pageInfo: {
            count: 1,
            countTotal: 1,
            limit: 100,
            skip: 0,
          },
          items: [
            {
              user: { address: position.user },
              market: {
                uniqueKey: position.marketId,
              },
              state: {
                supplyShares: position.supplyShares,
                borrowShares: position.borrowShares,
                collateral: position.collateral,
              },
            },
          ],
        },
      },
    });

  if (forPreLiquidations) {
    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, { data: marketAssetsData });
  }
}
