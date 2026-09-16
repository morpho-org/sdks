import { describe, expect, test } from "vitest";
import {
  ADAPTER,
  market,
  marketParams,
  RECIPIENT,
  vaultV2AdapterInput,
} from "../../__test__/fixtures.js";
import { UnsupportedMarketIrmError } from "../../errors.js";
import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "./VaultV2MorphoMarketV1AdapterV2.js";

describe("AccrualVaultV2MorphoMarketV1AdapterV2", () => {
  test("accrueInterest keeps markets with missing supply shares unchanged", () => {
    const m = market({
      params: marketParams({ irm: RECIPIENT }),
      rateAtTarget: undefined,
    });
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...vaultV2AdapterInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: {},
      },
      [m],
    );

    const accrued = adapter.accrueInterest(m.lastUpdate + 1n);

    expect(accrued).not.toBe(adapter);
    expect(accrued.markets[0]).toBe(m);
  });

  test("error: UnsupportedMarketIrmError", () => {
    const m = market({
      params: marketParams({ irm: RECIPIENT }),
      rateAtTarget: undefined,
      totalBorrowAssets: 1n,
      totalBorrowShares: 1n,
    });
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...vaultV2AdapterInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: { [m.id]: 100n },
      },
      [m],
    );

    expect(() => adapter.accrueInterest(m.lastUpdate + 1n)).toThrow(
      UnsupportedMarketIrmError,
    );
  });
});
