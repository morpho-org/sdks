import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  type AuthorizationRequirementSignature,
  isAuthorizationSignature,
  isPermitSignature,
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

describe("selectRequirementSignatures", () => {
  test("default: extracts the single permit and authorization", () => {
    expect(
      selectRequirementSignatures([permitSignature, authorizationSignature], {
        permit: true,
        authorization: true,
      }),
    ).toEqual({
      permit: permitSignature,
      authorization: authorizationSignature,
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
    ).toEqual({ permit: undefined, authorization: undefined });
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
});
