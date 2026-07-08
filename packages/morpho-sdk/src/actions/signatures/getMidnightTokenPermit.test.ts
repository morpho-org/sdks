import { decodeAbiParameters, type Hex } from "viem";
import { describe, expect, test } from "vitest";
import { midnightAddresses } from "../../../test/fixtures/midnight.js";
import {
  AmbiguousRequirementSignaturesError,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  MidnightPermit2TransferSignatureRequiredError,
  type RequirementSignature,
  type TokenRequirementSignature,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import { PermitKind } from "../midnight/types.js";
import { getMidnightTokenPermit } from "./getMidnightTokenPermit.js";

const signature = `0x${"11".repeat(32)}${"22".repeat(32)}1b` as Hex;

type HasExpiration<T> = T extends { expiration: bigint } ? true : false;

describe("getMidnightTokenPermit", () => {
  test("default", () => {
    expect(
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
      }),
    ).toEqual({ kind: PermitKind.None, data: "0x" });
  });

  test("behavior: narrows token signature args by action type", () => {
    const assertTokenSignatureNarrowing = (
      collectedSignature: TokenRequirementSignature,
    ) => {
      switch (collectedSignature.action.type) {
        case "permit":
          {
            const hasExpiration: HasExpiration<typeof collectedSignature.args> =
              false;
            expect(hasExpiration).toBe(false);
          }
          break;
        case "permit2":
          {
            const hasExpiration: HasExpiration<typeof collectedSignature.args> =
              true;
            expect(hasExpiration).toBe(true);
          }
          break;
        case "permit2Transfer":
          {
            const hasExpiration: HasExpiration<typeof collectedSignature.args> =
              false;
            expect(hasExpiration).toBe(false);
          }
          break;
      }
    };

    assertTokenSignatureNarrowing({
      action: {
        type: "permit2Transfer",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 42n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    });
  });

  test("behavior: encodes ERC2612 signatures", () => {
    const permitSignature = {
      action: {
        type: "permit",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 0n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    } satisfies RequirementSignature;

    const permit = getMidnightTokenPermit({
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      signatures: [permitSignature],
    });
    const decoded = decodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      permit.data,
    );

    expect(permit.kind).toBe(PermitKind.ERC2612);
    expect(decoded).toEqual([
      123n,
      27,
      `0x${"11".repeat(32)}`,
      `0x${"22".repeat(32)}`,
    ]);
  });

  test("behavior: encodes Permit2 transfer signatures", () => {
    const permit2Signature = {
      action: {
        type: "permit2Transfer",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 42n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    } satisfies TokenRequirementSignature;

    const permit = getMidnightTokenPermit({
      token: midnightAddresses.loanToken,
      owner: midnightAddresses.taker,
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      signatures: [permit2Signature],
    });
    const decoded = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      permit.data,
    );

    expect(permit.kind).toBe(PermitKind.Permit2);
    expect(decoded).toEqual([42n, 123n, signature]);
  });

  test("error: MidnightPermit2TransferSignatureRequiredError", () => {
    const permit2Signature = {
      action: {
        type: "permit2",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
          expiration: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 42n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
        expiration: 123n,
      },
    } satisfies RequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [permit2Signature],
      }),
    ).toThrow(MidnightPermit2TransferSignatureRequiredError);
  });

  test("error: AmbiguousRequirementSignaturesError", () => {
    const permit2Signature = {
      action: {
        type: "permit2Transfer",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 42n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    } satisfies TokenRequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [permit2Signature, permit2Signature],
      }),
    ).toThrow(AmbiguousRequirementSignaturesError);
  });

  test("error: UnexpectedRequirementSignatureError", () => {
    const offerRootSignature = {
      action: {
        type: "midnightOfferRootSignature",
        args: {
          root: `0x${"33".repeat(32)}` as Hex,
          ratifier: midnightAddresses.ecrecoverRatifier,
          offers: 1,
        },
      },
      args: {
        owner: midnightAddresses.maker,
        root: `0x${"33".repeat(32)}` as Hex,
        signature,
        payload: "0x1234",
      },
    } satisfies RequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [offerRootSignature],
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: DepositAssetMismatchError", () => {
    const permitSignature = {
      action: {
        type: "permit",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 0n,
        asset: midnightAddresses.collateralToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    } satisfies RequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [permitSignature],
      }),
    ).toThrow(DepositAssetMismatchError);
  });

  test("error: DepositAmountMismatchError", () => {
    const permitSignature = {
      action: {
        type: "permit",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_001n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 0n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_001n,
        deadline: 123n,
      },
    } satisfies RequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [permitSignature],
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("error: DepositOwnerMismatchError", () => {
    const permitSignature = {
      action: {
        type: "permit",
        args: {
          spender: midnightAddresses.midnightBundles,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.maker,
        nonce: 0n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    } satisfies RequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [permitSignature],
      }),
    ).toThrow(DepositOwnerMismatchError);
  });

  test("error: DepositSpenderMismatchError", () => {
    const permitSignature = {
      action: {
        type: "permit",
        args: {
          spender: midnightAddresses.generalAdapter1,
          amount: 1_000n,
          deadline: 123n,
        },
      },
      args: {
        owner: midnightAddresses.taker,
        nonce: 0n,
        asset: midnightAddresses.loanToken,
        signature,
        amount: 1_000n,
        deadline: 123n,
      },
    } satisfies RequirementSignature;

    expect(() =>
      getMidnightTokenPermit({
        token: midnightAddresses.loanToken,
        owner: midnightAddresses.taker,
        spender: midnightAddresses.midnightBundles,
        amount: 1_000n,
        signatures: [permitSignature],
      }),
    ).toThrow(DepositSpenderMismatchError);
  });
});
