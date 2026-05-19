import type { InputMarketParams, MarketId } from "@morpho-org/blue-sdk";
import { type Address, decodeFunctionData, parseEther } from "viem";
import { describe, expect, test } from "vitest";
import { metaMorphoAbi } from "./abis.js";
import { type InputAllocation, MetaMorphoAction } from "./MetaMorphoAction.js";

const ADDR_A: Address = "0x1111111111111111111111111111111111111111";
const ADDR_B: Address = "0x2222222222222222222222222222222222222222";
const ADDR_C: Address = "0x3333333333333333333333333333333333333333";

const PARAMS: InputMarketParams = {
  loanToken: ADDR_A,
  collateralToken: ADDR_B,
  oracle: ADDR_C,
  irm: "0x4444444444444444444444444444444444444444",
  lltv: parseEther("0.86"),
};

const ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as MarketId;

/** Decodes calldata back to (functionName, args) using metaMorphoAbi. */
const decode = (data: `0x${string}`) =>
  decodeFunctionData({ abi: metaMorphoAbi, data });

describe("MetaMorphoAction — configuration encoders", () => {
  test("setCurator", () => {
    const r = decode(MetaMorphoAction.setCurator(ADDR_A));
    expect(r.functionName).toBe("setCurator");
    expect(r.args).toEqual([ADDR_A]);
  });

  test("setIsAllocator (true)", () => {
    const r = decode(MetaMorphoAction.setIsAllocator(ADDR_A, true));
    expect(r.functionName).toBe("setIsAllocator");
    expect(r.args).toEqual([ADDR_A, true]);
  });

  test("setIsAllocator (false)", () => {
    const r = decode(MetaMorphoAction.setIsAllocator(ADDR_A, false));
    expect(r.args).toEqual([ADDR_A, false]);
  });

  test("setFeeRecipient", () => {
    const r = decode(MetaMorphoAction.setFeeRecipient(ADDR_A));
    expect(r.functionName).toBe("setFeeRecipient");
    expect(r.args).toEqual([ADDR_A]);
  });

  test("setSkimRecipient", () => {
    const r = decode(MetaMorphoAction.setSkimRecipient(ADDR_A));
    expect(r.functionName).toBe("setSkimRecipient");
    expect(r.args).toEqual([ADDR_A]);
  });

  test("setFee", () => {
    const r = decode(MetaMorphoAction.setFee(parseEther("0.05")));
    expect(r.functionName).toBe("setFee");
    expect(r.args).toEqual([parseEther("0.05")]);
  });
});

describe("MetaMorphoAction — timelock encoders", () => {
  test("submitTimelock", () => {
    const r = decode(MetaMorphoAction.submitTimelock(86400n));
    expect(r.functionName).toBe("submitTimelock");
    expect(r.args).toEqual([86400n]);
  });

  test("acceptTimelock (no args)", () => {
    const r = decode(MetaMorphoAction.acceptTimelock());
    expect(r.functionName).toBe("acceptTimelock");
    expect(r.args ?? []).toEqual([]);
  });

  test("revokePendingTimelock (no args)", () => {
    const r = decode(MetaMorphoAction.revokePendingTimelock());
    expect(r.functionName).toBe("revokePendingTimelock");
    expect(r.args ?? []).toEqual([]);
  });
});

describe("MetaMorphoAction — supply cap encoders", () => {
  test("submitCap", () => {
    const r = decode(MetaMorphoAction.submitCap(PARAMS, 1_000_000n));
    expect(r.functionName).toBe("submitCap");
    expect(r.args).toEqual([PARAMS, 1_000_000n]);
  });

  test("acceptCap", () => {
    const r = decode(MetaMorphoAction.acceptCap(PARAMS));
    expect(r.functionName).toBe("acceptCap");
    expect(r.args).toEqual([PARAMS]);
  });

  test("revokePendingCap", () => {
    const r = decode(MetaMorphoAction.revokePendingCap(ID));
    expect(r.functionName).toBe("revokePendingCap");
    expect(r.args).toEqual([ID]);
  });
});

