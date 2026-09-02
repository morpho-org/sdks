import fc from "fast-check";
import { maxUint256, serializeSignature, toHex, zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import {
  type BundlesFundingArgs,
  BundlesPermitMismatchError,
  MixedBundlesFundingError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
} from "../../types/index.js";
import { getBundlesSharesPermit, resolveBundlesFunding } from "./common.js";

const owner = "0x0000000000000000000000000000000000000001" as const;
const vault = "0x0000000000000000000000000000000000000002" as const;
const spender = "0x0000000000000000000000000000000000000003" as const;
const signature = serializeSignature({
  r: toHex(1n, { size: 32 }),
  s: toHex(2n, { size: 32 }),
  yParity: 0,
});

describe("resolveBundlesFunding", () => {
  test("behavior: preserves exclusive token and native amounts", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: maxUint256 }),
        fc.boolean(),
        (assets, native) => {
          const funding: BundlesFundingArgs = native
            ? { nativeAmount: assets }
            : { amount: assets };
          expect(resolveBundlesFunding(funding)).toEqual({
            assets,
            value: native ? assets : 0n,
          });
        },
      ),
      { numRuns: 100, seed: 20_260_909 },
    );
  });

  test("error: typed runtime boundaries", () => {
    expect(() =>
      resolveBundlesFunding({
        amount: 1n,
        nativeAmount: 1n,
      } as unknown as BundlesFundingArgs),
    ).toThrow(MixedBundlesFundingError);
    expect(() => resolveBundlesFunding({ amount: -1n })).toThrow(
      NegativeInputError,
    );
    expect(() => resolveBundlesFunding({ nativeAmount: 0n })).toThrow(
      NonPositiveInputError,
    );
  });
});

describe("getBundlesSharesPermit", () => {
  const permit = {
    args: {
      owner,
      asset: vault,
      amount: 7n,
      nonce: 9n,
      deadline: 11n,
      signature,
    },
    action: {
      type: "permit",
      args: { spender, amount: 7n, deadline: 11n },
    },
  } satisfies PermitRequirementSignature;

  test("default", () => {
    expect(getBundlesSharesPermit({ vault, deadline: 13n })).toEqual({
      value: 0n,
      nonce: 0n,
      deadline: 13n,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    });
    expect(
      getBundlesSharesPermit({
        vault,
        owner,
        spender,
        amount: 7n,
        deadline: 13n,
        requirementSignature: permit,
      }),
    ).toMatchObject({ value: 7n, nonce: 9n, deadline: 11n, v: 27 });
  });

  test("error: BundlesPermitMismatchError", () => {
    expect(() =>
      getBundlesSharesPermit({
        vault,
        owner,
        spender,
        amount: 8n,
        deadline: 13n,
        requirementSignature: permit,
      }),
    ).toThrow(BundlesPermitMismatchError);
  });
});
