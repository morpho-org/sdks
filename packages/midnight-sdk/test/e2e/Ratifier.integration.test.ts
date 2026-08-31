import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";
import { fetchRatifierInfo } from "../../src/fetch/Ratifier.js";
import { test } from "./setup.js";

const ecrecoverRatifier = getChainAddress(
  ChainId.BaseMainnet,
  "ecrecoverRatifier",
);
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");

describe("fetchRatifierInfo on fork", () => {
  test("routes EOAs through the Ecrecover ratifier", async ({ client }) => {
    const info = await fetchRatifierInfo(client, {
      maker: client.account.address,
    });

    expect(info).toEqual({
      type: "ecrecover",
      ratifier: ecrecoverRatifier,
    });
  });

  test("routes deployed-code makers through the Setter ratifier", async ({
    client,
  }) => {
    const info = await fetchRatifierInfo(client, { maker: usdc });

    expect(info).toEqual({
      type: "setter",
      ratifier: setterRatifier,
    });
  });
});
