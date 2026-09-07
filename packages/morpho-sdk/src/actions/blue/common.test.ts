import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import {
  concatHex,
  decodeAbiParameters,
  getAddress,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  AmbiguousRequirementSignaturesError,
  type AuthorizationRequirementSignature,
  BlueBundlesV1RequirementSignatureMismatchError,
  type BlueBundlesV1TokenRequirementSignature,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  type Erc2612RequirementSignature,
  type Permit2AllowanceRequirementSignature,
  type Permit2TransferFromRequirementSignature,
} from "../../types/index.js";
import {
  getBlueBundlesV1SignedAuthorization,
  getBlueBundlesV1TokenPermit,
  selectBlueBundlesV1RequirementSignatures,
} from "./common.js";

const owner = getAddress("0x00000000000000000000000000000000000000A1");
const spender = getAddress("0x00000000000000000000000000000000000000B1");
const asset = getAddress("0x0000000000000000000000000000000000000011");

const permit = {
  args: {
    owner,
    nonce: 1n,
    asset,
    signature: "0x1234",
    amount: 5n,
    deadline: 123n,
  },
  action: { type: "permit", args: { spender, amount: 5n, deadline: 123n } },
} satisfies BlueBundlesV1TokenRequirementSignature;

const permit2TransferFrom = {
  args: {
    owner,
    nonce: 2n,
    asset,
    signature: "0x5678",
    amount: 5n,
    deadline: 123n,
  },
  action: {
    type: "permit2TransferFrom",
    args: { spender, amount: 5n, deadline: 123n },
  },
} satisfies BlueBundlesV1TokenRequirementSignature;

