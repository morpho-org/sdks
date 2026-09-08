import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  type Erc2612RequirementSignature,
  type Permit2AllowanceRequirementSignature,
  Permit2ExpirationMissingError,
  type Permit2TransferFromRequirementSignature,
  type PermitRequirementSignature,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import { getTokenRequirementActions } from "./getTokenRequirementActions.js";

const ASSET: Address = "0x1111111111111111111111111111111111111111";
const OWNER: Address = "0x2222222222222222222222222222222222222222";
const RECIPIENT: Address = "0x3333333333333333333333333333333333333333";
const SPENDER: Address = "0x4444444444444444444444444444444444444444";
const OTHER_ASSET: Address = "0x5555555555555555555555555555555555555555";
const SIGNATURE: Hex = `0x${"11".repeat(65)}`;
const AMOUNT = 1_000_000n;
const DEADLINE = 1_900_000_000n;

const permitSignature: Erc2612RequirementSignature = {
  args: {
    owner: OWNER,
    nonce: 0n,
    asset: ASSET,
    signature: SIGNATURE,
    amount: AMOUNT,
    deadline: DEADLINE,
  },
  action: {
    type: "permit",
    args: { spender: SPENDER, amount: AMOUNT, deadline: DEADLINE },
  },
};

const permit2Signature: Permit2AllowanceRequirementSignature = {
  args: {
    owner: OWNER,
    nonce: 5n,
    asset: ASSET,
    signature: SIGNATURE,
    amount: AMOUNT,
    deadline: DEADLINE,
    expiration: DEADLINE,
  },
  action: {
    type: "permit2",
    args: {
      spender: SPENDER,
      amount: AMOUNT,
      deadline: DEADLINE,
      expiration: DEADLINE,
    },
  },
};

describe("getTokenRequirementActions", () => {
  test("default: emits a plain erc20TransferFrom when no signature is provided", () => {
    expect(
      getTokenRequirementActions({
        asset: ASSET,
        amount: AMOUNT,
        recipient: RECIPIENT,
      }),
    ).toEqual([
      { type: "erc20TransferFrom", args: [ASSET, AMOUNT, RECIPIENT, false] },
    ]);
  });

  test("behavior: classic permit emits permit + erc20TransferFrom", () => {
    expect(
      getTokenRequirementActions({
        asset: ASSET,
        amount: AMOUNT,
        recipient: RECIPIENT,
        requirementSignature: permitSignature,
      }),
    ).toEqual([
      {
        type: "permit",
        args: [OWNER, ASSET, AMOUNT, DEADLINE, SIGNATURE, false],
      },
      { type: "erc20TransferFrom", args: [ASSET, AMOUNT, RECIPIENT, false] },
    ]);
  });

  test("behavior: Permit2 AllowanceTransfer emits approve2 + transferFrom2", () => {
    expect(
      getTokenRequirementActions({
        asset: ASSET,
        amount: AMOUNT,
        recipient: RECIPIENT,
        requirementSignature: permit2Signature,
      }),
    ).toEqual([
      {
        type: "approve2",
        args: [
          OWNER,
          {
            details: {
              token: ASSET,
              amount: AMOUNT,
              nonce: 5,
              expiration: Number(DEADLINE),
            },
            sigDeadline: DEADLINE,
          },
          SIGNATURE,
          false,
        ],
      },
      { type: "transferFrom2", args: [ASSET, AMOUNT, RECIPIENT, false] },
    ]);
  });

  test("error: UnexpectedRequirementSignatureError rejects a BlueBundlesV1 SignatureTransfer result", () => {
    // permit2TransferFrom is a BlueBundlesV1-only result; it must never reach the Bundler3 path.
    const transferFromSignature: Permit2TransferFromRequirementSignature = {
      args: {
        owner: OWNER,
        nonce: 0n,
        asset: ASSET,
        signature: SIGNATURE,
        amount: AMOUNT,
        deadline: DEADLINE,
      },
      action: {
        type: "permit2TransferFrom",
        args: { spender: SPENDER, amount: AMOUNT, deadline: DEADLINE },
      },
    };

    expect(() =>
      getTokenRequirementActions({
        asset: ASSET,
        amount: AMOUNT,
        recipient: RECIPIENT,
        requirementSignature:
          transferFromSignature as unknown as PermitRequirementSignature,
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: DepositAssetMismatchError when the signed asset differs", () => {
    expect(() =>
      getTokenRequirementActions({
        asset: OTHER_ASSET,
        amount: AMOUNT,
        recipient: RECIPIENT,
        requirementSignature: permitSignature,
      }),
    ).toThrow(DepositAssetMismatchError);
  });

  test("error: DepositAmountMismatchError when the signed amount differs", () => {
    expect(() =>
      getTokenRequirementActions({
        asset: ASSET,
        amount: AMOUNT + 1n,
        recipient: RECIPIENT,
        requirementSignature: permitSignature,
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("error: Permit2ExpirationMissingError when a permit2 action carries no expiration", () => {
    const permit2WithoutExpiration = {
      args: {
        owner: OWNER,
        nonce: 5n,
        asset: ASSET,
        signature: SIGNATURE,
        amount: AMOUNT,
        deadline: DEADLINE,
      },
      action: {
        type: "permit2",
        args: {
          spender: SPENDER,
          amount: AMOUNT,
          deadline: DEADLINE,
          expiration: DEADLINE,
        },
      },
    };

    expect(() =>
      getTokenRequirementActions({
        asset: ASSET,
        amount: AMOUNT,
        recipient: RECIPIENT,
        requirementSignature:
          permit2WithoutExpiration as unknown as PermitRequirementSignature,
      }),
    ).toThrow(Permit2ExpirationMissingError);
  });
});