describe("MetaMorphoAction — forced market removal encoders", () => {
  test("submitMarketRemoval", () => {
    const r = decode(MetaMorphoAction.submitMarketRemoval(PARAMS));
    expect(r.functionName).toBe("submitMarketRemoval");
    expect(r.args).toEqual([PARAMS]);
  });

  test("revokePendingMarketRemoval", () => {
    const r = decode(MetaMorphoAction.revokePendingMarketRemoval(ID));
    expect(r.functionName).toBe("revokePendingMarketRemoval");
    expect(r.args).toEqual([ID]);
  });
});

describe("MetaMorphoAction — guardian encoders", () => {
  test("submitGuardian", () => {
    const r = decode(MetaMorphoAction.submitGuardian(ADDR_A));
    expect(r.functionName).toBe("submitGuardian");
    expect(r.args).toEqual([ADDR_A]);
  });

  test("acceptGuardian (no args)", () => {
    const r = decode(MetaMorphoAction.acceptGuardian());
    expect(r.functionName).toBe("acceptGuardian");
    expect(r.args ?? []).toEqual([]);
  });

  test("revokePendingGuardian (no args)", () => {
    const r = decode(MetaMorphoAction.revokePendingGuardian());
    expect(r.functionName).toBe("revokePendingGuardian");
    expect(r.args ?? []).toEqual([]);
  });
});

describe("MetaMorphoAction — management encoders", () => {
  test("skim", () => {
    const r = decode(MetaMorphoAction.skim(ADDR_A));
    expect(r.functionName).toBe("skim");
    expect(r.args).toEqual([ADDR_A]);
  });

  test("setSupplyQueue", () => {
    const queue = [ID, ID];
    const r = decode(MetaMorphoAction.setSupplyQueue(queue));
    expect(r.functionName).toBe("setSupplyQueue");
    expect(r.args).toEqual([queue]);
  });

  test("updateWithdrawQueue", () => {
    const indexes = [0n, 1n, 2n];
    const r = decode(MetaMorphoAction.updateWithdrawQueue(indexes));
    expect(r.functionName).toBe("updateWithdrawQueue");
    expect(r.args).toEqual([indexes]);
  });

  test("reallocate", () => {
    const allocations: InputAllocation[] = [
      { marketParams: PARAMS, assets: 1_000n },
      { marketParams: PARAMS, assets: 2_000n },
    ];
    const r = decode(MetaMorphoAction.reallocate(allocations));
    expect(r.functionName).toBe("reallocate");
    expect(r.args).toEqual([allocations]);
  });
});

describe("MetaMorphoAction — ERC4626 encoders", () => {
  test("mint", () => {
    const r = decode(MetaMorphoAction.mint(1_000n, ADDR_A));
    expect(r.functionName).toBe("mint");
    expect(r.args).toEqual([1_000n, ADDR_A]);
  });

  test("deposit", () => {
    const r = decode(MetaMorphoAction.deposit(2_000n, ADDR_A));
    expect(r.functionName).toBe("deposit");
    expect(r.args).toEqual([2_000n, ADDR_A]);
  });

  test("withdraw", () => {
    const r = decode(MetaMorphoAction.withdraw(3_000n, ADDR_A, ADDR_B));
    expect(r.functionName).toBe("withdraw");
    expect(r.args).toEqual([3_000n, ADDR_A, ADDR_B]);
  });

  test("redeem", () => {
    const r = decode(MetaMorphoAction.redeem(4_000n, ADDR_A, ADDR_B));
    expect(r.functionName).toBe("redeem");
    expect(r.args).toEqual([4_000n, ADDR_A, ADDR_B]);
  });
});

