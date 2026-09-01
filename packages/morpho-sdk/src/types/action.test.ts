import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  type AnyRequirementSignature,
  type AuthorizationRequirementSignature,
  isAuthorizationSignature,
  isMidnightOfferRootSignature,
  isPermit2TransferFromSignature,
  isPermitSignature,
  type MidnightOfferRootSignature,
  type Permit2TransferFromRequirementSignature,
  type PermitRequirementSignature,
  selectRequirementSignatures,
} from "./action.js";
import {
  AmbiguousRequirementSignaturesError,
  UnexpectedRequirementSignatureError,
} from "./error.js";

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const SPENDER: Address = "0x2222222222222222222222222222222222222222";
const TOKEN: Address = "0x3333333333333333333333333333333333333333";
const SIGNATURE: Hex = `0x${"ab".repeat(65)}`;
const ROOT: Hex = `0x${"cd".repeat(32)}`;

const permitSignature: PermitRequirementSignature = {
  action: {
    type: "permit",
    args: { spender: SPENDER, amount: 1n, deadline: 1_900_000_000n },
  },
  args: {
    owner: OWNER,
    asset: TOKEN,
    amount: 1n,
    nonce: 0n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
  },
};

const permit2Signature: PermitRequirementSignature = {
  action: {
    type: "permit2",
    args: {
      spender: SPENDER,
      amount: 1n,
      deadline: 1_900_000_000n,
      expiration: 1_900_000_000n,
    },
  },
  args: {
    owner: OWNER,
    asset: TOKEN,
    amount: 1n,
    nonce: 0n,
    deadline: 1_900_000_000n,
    expiration: 1_900_000_000n,
    signature: SIGNATURE,
  },
};

const permit2TransferFromSignature: Permit2TransferFromRequirementSignature =
  {
    action: {
      type: "permit2TransferFrom",
      args: {
        spender: SPENDER,
        amount: 1n,
        deadline: 1_900_000_000n,
      },
    },
    args: {
      owner: OWNER,
      asset: TOKEN,
      amount: 1n,
      nonce: 0n,
      deadline: 1_900_000_000n,
      signature: SIGNATURE,
    },
  };

const authorizationSignature: AuthorizationRequirementSignature = {
  action: {
    type: "authorization",
    args: { authorized: SPENDER, isAuthorized: true, deadline: 1_900_000_000n },
  },
  args: {
    owner: OWNER,
    authorized: SPENDER,
    isAuthorized: true,
    nonce: 0n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
  },
};

const midnightOfferRootSignature: MidnightOfferRootSignature = {
  action: {
    type: "midnightOfferRootSignature",
    args: { root: ROOT, ratifier: SPENDER, offers: 1 },
  },
  args: {
    owner: OWNER,
    root: ROOT,
    signature: SIGNATURE,
    payload: "0x1234",
  },
};

describe("isPermitSignature", () => {
  test("default: true for permit", () => {
    expect(isPermitSignature(permitSignature)).toBe(true);
  });

  test("behavior: true for permit2", () => {
    expect(isPermitSignature(permit2Signature)).toBe(true);
  });

  test("behavior: false for authorization", () => {
    expect(isPermitSignature(authorizationSignature)).toBe(false);
  });
});

describe("isAuthorizationSignature", () => {
  test("default: true for authorization", () => {
    expect(isAuthorizationSignature(authorizationSignature)).toBe(true);
  });

  test("behavior: false for permit", () => {
    expect(isAuthorizationSignature(permitSignature)).toBe(false);
  });

  test("behavior: false for permit2", () => {
    expect(isAuthorizationSignature(permit2Signature)).toBe(false);
  });
});

describe("isPermit2TransferFromSignature", () => {
  test("default: true for Permit2 SignatureTransfer", () => {
    expect(
      isPermit2TransferFromSignature(permit2TransferFromSignature),
    ).toBe(true);
  });

  test("behavior: false for Permit2 AllowanceTransfer", () => {
    expect(isPermit2TransferFromSignature(permit2Signature)).toBe(false);
  });
});

