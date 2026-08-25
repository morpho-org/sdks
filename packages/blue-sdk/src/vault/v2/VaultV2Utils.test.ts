import { describe, expect, test } from "vitest";
import { MathLib } from "../../math/index.js";
import { CapacityLimitReason } from "../../utils.js";
import { VaultV2Utils } from "./VaultV2Utils.js";

const allocation = {
  id: `0x${"01".repeat(32)}` as const,
  absoluteCap: 1_000n,
  relativeCap: MathLib.WAD,
  allocation: 400n,
};

describe("VaultV2Utils.allocationHeadroom", () => {
  test("default: returns absolute-cap headroom", () => {
    expect(VaultV2Utils.allocationHeadroom(allocation, 1_000n)).toStrictEqual({
      value: 600n,
      limiter: CapacityLimitReason.vaultV2_absoluteCap,
    });
  });

  test("behavior: returns relative-cap headroom when it binds", () => {
    expect(
      VaultV2Utils.allocationHeadroom(
        { ...allocation, relativeCap: MathLib.WAD / 2n },
        1_000n,
      ),
    ).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.vaultV2_relativeCap,
    });
  });

  test("behavior: floors caps below the live allocation at zero", () => {
    expect(
      VaultV2Utils.allocationHeadroom(
        {
          ...allocation,
          absoluteCap: 300n,
          relativeCap: MathLib.WAD / 4n,
        },
        1_000n,
      ),
    ).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.vaultV2_absoluteCap,
    });
  });

  test("behavior: WAD relative caps do not constrain absolute headroom", () => {
    expect(
      VaultV2Utils.allocationHeadroom(
        { ...allocation, absoluteCap: 2_000n, relativeCap: MathLib.WAD },
        500n,
      ),
    ).toStrictEqual({
      value: 1_600n,
      limiter: CapacityLimitReason.vaultV2_absoluteCap,
    });
  });
});