describe("MetaMorphoAction — calldata invariants", () => {
  test("every encoded call begins with 0x and is non-empty", () => {
    const samples = [
      MetaMorphoAction.setCurator(ADDR_A),
      MetaMorphoAction.setFee(0n),
      MetaMorphoAction.acceptTimelock(),
      MetaMorphoAction.skim(ADDR_A),
      MetaMorphoAction.deposit(1n, ADDR_A),
    ];
    for (const data of samples) {
      expect(data.startsWith("0x")).toBe(true);
      // 4-byte selector minimum (8 hex chars + "0x")
      expect(data.length).toBeGreaterThanOrEqual(10);
    }
  });

  test("distinct functions produce distinct selectors", () => {
    const a = MetaMorphoAction.setCurator(ADDR_A);
    const b = MetaMorphoAction.setFeeRecipient(ADDR_A);
    expect(a.slice(0, 10)).not.toBe(b.slice(0, 10));
  });
});

// Security-critical encoder snapshots. These pin the exact calldata
// produced for each privileged setter, so a regression that swaps in a
// different ABI (or quietly retypes an argument) is caught byte-for-byte.
// The snapshots include the 4-byte selector + 32-byte arg(s) ABI-encoded.
//
// Note: vitest 4 requires `toMatchInlineSnapshot` to be called via the
// test-context `expect` injected through the test callback. The parameter
// is renamed `tExpect` to avoid shadowing the file-level `expect` import
// (biome `noShadow`).
describe("MetaMorphoAction — privileged setter calldata snapshots", () => {
  test("setCurator pins calldata", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.setCurator(ADDR_A)).toMatchInlineSnapshot(
      `"0xe90956cf0000000000000000000000001111111111111111111111111111111111111111"`,
    );
  });

  test("setFee pins calldata", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.setFee(parseEther("0.05"))).toMatchInlineSnapshot(
      `"0x69fe0e2d00000000000000000000000000000000000000000000000000b1a2bc2ec50000"`,
    );
  });

  test("setFeeRecipient pins calldata", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.setFeeRecipient(ADDR_A)).toMatchInlineSnapshot(
      `"0xe74b981b0000000000000000000000001111111111111111111111111111111111111111"`,
    );
  });

  test("setIsAllocator pins calldata", ({ expect: tExpect }) => {
    tExpect(
      MetaMorphoAction.setIsAllocator(ADDR_A, true),
    ).toMatchInlineSnapshot(
      `"0xb192a84a00000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000001"`,
    );
  });

  test("submitGuardian pins calldata", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.submitGuardian(ADDR_A)).toMatchInlineSnapshot(
      `"0x9d6b4a450000000000000000000000001111111111111111111111111111111111111111"`,
    );
  });

  test("acceptGuardian pins calldata (no args)", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.acceptGuardian()).toMatchInlineSnapshot(
      `"0xa5f31d61"`,
    );
  });

  test("submitCap pins calldata", ({ expect: tExpect }) => {
    tExpect(
      MetaMorphoAction.submitCap(PARAMS, 1_000_000n),
    ).toMatchInlineSnapshot(
      `"0x3b24c2bf00000000000000000000000011111111111111111111111111111111111111110000000000000000000000002222222222222222222222222222222222222222000000000000000000000000333333333333333333333333333333333333333300000000000000000000000044444444444444444444444444444444444444440000000000000000000000000000000000000000000000000bef55718ad6000000000000000000000000000000000000000000000000000000000000000f4240"`,
    );
  });

  test("acceptCap pins calldata", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.acceptCap(PARAMS)).toMatchInlineSnapshot(
      `"0x6fda386800000000000000000000000011111111111111111111111111111111111111110000000000000000000000002222222222222222222222222222222222222222000000000000000000000000333333333333333333333333333333333333333300000000000000000000000044444444444444444444444444444444444444440000000000000000000000000000000000000000000000000bef55718ad60000"`,
    );
  });

  test("submitMarketRemoval pins calldata", ({ expect: tExpect }) => {
    tExpect(MetaMorphoAction.submitMarketRemoval(PARAMS)).toMatchInlineSnapshot(
      `"0x84755b5f00000000000000000000000011111111111111111111111111111111111111110000000000000000000000002222222222222222222222222222222222222222000000000000000000000000333333333333333333333333333333333333333300000000000000000000000044444444444444444444444444444444444444440000000000000000000000000000000000000000000000000bef55718ad60000"`,
    );
  });
});
