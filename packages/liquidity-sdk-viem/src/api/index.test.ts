import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";
import { ClientError, GraphQLClient } from "graphql-request";
import nock from "nock";
import { afterEach, describe, expect, test } from "vitest";
import { ApiTypes, apiSdk } from "./index.js";

describe("apiSdk", () => {
  test("exposes a getMarkets method", () => {
    expect(typeof apiSdk.getMarkets).toBe("function");
  });

  test("ApiTypes is re-exported as a namespace", () => {
    expect(ApiTypes).toBeDefined();
    expect(typeof ApiTypes).toBe("object");
  });
});

describe("apiSdk.getMarkets via nock", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test("posts a GraphQL query to BLUE_API_GRAPHQL_URL and parses the response", async () => {
    const fixture = {
      data: {
        markets: {
          items: [
            {
              uniqueKey: "0xdeadbeef",
              targetBorrowUtilization: "900000000000000000",
              publicAllocatorSharedLiquidity: [],
              supplyingVaults: [],
            },
          ],
        },
      },
    };
    nock(new URL(BLUE_API_GRAPHQL_URL).origin)
      .post("/graphql")
      .reply(200, fixture);

    const result = await apiSdk.getMarkets({
      chainId: 1,
      marketIds: ["0xdeadbeef"],
    });
    expect(result.markets.items).toHaveLength(1);
    expect(result.markets.items?.[0]?.uniqueKey).toBe("0xdeadbeef");
  });

  test("handles empty items array", async () => {
    nock(new URL(BLUE_API_GRAPHQL_URL).origin)
      .post("/graphql")
      .reply(200, { data: { markets: { items: [] } } });

    const result = await apiSdk.getMarkets({ chainId: 1, marketIds: [] });
    expect(result.markets.items).toEqual([]);
  });

  test("propagates GraphQL errors as ClientError", async () => {
    nock(new URL(BLUE_API_GRAPHQL_URL).origin)
      .post("/graphql")
      .reply(200, { errors: [{ message: "boom" }] });

    // graphql-request throws its own typed `ClientError` for response-shaped
    // errors; pinning the class catches a regression that swaps to a generic
    // Error or silently swallows the response.
    await expect(
      apiSdk.getMarkets({ chainId: 1, marketIds: [] }),
    ).rejects.toBeInstanceOf(ClientError);
  });
});

describe("getSdk + GraphQLClient end-to-end", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test("works with a custom GraphQLClient (different endpoint)", async () => {
    const customUrl = "https://custom.example.com/graphql";
    nock("https://custom.example.com")
      .post("/graphql")
      .reply(200, { data: { markets: { items: [] } } });

    const { getSdk } = await import("./sdk.js");
    const sdk = getSdk(new GraphQLClient(customUrl));
    const result = await sdk.getMarkets({ chainId: 1, marketIds: [] });
    expect(result).toBeDefined();
  });
});