describe("isMidnightOfferRootSignature", () => {
  test("default: true for a Midnight offer-root signature", () => {
    expect(isMidnightOfferRootSignature(midnightOfferRootSignature)).toBe(true);
  });

  test("behavior: false for permit", () => {
    expect(isMidnightOfferRootSignature(permitSignature)).toBe(false);
  });

  test("behavior: false for authorization", () => {
    expect(isMidnightOfferRootSignature(authorizationSignature)).toBe(false);
  });
});

describe("selectRequirementSignatures", () => {
  test("behavior: AnyRequirementSignature accepts every signature result", () => {
    const signatures: readonly AnyRequirementSignature[] = [
      permitSignature,
      authorizationSignature,
      midnightOfferRootSignature,
    ];

    expect(signatures.map((signature) => signature.action.type)).toEqual([
      "permit",
      "authorization",
      "midnightOfferRootSignature",
    ]);
  });

  test("default: extracts the single permit and authorization", () => {
    expect(
      selectRequirementSignatures([permitSignature, authorizationSignature], {
        permit: true,
        authorization: true,
      }),
    ).toEqual({
      permit: permitSignature,
      permit2TransferFrom: undefined,
      authorization: authorizationSignature,
      midnightOfferRoot: undefined,
    });
  });

  test("behavior: empty object for undefined input", () => {
    expect(selectRequirementSignatures(undefined, { permit: true })).toEqual(
      {},
    );
  });

  test("behavior: empty slots when nothing matches", () => {
    expect(
      selectRequirementSignatures([], { permit: true, authorization: true }),
    ).toEqual({
      permit: undefined,
      permit2TransferFrom: undefined,
      authorization: undefined,
      midnightOfferRoot: undefined,
    });
  });

  test("behavior: extracts the single Midnight offer-root signature", () => {
    expect(
      selectRequirementSignatures([midnightOfferRootSignature], {
        midnightOfferRoot: true,
      }),
    ).toEqual({
      permit: undefined,
      permit2TransferFrom: undefined,
      authorization: undefined,
      midnightOfferRoot: midnightOfferRootSignature,
    });
  });

  test("behavior: extracts a Permit2 SignatureTransfer", () => {
    expect(
      selectRequirementSignatures([permit2TransferFromSignature], {
        permit2TransferFrom: true,
      }),
    ).toEqual({
      permit: undefined,
      permit2TransferFrom: permit2TransferFromSignature,
      authorization: undefined,
      midnightOfferRoot: undefined,
    });
  });

  test("error: UnexpectedRequirementSignatureError on an unconsumed Permit2 SignatureTransfer", () => {
    expect(() =>
      selectRequirementSignatures([permit2TransferFromSignature], {
        authorization: true,
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: AmbiguousRequirementSignaturesError on duplicate permits", () => {
    expect(() =>
      selectRequirementSignatures([permitSignature, permit2Signature], {
        permit: true,
      }),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });

  test("error: AmbiguousRequirementSignaturesError on duplicate authorizations", () => {
    expect(() =>
      selectRequirementSignatures(
        [authorizationSignature, authorizationSignature],
        { authorization: true },
      ),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });

  test("error: AmbiguousRequirementSignaturesError on duplicate Midnight roots", () => {
    expect(() =>
      selectRequirementSignatures(
        [midnightOfferRootSignature, midnightOfferRootSignature],
        { midnightOfferRoot: true },
      ),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });

  test("error: UnexpectedRequirementSignatureError when a permit is not consumed", () => {
    expect(() =>
      selectRequirementSignatures([permitSignature], { authorization: true }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: UnexpectedRequirementSignatureError when an authorization is not consumed", () => {
    expect(() =>
      selectRequirementSignatures([authorizationSignature], { permit: true }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: UnexpectedRequirementSignatureError when a Midnight root is not consumed", () => {
    expect(() =>
      selectRequirementSignatures([midnightOfferRootSignature], {
        permit: true,
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });
});
