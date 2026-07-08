import { ChainId, registerCustomAddresses } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { describe, expect } from "vitest";
import { fetchRatifierInfo } from "../../src/fetch/Ratifier.js";
import { test } from "./setup.js";

const ecrecoverRatifier =
  "0xd6e70365C8E8DDa9a4ca662C07bbE663b017755E" as Address;
const setterRatifier = "0x800B5F12A61B8198a5a6EfD794Cac6699B294d63" as Address;
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

registerCustomAddresses({
  addresses: {
    [ChainId.BaseMainnet]: {
      midnight: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
      midnightBundles: "0x091183d729BE9f808c212b475E387A12E67850A7",
      midnightMempool: "0xdD6DCE32e21f7b020898a8258dA37355b4017993",
      ecrecoverRatifier,
      setterRatifier,
    },
  },
});

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
