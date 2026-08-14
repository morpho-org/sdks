import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";
import nock from "nock";
import { type Address, zeroAddress, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, test } from "vitest";
import { InvalidVaultV2LiquidityApiResponseError } from "../errors.js";
import { fetchRestVaultV2Allocations } from "./rest.js";

const VAULT: Address = "0x0000000000000000000000000000000000000001";

const cap = {
  cap_id: zeroHash,
  cap_data: "0x",
  allocated_assets: "0",
  absolute_cap: "1000",
  relative_cap_wad: "1000000000000000000",
} as const;

describe.sequential("fetchRestVaultV2Allocations", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  test.each([
    ["market_v1 cap without market_id", { ...cap, cap_type: "market_v1" }],
    [
      "collateral cap without collateral_address",
      { ...cap, cap_type: "collateral" },
    ],
  ] as const)(
    "error: InvalidVaultV2LiquidityApiResponseError for %s",
    async (_case, malformedCap) => {
      const api = nock(BLUE_API_BASE_URL)
        .get(`/v0/vaults-v2/${mainnet.id}:${VAULT}/allocations`)
        .reply(200, {
          data: {
            chain_id: mainnet.id,
            vault_address: VAULT,
            last_indexed_block: "1",
            allocations: [
              {
                adapter_address: zeroAddress,
                adapter_kind: "morpho_market_v1_v2",
                caps: [malformedCap],
              },
            ],
            unscoped_caps: [],
          },
        });

      await expect(
        fetchRestVaultV2Allocations(mainnet.id, VAULT),
      ).rejects.toBeInstanceOf(InvalidVaultV2LiquidityApiResponseError);
      api.done();
    },
  );
});