describe("selectBlueBundlesV1RequirementSignatures", () => {
  test("default: returns the single accepted token signature", () => {
    const selected = selectBlueBundlesV1RequirementSignatures([permit], {
      token: true,
    });
    expect(selected.token).toBe(permit);
  });

  test("error: AmbiguousRequirementSignaturesError when both a permit and a permit2TransferFrom target the single token slot", () => {
    // The single BlueBundlesV1 permit slot can carry one token signature; two competing ones would
    // otherwise silently drop one and mis-fund the bundle, so the selector must reject them.
    expect(() =>
      selectBlueBundlesV1RequirementSignatures([permit, permit2TransferFrom], {
        token: true,
      }),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });
});

// BlueBundlesV1 resolves the permit spender and the authorized operator from the chain registry, so
// the fixtures below sign against the real mainnet BlueBundlesV1 address to exercise the mismatch
// guards against a genuine value rather than an arbitrary placeholder.
const chainId = mainnet.id;
const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
const otherAddress = getAddress("0x00000000000000000000000000000000000000ff");
const permitAmount = 500n;
const permitDeadline = 1_900_000_000n;

// A single ECDSA signature expressed three ways: 65-byte with a 27/28 `v`, 65-byte with a 0/1
// y-parity, and the 64-byte EIP-2098 compact form. All three must reshape to the same `v = 28`.
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

const erc2612Permit = (
  argsOverrides: Partial<Erc2612RequirementSignature["args"]> = {},
  actionArgsOverrides: Partial<
    Erc2612RequirementSignature["action"]["args"]
  > = {},
): Erc2612RequirementSignature => ({
  args: {
    owner,
    nonce: 7n,
    asset,
    signature: serializedSignature,
    amount: permitAmount,
    deadline: permitDeadline,
    ...argsOverrides,
  },
  action: {
    type: "permit",
    args: {
      spender: blueBundlesV1,
      amount: permitAmount,
      deadline: permitDeadline,
      ...actionArgsOverrides,
    },
  },
});

const permit2TransferFromPermit = (
  argsOverrides: Partial<Permit2TransferFromRequirementSignature["args"]> = {},
  actionArgsOverrides: Partial<
    Permit2TransferFromRequirementSignature["action"]["args"]
  > = {},
): Permit2TransferFromRequirementSignature => ({
  args: {
    owner,
    nonce: 9n,
    asset,
    signature: serializedSignature,
    amount: permitAmount,
    deadline: permitDeadline,
    ...argsOverrides,
  },
  action: {
    type: "permit2TransferFrom",
    args: {
      spender: blueBundlesV1,
      amount: permitAmount,
      deadline: permitDeadline,
      ...actionArgsOverrides,
    },
  },
});

const signedAuthorization = (
  argsOverrides: Partial<AuthorizationRequirementSignature["args"]> = {},
  actionArgsOverrides: Partial<
    AuthorizationRequirementSignature["action"]["args"]
  > = {},
): AuthorizationRequirementSignature => ({
  args: {
    owner,
    authorized: blueBundlesV1,
    isAuthorized: true,
    nonce: 3n,
    deadline: permitDeadline,
    signature: serializedSignature,
    ...argsOverrides,
  },
  action: {
    type: "authorization",
    args: {
      authorized: blueBundlesV1,
      isAuthorized: true,
      deadline: permitDeadline,
      ...actionArgsOverrides,
    },
  },
});

describe("getBlueBundlesV1TokenPermit", () => {
  test("default: returns the empty-permit sentinel when no requirement signature is supplied", () => {
    expect(
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
      }),
    ).toEqual({ kind: 0, data: "0x" });
  });

  test.each([
    { label: "standard serialized", signature: serializedSignature },
    { label: "y-parity serialized", signature: yParitySerializedSignature },
    { label: "EIP-2098 compact", signature: compactSignature },
  ])(
    "behavior: encodes a $label ERC-2612 permit as kind 1",
    ({ signature }) => {
      const tokenPermit = getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({ signature }),
      });

      expect(tokenPermit.kind).toBe(1);
      const [deadline, v, r, s] = decodeAbiParameters(
        [
          { type: "uint256" },
          { type: "uint8" },
          { type: "bytes32" },
          { type: "bytes32" },
        ],
        tokenPermit.data,
      );
      expect({ deadline, v, r, s }).toEqual({
        deadline: permitDeadline,
        v: 28,
        r: signatureParts.r,
        s: signatureParts.s,
      });
    },
  );

  test("behavior: encodes a Permit2 SignatureTransfer as kind 2 carrying the raw signature", () => {
    const tokenPermit = getBlueBundlesV1TokenPermit({
      chainId,
      userAddress: owner,
      token: asset,
      amount: permitAmount,
      requirementSignature: permit2TransferFromPermit({ nonce: 42n }),
    });

    expect(tokenPermit.kind).toBe(2);
    const [nonce, deadline, signature] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      tokenPermit.data,
    );
    expect({ nonce, deadline, signature }).toEqual({
      nonce: 42n,
      deadline: permitDeadline,
      signature: serializedSignature,
    });
  });

  test("error: DepositOwnerMismatchError when the permit owner differs from the user", () => {
    expect(() =>
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({ owner: otherAddress }),
      }),
    ).toThrow(DepositOwnerMismatchError);
  });

  test("error: DepositAssetMismatchError when the permit asset differs from the token", () => {
    expect(() =>
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({ asset: otherAddress }),
      }),
    ).toThrow(DepositAssetMismatchError);
  });

  test("error: DepositAmountMismatchError when the signed amount differs from the funded amount", () => {
    expect(() =>
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({ amount: permitAmount + 1n }),
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("error: DepositAmountMismatchError when the permit action amount differs from the funded amount", () => {
    expect(() =>
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({}, { amount: permitAmount + 1n }),
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("error: DepositSpenderMismatchError when the permit spender is not BlueBundlesV1", () => {
    expect(() =>
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({}, { spender: otherAddress }),
      }),
    ).toThrow(DepositSpenderMismatchError);
  });

  test("error: BlueBundlesV1RequirementSignatureMismatchError on inconsistent permit deadlines", () => {
    let thrown: unknown;
    try {
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit(
          {},
          { deadline: permitDeadline + 1n },
        ),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(
      BlueBundlesV1RequirementSignatureMismatchError,
    );
    expect(thrown).toMatchObject({ field: "deadline" });
  });

  test("error: BlueBundlesV1RequirementSignatureMismatchError rejects a Permit2 AllowanceTransfer signature", () => {
    const permit2Allowance: Permit2AllowanceRequirementSignature = {
      args: {
        owner,
        nonce: 1n,
        asset,
        signature: serializedSignature,
        amount: permitAmount,
        deadline: permitDeadline,
        expiration: permitDeadline,
      },
      action: {
        type: "permit2",
        args: {
          spender: blueBundlesV1,
          amount: permitAmount,
          deadline: permitDeadline,
          expiration: permitDeadline,
        },
      },
    };

    let thrown: unknown;
    try {
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: permit2Allowance,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(
      BlueBundlesV1RequirementSignatureMismatchError,
    );
    expect(thrown).toMatchObject({ field: "type" });
  });

  test("error: BlueBundlesV1RequirementSignatureMismatchError preserves the parser cause for a malformed signature", () => {
    let thrown: unknown;
    try {
      getBlueBundlesV1TokenPermit({
        chainId,
        userAddress: owner,
        token: asset,
        amount: permitAmount,
        requirementSignature: erc2612Permit({ signature: "0x12" }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(
      BlueBundlesV1RequirementSignatureMismatchError,
    );
    if (!(thrown instanceof BlueBundlesV1RequirementSignatureMismatchError))
      throw thrown;
    expect(thrown.field).toBe("signature");
    expect(thrown.cause).toBeInstanceOf(Error);
  });

  test("behavior: Permit2 SignatureTransfer tuple round-trips across valid scalar inputs", () => {
    fc.assert(
      fc.property(
        fc.record({
          deadline: fc.bigInt({ min: 1n, max: 2n ** 128n }),
          nonce: fc.bigInt({ min: 0n, max: 2n ** 256n - 1n }),
          amount: fc.bigInt({ min: 1n, max: 2n ** 128n }),
        }),
        ({ deadline, nonce, amount }) => {
          const tokenPermit = getBlueBundlesV1TokenPermit({
            chainId,
            userAddress: owner,
            token: asset,
            amount,
            requirementSignature: permit2TransferFromPermit(
              { amount, deadline, nonce },
              { amount, deadline },
            ),
          });

          expect(tokenPermit.kind).toBe(2);
          const [decodedNonce, decodedDeadline, signature] =
            decodeAbiParameters(
              [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
              tokenPermit.data,
            );
          expect({ decodedNonce, decodedDeadline, signature }).toEqual({
            decodedNonce: nonce,
            decodedDeadline: deadline,
            signature: serializedSignature,
          });
        },
      ),
      { numRuns: 50, seed: 20_260_902 },
    );
  });
});

describe("getBlueBundlesV1SignedAuthorization", () => {
  test("default: returns the empty signed-authorization sentinel when none is supplied", () => {
    expect(
      getBlueBundlesV1SignedAuthorization({ chainId, userAddress: owner }),
    ).toEqual({
      signature: { v: 0, r: zeroHash, s: zeroHash },
      nonce: 0n,
      deadline: 0n,
    });
  });

  test.each([
    { label: "standard serialized", signature: serializedSignature },
    { label: "y-parity serialized", signature: yParitySerializedSignature },
    { label: "EIP-2098 compact", signature: compactSignature },
  ])("behavior: reshapes a $label authorization signature", ({ signature }) => {
    expect(
      getBlueBundlesV1SignedAuthorization({
        chainId,
        userAddress: owner,
        authorizationSignature: signedAuthorization({ signature, nonce: 5n }),
      }),
    ).toEqual({
      signature: { v: 28, r: signatureParts.r, s: signatureParts.s },
      nonce: 5n,
      deadline: permitDeadline,
    });
  });

  test("error: DepositOwnerMismatchError when the authorization owner differs from the user", () => {
    expect(() =>
      getBlueBundlesV1SignedAuthorization({
        chainId,
        userAddress: owner,
        authorizationSignature: signedAuthorization({ owner: otherAddress }),
      }),
    ).toThrow(DepositOwnerMismatchError);
  });

  test.each([
    {
      label: "signed args",
      authorizationSignature: signedAuthorization({ authorized: otherAddress }),
    },
    {
      label: "action args",
      authorizationSignature: signedAuthorization(
        {},
        { authorized: otherAddress },
      ),
    },
  ])(
    "error: rejects an authorized operator that is not BlueBundlesV1 ($label)",
    ({ authorizationSignature }) => {
      let thrown: unknown;
      try {
        getBlueBundlesV1SignedAuthorization({
          chainId,
          userAddress: owner,
          authorizationSignature,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(
        BlueBundlesV1RequirementSignatureMismatchError,
      );
      expect(thrown).toMatchObject({ field: "authorized" });
    },
  );

  test.each([
    {
      label: "signed args",
      authorizationSignature: signedAuthorization({ isAuthorized: false }),
    },
    {
      label: "action args",
      authorizationSignature: signedAuthorization({}, { isAuthorized: false }),
    },
  ])(
    "error: rejects a revoked authorization ($label)",
    ({ authorizationSignature }) => {
      let thrown: unknown;
      try {
        getBlueBundlesV1SignedAuthorization({
          chainId,
          userAddress: owner,
          authorizationSignature,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(
        BlueBundlesV1RequirementSignatureMismatchError,
      );
      expect(thrown).toMatchObject({ field: "isAuthorized" });
    },
  );

  test("error: BlueBundlesV1RequirementSignatureMismatchError on inconsistent authorization deadlines", () => {
    let thrown: unknown;
    try {
      getBlueBundlesV1SignedAuthorization({
        chainId,
        userAddress: owner,
        authorizationSignature: signedAuthorization(
          {},
          { deadline: permitDeadline + 1n },
        ),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(
      BlueBundlesV1RequirementSignatureMismatchError,
    );
    expect(thrown).toMatchObject({ field: "deadline" });
  });

  test("error: BlueBundlesV1RequirementSignatureMismatchError preserves the parser cause for a malformed signature", () => {
    let thrown: unknown;
    try {
      getBlueBundlesV1SignedAuthorization({
        chainId,
        userAddress: owner,
        authorizationSignature: signedAuthorization({ signature: "0x12" }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(
      BlueBundlesV1RequirementSignatureMismatchError,
    );
    if (!(thrown instanceof BlueBundlesV1RequirementSignatureMismatchError))
      throw thrown;
    expect(thrown.field).toBe("signature");
    expect(thrown.cause).toBeInstanceOf(Error);
  });
});
