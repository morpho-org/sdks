import { fc, test } from "@fast-check/vitest";
import { VaultV2MidnightAdapterUtils } from "@morpho-org/blue-sdk";
import { MarketUtils } from "@morpho-org/midnight-sdk";
import { bytesToHex, getAddress, maxUint256 } from "viem";
import { describe, expect } from "vitest";

const address = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => getAddress(bytesToHex(bytes)));
const uint = (max: bigint) => fc.bigInt({ min: 0n, max });

const marketArbitrary = fc.record({
  chainId: uint(maxUint256),
  midnight: address,
  loanToken: address,
  // midnight-sdk only hashes markets that pass its collateral validation.
  collateralParams: fc
    .uniqueArray(
      fc.record({
        token: address,
        lltv: uint(860000000000000000n),
        liquidationCursor: uint(300000000000000000n),
        oracle: address,
      }),
      { minLength: 1, maxLength: 3, selector: ({ token }) => token },
    )
    // Midnight rejects unsorted collaterals onchain (`CollateralParamsNotSorted`) and midnight-sdk sorts them.
    .map((params) =>
      [...params].sort((a, b) =>
        a.token.toLowerCase() < b.token.toLowerCase() ? -1 : 1,
      ),
    ),
  maturity: uint(maxUint256),
  rcfThreshold: uint(maxUint256),
  enterGate: address,
  liquidatorGate: address,
});

// blue-sdk can't depend on midnight-sdk, so this package pins the two market-id implementations together.
describe("VaultV2MidnightAdapterUtils.marketId", () => {
  test.prop([marketArbitrary], { numRuns: 200 })(
    "behavior: matches midnight-sdk MarketUtils.toId",
    (market) => {
      expect(VaultV2MidnightAdapterUtils.marketId(market)).toBe(
        MarketUtils.toId(market),
      );
    },
  );
});
