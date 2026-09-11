import fc from "fast-check";
import {
  maxUint256,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
  toHex,
  zeroHash,
} from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  type BundleSharesPermit,
  BundlesPermitMismatchError,
  type BundlesSharesPermit,
  type Erc2612RequirementSignature,
  emptySharesPermit,
  InputExceedsMaxError,
  NonPositiveInputError,
  toSharesPermitStruct,
  type VaultExitBundlesV1PermitStruct,
  validateSharesPermit,
} from "../../index.js";

const vault = "0x0000000000000000000000000000000000000001";
const owner = "0x0000000000000000000000000000000000000002";
const spender = "0x0000000000000000000000000000000000000003";
const other = "0x0000000000000000000000000000000000000004";
const expected = {
  vault,
  owner,
  spender,
  shareAllowance: 7n,
  deadline: 11n,
} as const;

const makeSignature = (): Erc2612RequirementSignature => ({
  args: {
    owner,
    asset: vault,
    amount: 7n,
    nonce: 9n,
    deadline: 11n,
    signature: serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    }),
  },
  action: {
    type: "permit",
    args: { spender, amount: 7n, nonce: 9n, deadline: 11n },
  },
});

describe("emptySharesPermit", () => {
  test("default", () => {
    const result = emptySharesPermit(13n);
    expect(result).toEqual({
      value: 0n,
      nonce: 0n,
      deadline: 13n,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(emptySharesPermit(13n)).not.toBe(result);
    expectTypeOf(result).toEqualTypeOf<BundleSharesPermit>();
    expectTypeOf<VaultExitBundlesV1PermitStruct>().toEqualTypeOf<BundleSharesPermit>();
    expectTypeOf<BundlesSharesPermit>().toEqualTypeOf<BundleSharesPermit>();
  });
});

describe("validateSharesPermit", () => {
  test("default", () => {
    const signature = makeSignature();
    const result = validateSharesPermit(signature, expected);
    expect(result).toEqual(signature);
    expect(result).not.toBe(signature);
    expect(result.args).not.toBe(signature.args);
    expect(result.action.args).not.toBe(signature.action.args);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.args)).toBe(true);
    expect(Object.isFrozen(result.action.args)).toBe(true);
    expect(Object.isFrozen(signature.args)).toBe(false);
    expect(Object.isFrozen(signature.action.args)).toBe(false);
  });

  test.each(["vault", "owner", "spender"] as const)(
    "error: BundlesPermitMismatchError for %s",
    (field) => {
      expect(() =>
        validateSharesPermit(makeSignature(), { ...expected, [field]: other }),
      ).toThrow(BundlesPermitMismatchError);
    },
  );

  test.for([
    ["amount", 8n],
    ["deadline", 12n],
    ["nonce", 10n],
  ] as const)(
    "error: BundlesPermitMismatchError for inconsistent %s metadata",
    ([field, value]) => {
      const signature = makeSignature();
      expect(() =>
        validateSharesPermit(
          {
            ...signature,
            args: { ...signature.args, [field]: value },
          },
          expected,
        ),
      ).toThrow(BundlesPermitMismatchError);
      expect(() =>
        validateSharesPermit(
          {
            ...signature,
            action: {
              ...signature.action,
              args: { ...signature.action.args, [field]: value },
            },
          },
          expected,
        ),
      ).toThrow(BundlesPermitMismatchError);
    },
  );

  test("error: BundlesPermitMismatchError for a different common deadline", () => {
    expect(() =>
      validateSharesPermit(makeSignature(), { ...expected, deadline: 12n }),
    ).toThrow(BundlesPermitMismatchError);
  });

  test("error: BundlesPermitMismatchError for an absent nonce", () => {
    const signature = makeSignature();
    expect(() =>
      validateSharesPermit(
        {
          ...signature,
          action: {
            ...signature.action,
            args: { ...signature.action.args, nonce: undefined },
          },
        },
        expected,
      ),
    ).toThrow(BundlesPermitMismatchError);
  });

  test("error: BundlesPermitMismatchError for a non-ERC-2612 signature", () => {
    const signature = makeSignature();
    // JavaScript callers can bypass the narrowed TypeScript signature type.
    const invalid = {
      ...signature,
      action: { ...signature.action, type: "permit2" },
    } as unknown as Erc2612RequirementSignature;
    expect(() => validateSharesPermit(invalid, expected)).toThrow(
      BundlesPermitMismatchError,
    );
  });

  test.each([0n, -1n])(
    "error: NonPositiveInputError for share allowance %s",
    (shareAllowance) => {
      expect(() =>
        validateSharesPermit(makeSignature(), { ...expected, shareAllowance }),
      ).toThrow(NonPositiveInputError);
    },
  );

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      validateSharesPermit(makeSignature(), {
        ...expected,
        shareAllowance: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });
});

describe("toSharesPermitStruct", () => {
  test("default", () => {
    const signature = makeSignature();
    const result = toSharesPermitStruct(signature);
    expect(result).toEqual({
      value: 7n,
      nonce: 9n,
      deadline: 11n,
      v: 27,
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(signature)).toBe(false);
  });

  test("behavior: preserves uint256 permit fields for compact and serialized signatures", () => {
    fc.assert(
      fc.property(
        fc.record({
          amount: fc.bigInt({ min: 0n, max: maxUint256 }),
          nonce: fc.bigInt({ min: 0n, max: maxUint256 }),
          deadline: fc.bigInt({ min: 0n, max: maxUint256 }),
          compact: fc.boolean(),
          odd: fc.boolean(),
        }),
        ({ amount, nonce, deadline, compact, odd }) => {
          const parts = {
            r: toHex(1n, { size: 32 }),
            s: toHex(2n, { size: 32 }),
            yParity: odd ? 1 : 0,
          } as const;
          const encoded = compact
            ? serializeCompactSignature(signatureToCompactSignature(parts))
            : serializeSignature(parts);
          const signature = makeSignature();
          const result = toSharesPermitStruct({
            ...signature,
            args: {
              ...signature.args,
              amount,
              nonce,
              deadline,
              signature: encoded,
            },
          });
          expect(result).toEqual({
            value: amount,
            nonce,
            deadline,
            v: odd ? 28 : 27,
            r: parts.r,
            s: parts.s,
          });
        },
      ),
      { numRuns: 100, seed: 20_260_911 },
    );
  });

  test("error: BundlesPermitMismatchError", () => {
    const signature = makeSignature();
    expect(() =>
      toSharesPermitStruct({
        ...signature,
        args: { ...signature.args, signature: "0x01" },
      }),
    ).toThrow(BundlesPermitMismatchError);
  });
});
