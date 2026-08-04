import fc from "fast-check";
import {
  type Address,
  concatHex,
  maxUint256,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InKindRedeemPermitMismatchError,
  type PermitRequirementSignature,
} from "../../types/index.js";
import { getVaultExitBundlesV1PermitStruct } from "./getVaultExitBundlesV1PermitStruct.js";

const vault = "0x0000000000000000000000000000000000000001" as const;
const owner = "0x0000000000000000000000000000000000000002" as const;
const spender = "0x0000000000000000000000000000000000000003" as const;
const signatureParts = {
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
  yParity: 1,
} as const;
const serializedSignature = serializeSignature(signatureParts);
const yParitySerializedSignature = concatHex([
  signatureParts.r,
  signatureParts.s,
  "0x01",
]);
const compactSignature = serializeCompactSignature(
  signatureToCompactSignature(signatureParts),
);

const permit = (
  overrides: Partial<PermitRequirementSignature["args"]> = {},
  actionOverrides: Partial<{
    readonly spender: Address;
    readonly amount: bigint;
    readonly deadline: bigint;
  }> = {},
): PermitRequirementSignature => ({
  args: {
    owner,
    nonce: 7n,
    asset: vault,
    signature: serializedSignature,
    amount: maxUint256,
    deadline: 1_900_000_000n,
    ...overrides,
  },
  action: {
    type: "permit",
    args: {
      spender,
      amount: maxUint256,
      deadline: 1_900_000_000n,
      ...actionOverrides,
    },
  },
});

describe("getVaultExitBundlesV1PermitStruct", () => {
  test("default: encodes the empty-permit sentinel", () => {
    expect(
      getVaultExitBundlesV1PermitStruct({
        vault,
        deadline: 1_900_000_000n,
      }),
    ).toEqual({
      value: maxUint256,
      nonce: 0n,
      deadline: 1_900_000_000n,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    });
  });

  test.each([
    { label: "standard serialized", signature: serializedSignature },
    { label: "y-parity serialized", signature: yParitySerializedSignature },
    { label: "EIP-2098 compact", signature: compactSignature },
  ])("behavior: encodes a $label max-share permit", ({ signature }) => {
    expect(
      getVaultExitBundlesV1PermitStruct({
        vault,
        deadline: 1_900_000_000n,
        requirementSignature: permit({ signature }),
      }),
    ).toEqual({
      value: maxUint256,
      nonce: 7n,
      deadline: 1_900_000_000n,
      v: 28,
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
    });
  });

  test.each([
    {
      label: "asset",
      signature: permit({
        asset: "0x0000000000000000000000000000000000000099",
      }),
    },
    { label: "amount", signature: permit({ amount: maxUint256 - 1n }) },
  ])("error: rejects mismatched permit $label", ({ signature }) => {
    expect(() =>
      getVaultExitBundlesV1PermitStruct({
        vault,
        deadline: 1_900_000_000n,
        requirementSignature: signature,
      }),
    ).toThrow(InKindRedeemPermitMismatchError);
  });

  test("behavior: leaves non-security permit metadata validation onchain", () => {
    const permitDeadline = 1_900_000_001n;

    const encoded = getVaultExitBundlesV1PermitStruct({
      vault,
      deadline: 1_900_000_000n,
      requirementSignature: permit(
        {
          owner: "0x0000000000000000000000000000000000000099",
          deadline: permitDeadline,
        },
        {
          spender: "0x0000000000000000000000000000000000000099",
          amount: maxUint256 - 1n,
          deadline: permitDeadline + 1n,
        },
      ),
    });

    expect(encoded.deadline).toBe(permitDeadline);
  });

  test("error: rejects a Permit2 signature", () => {
    const requirementSignature: PermitRequirementSignature = {
      args: {
        owner,
        nonce: 7n,
        asset: vault,
        signature: serializedSignature,
        amount: maxUint256,
        deadline: 1_900_000_000n,
        expiration: 1_900_000_000n,
      },
      action: {
        type: "permit2",
        args: {
          spender,
          amount: maxUint256,
          deadline: 1_900_000_000n,
          expiration: 1_900_000_000n,
        },
      },
    };

    expect(() =>
      getVaultExitBundlesV1PermitStruct({
        vault,
        deadline: 1_900_000_000n,
        requirementSignature,
      }),
    ).toThrow(InKindRedeemPermitMismatchError);
  });

  test("error: rejects malformed signatures and preserves the parser cause", () => {
    let thrown: unknown;
    try {
      getVaultExitBundlesV1PermitStruct({
        vault,
        deadline: 1_900_000_000n,
        requirementSignature: permit({ signature: "0x12" }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InKindRedeemPermitMismatchError);
    if (!(thrown instanceof InKindRedeemPermitMismatchError)) throw thrown;
    expect(thrown.cause).toBeInstanceOf(Error);
  });

  test("behavior: permit tuple round-trips across valid scalar inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 2n ** 128n }),
        fc.bigInt({ min: 0n, max: 2n ** 128n }),
        (deadline, nonce) => {
          const encoded = getVaultExitBundlesV1PermitStruct({
            vault,
            deadline,
            requirementSignature: permit({ deadline, nonce }, { deadline }),
          });

          expect(encoded).toMatchObject({
            value: maxUint256,
            nonce,
            deadline,
            v: 28,
          });
        },
      ),
      { numRuns: 50, seed: 20_260_727 },
    );
  });
});
