import fc from "fast-check";
import {
  decodeAbiParameters,
  maxUint256,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
  toHex,
  zeroHash,
} from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import type {
  BundleSharesPermit,
  BundlesSharesPermit,
  VaultExitBundlesV1PermitStruct,
} from "../../index.js";
import {
  type BundlesFundingArgs,
  BundlesPermitMismatchError,
  BundlesRequirementSignatureMismatchError,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  type Erc2612RequirementSignature,
  MixedBundlesFundingError,
  NegativeInputError,
  NonPositiveInputError,
  type Permit2AllowanceRequirementSignature,
  type Permit2SignatureTransferRequirementSignature,
  type PermitRequirementSignature,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import {
  getBundlesSharesPermit,
  getBundlesTokenPermit,
  resolveBundlesFunding,
  selectBundlesSharesRequirementSignature,
  selectBundlesTokenRequirementSignature,
} from "./common.js";

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
      args: { spender, amount: 7n, deadline: 11n, nonce: 9n },
    },
  } satisfies PermitRequirementSignature;

  test("default", () => {
    expectTypeOf<
      ReturnType<typeof getBundlesSharesPermit>
    >().toEqualTypeOf<BundleSharesPermit>();
    expectTypeOf<VaultExitBundlesV1PermitStruct>().toEqualTypeOf<BundleSharesPermit>();
    expectTypeOf<BundlesSharesPermit>().toEqualTypeOf<BundleSharesPermit>();
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

describe("getBundlesTokenPermit", () => {
  const params = { userAddress: owner, token: vault, spender, amount: 7n };
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
      args: { spender, amount: 7n, deadline: 11n, nonce: 9n },
    },
  } satisfies Erc2612RequirementSignature;
  const permit2 = {
    args: { ...permit.args, signature: "0x1234" },
    action: {
      type: "permit2SignatureTransfer",
      args: { spender, amount: 7n, deadline: 11n, nonce: 9n },
    },
  } satisfies Permit2SignatureTransferRequirementSignature;

  test("default: returns the empty permit for allowance funding", () => {
    expect(getBundlesTokenPermit(params)).toEqual({ kind: 0, data: "0x" });
  });

  test.each([
    { label: "serialized", signature },
    {
      label: "compact",
      signature: serializeCompactSignature(
        signatureToCompactSignature({
          r: toHex(1n, { size: 32 }),
          s: toHex(2n, { size: 32 }),
          yParity: 0,
        }),
      ),
    },
  ])(
    "behavior: encodes a $label ERC-2612 permit",
    ({ signature: encodedSignature }) => {
      const tokenPermit = getBundlesTokenPermit({
        ...params,
        requirementSignature: {
          ...permit,
          args: { ...permit.args, signature: encodedSignature },
        },
      });
      expect(tokenPermit.kind).toBe(1);
      expect(
        decodeAbiParameters(
          [
            { type: "uint256" },
            { type: "uint8" },
            { type: "bytes32" },
            { type: "bytes32" },
          ],
          tokenPermit.data,
        ),
      ).toEqual([11n, 27, toHex(1n, { size: 32 }), toHex(2n, { size: 32 })]);
    },
  );

  test("behavior: encodes Permit2 SignatureTransfer with the raw signature", () => {
    const tokenPermit = getBundlesTokenPermit({
      ...params,
      requirementSignature: permit2,
    });
    expect(tokenPermit.kind).toBe(2);
    expect(
      decodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
        tokenPermit.data,
      ),
    ).toEqual([9n, 11n, "0x1234"]);
  });

  test.each([
    { overrides: { userAddress: spender }, error: DepositOwnerMismatchError },
    { overrides: { token: spender }, error: DepositAssetMismatchError },
    { overrides: { amount: 8n }, error: DepositAmountMismatchError },
    { overrides: { spender: owner }, error: DepositSpenderMismatchError },
  ])("error: $error.name", ({ overrides, error }) => {
    expect(() =>
      getBundlesTokenPermit({
        ...params,
        ...overrides,
        requirementSignature: permit,
      }),
    ).toThrow(error);
  });

  test("error: DepositAmountMismatchError for an inconsistent action amount", () => {
    expect(() =>
      getBundlesTokenPermit({
        ...params,
        requirementSignature: {
          ...permit,
          action: {
            ...permit.action,
            args: { ...permit.action.args, amount: 8n },
          },
        },
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test.each([
    {
      field: "deadline",
      requirementSignature: {
        ...permit,
        action: {
          ...permit.action,
          args: { ...permit.action.args, deadline: 12n },
        },
      },
    },
    {
      field: "nonce",
      requirementSignature: {
        ...permit2,
        action: {
          ...permit2.action,
          args: { ...permit2.action.args, nonce: 10n },
        },
      },
    },
  ])(
    "error: BundlesRequirementSignatureMismatchError for inconsistent $field",
    ({ requirementSignature }) => {
      expect(() =>
        getBundlesTokenPermit({ ...params, requirementSignature }),
      ).toThrow(BundlesRequirementSignatureMismatchError);
    },
  );

  test("error: BundlesRequirementSignatureMismatchError preserves the malformed-signature cause", () => {
    let thrown: unknown;
    try {
      getBundlesTokenPermit({
        ...params,
        requirementSignature: {
          ...permit,
          args: { ...permit.args, signature: "0x1234" },
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BundlesRequirementSignatureMismatchError);
    expect(thrown).toHaveProperty(
      "cause",
      expect.any(BundlesPermitMismatchError),
    );
  });

  test("error: UnexpectedRequirementSignatureError for Permit2 AllowanceTransfer", () => {
    const requirementSignature = {
      args: { ...permit.args, expiration: 11n },
      action: {
        type: "permit2",
        args: { ...permit.action.args, expiration: 11n },
      },
    } satisfies Permit2AllowanceRequirementSignature;
    expect(() =>
      getBundlesTokenPermit({ ...params, requirementSignature }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });
});

describe("selectBundlesSharesRequirementSignature", () => {
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
      args: { spender, amount: 7n, deadline: 11n, nonce: 9n },
    },
  } satisfies PermitRequirementSignature;

  test("default", () => {
    expect(
      selectBundlesSharesRequirementSignature([permit], {
        requiredShareAllowance: 7n,
        expectedRequirement: permit.action,
      }),
    ).toEqual(permit);
  });

  test("error: BundlesPermitMismatchError", () => {
    expect(() =>
      selectBundlesSharesRequirementSignature([permit], {
        requiredShareAllowance: undefined,
      }),
    ).toThrow(BundlesPermitMismatchError);
    expect(() =>
      selectBundlesSharesRequirementSignature([permit], {
        requiredShareAllowance: 8n,
        expectedRequirement: permit.action,
      }),
    ).toThrow(BundlesPermitMismatchError);
    expect(() =>
      selectBundlesSharesRequirementSignature([permit], {
        requiredShareAllowance: 7n,
        expectedRequirement: {
          ...permit.action,
          args: { ...permit.action.args, nonce: 10n },
        },
      }),
    ).toThrow(BundlesPermitMismatchError);
  });
});

describe("selectBundlesTokenRequirementSignature", () => {
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
      args: { spender, amount: 7n, deadline: 11n, nonce: 9n },
    },
  } satisfies PermitRequirementSignature;

  test("default", () => {
    expect(
      selectBundlesTokenRequirementSignature([permit], permit.action),
    ).toEqual(permit);
  });

  test("error: rejects signatures outside the prepared requirement", () => {
    expect(() => selectBundlesTokenRequirementSignature([permit])).toThrow(
      BundlesPermitMismatchError,
    );
    expect(() =>
      selectBundlesTokenRequirementSignature([permit], {
        ...permit.action,
        args: { ...permit.action.args, deadline: 12n },
      }),
    ).toThrow(BundlesPermitMismatchError);
  });
});
