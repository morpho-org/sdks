import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ApprovalAmountLessThanSpendAmountError,
  InputExceedsMaxError,
  isRequirementApproval,
  isRequirementSignature,
  NegativeInputError,
  Permit2SignatureTransferNonceAlreadyUsedError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../types/index.js";
import {
  type BundlesTokenRequirementsState,
  resolveBundlesTokenRequirements,
} from "./resolveBundlesTokenRequirements.js";

const chainId = mainnet.id;
const { usdc, permit2 } = addressesRegistry[chainId];
const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
const owner = "0x0000000000000000000000000000000000000001" as const;
const deadline = 1_900_000_000n;

describe("resolveBundlesTokenRequirements", () => {
  const states = [
    { type: "approval", allowance: 0n, approvalAmount: maxUint256 },
    {
      type: "permit2SignatureTransfer",
      permit2Allowance: maxUint256,
      permit2Nonce: 0n,
      nonceBitmap: 0n,
    },
  ] as const satisfies readonly BundlesTokenRequirementsState[];

  test.each(states)(
    "behavior: zero amount returns no requirements for $type",
    (state) => {
      expect(
        resolveBundlesTokenRequirements({
          token: usdc,
          spender,
          owner,
          chainId,
          amount: 0n,
          deadline,
          state,
        }),
      ).toEqual([]);
    },
  );

  test.each(states)(
    "behavior: accepts maxUint256 amount for $type",
    (state) => {
      const requirements = resolveBundlesTokenRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: maxUint256,
        deadline,
        state,
      });
      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action.args.amount).toBe(maxUint256);
    },
  );

  test.each(
    states.flatMap((state) => [
      { state, amount: -1n, error: NegativeInputError },
      { state, amount: maxUint256 + 1n, error: InputExceedsMaxError },
    ]),
  )(
    "error: $error.name for $state.type amount $amount",
    ({ state, amount, error }) => {
      expect(() =>
        resolveBundlesTokenRequirements({
          token: usdc,
          spender,
          owner,
          chainId,
          amount,
          deadline,
          state,
        }),
      ).toThrow(error);
    },
  );

  test("error: ApprovalAmountLessThanSpendAmountError", () => {
    expect(() =>
      resolveBundlesTokenRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 2n,
        deadline,
        state: { type: "approval", allowance: 0n, approvalAmount: 1n },
      }),
    ).toThrow(ApprovalAmountLessThanSpendAmountError);
  });

  test.each([
    { permit2Nonce: -1n, error: NegativeInputError },
    { permit2Nonce: maxUint256 + 1n, error: InputExceedsMaxError },
  ])(
    "error: $error.name for Permit2 nonce $permit2Nonce",
    ({ permit2Nonce, error }) => {
      expect(() =>
        resolveBundlesTokenRequirements({
          token: usdc,
          spender,
          owner,
          chainId,
          amount: 1n,
          deadline,
          state: {
            type: "permit2SignatureTransfer",
            permit2Allowance: maxUint256,
            permit2Nonce,
            nonceBitmap: 0n,
          },
        }),
      ).toThrow(error);
    },
  );

  test("behavior: direct approval resolution is deterministic", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }),
        fc.boolean(),
        (amount, sufficient) => {
          const requirements = resolveBundlesTokenRequirements({
            token: usdc,
            spender,
            owner,
            chainId,
            amount,
            deadline,
            state: {
              type: "approval",
              allowance: sufficient ? amount : amount - 1n,
              approvalAmount: amount,
            },
          });
          expect(requirements).toHaveLength(sufficient ? 0 : 1);
          if (!sufficient) {
            expect(isRequirementApproval(requirements[0])).toBe(true);
            expect(requirements[0]?.action).toMatchObject({
              type: "erc20Approval",
              args: { spender, amount },
            });
          }
        },
      ),
      { numRuns: 100, seed: 20_260_910 },
    );
  });

  test("behavior: a raised approval target does not require replacing a sufficient allowance", () => {
    const amount = 1_000_000n;
    // The fixed call cannot pull beyond the supplied amount, even with a reusable approval target.
    const requirements = resolveBundlesTokenRequirements({
      token: usdc,
      spender,
      owner,
      chainId,
      amount,
      deadline,
      state: {
        type: "approval",
        allowance: amount,
        approvalAmount: maxUint256,
      },
    });
    expect(requirements).toHaveLength(0);

    expect(
      resolveBundlesTokenRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount,
        deadline,
        state: {
          type: "approval",
          allowance: maxUint256,
          approvalAmount: maxUint256,
        },
      }),
    ).toHaveLength(0);
  });

  test("behavior: Permit2 approval precedes SignatureTransfer and preserves nonce", () => {
    const amount = MathLib.MAX_UINT_160 + 1n;
    const requirements = resolveBundlesTokenRequirements({
      token: usdc,
      spender,
      owner,
      chainId,
      amount,
      deadline,
      state: {
        type: "permit2SignatureTransfer",
        permit2Allowance: 0n,
        permit2Nonce: 257n,
        nonceBitmap: 0n,
      },
    });

    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: permit2, amount: maxUint256 },
    });
    expect(isRequirementSignature(requirements[1])).toBe(true);
    expect(requirements[1]?.action).toEqual({
      type: "permit2SignatureTransfer",
      args: { spender, amount, nonce: 257n, deadline },
    });
  });

  test("behavior: distinct caller-selected nonces remain distinct", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (nonce) => {
        const requirement = resolveBundlesTokenRequirements({
          token: usdc,
          spender,
          owner,
          chainId,
          amount: 1n,
          deadline,
          state: {
            type: "permit2SignatureTransfer",
            permit2Allowance: maxUint256,
            permit2Nonce: BigInt(nonce),
            nonceBitmap: 0n,
          },
        })[0];
        expect(requirement?.action).toMatchObject({
          type: "permit2SignatureTransfer",
          args: { nonce: BigInt(nonce) },
        });
      }),
      { numRuns: 100, seed: 20_260_911 },
    );
  });

  test("error: Permit2SignatureTransferNonceAlreadyUsedError", () => {
    expect(() =>
      resolveBundlesTokenRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 1n,
        deadline,
        state: {
          type: "permit2SignatureTransfer",
          permit2Allowance: maxUint256,
          permit2Nonce: 7n,
          nonceBitmap: 1n << 7n,
        },
      }),
    ).toThrow(Permit2SignatureTransferNonceAlreadyUsedError);
  });

  test.each([
    getChainAddress(chainId, "bundles.blueBundlesV1"),
    getChainAddress(chainId, "bundles.vaultBundlesV1"),
  ])("behavior: accepts the registered bundles spender %s", (allowed) => {
    expect(
      resolveBundlesTokenRequirements({
        token: usdc,
        spender: allowed,
        owner,
        chainId,
        amount: 1n,
        deadline,
        state: { type: "approval", allowance: 0n, approvalAmount: 1n },
      })[0]?.action,
    ).toMatchObject({ type: "erc20Approval", args: { spender: allowed } });
  });

  // An unregistered spender must never reach an approval or a signature, including on the paths
  // that never touch the approval encoder: a zero amount and an already-sufficient allowance.
  test.each([
    {
      label: "approval",
      amount: 1n,
      state: { type: "approval", allowance: 0n, approvalAmount: 1n },
    },
    {
      label: "sufficient allowance",
      amount: 1n,
      state: { type: "approval", allowance: maxUint256, approvalAmount: 1n },
    },
    {
      label: "zero amount",
      amount: 0n,
      state: { type: "approval", allowance: 0n, approvalAmount: 0n },
    },
    {
      label: "permit2SignatureTransfer",
      amount: 1n,
      state: {
        type: "permit2SignatureTransfer",
        permit2Allowance: maxUint256,
        permit2Nonce: 0n,
        nonceBitmap: 0n,
      },
    },
  ] as const satisfies readonly {
    label: string;
    amount: bigint;
    state: BundlesTokenRequirementsState;
  }[])(
    "error: UnsupportedErc20ApprovalSpenderError for an unregistered spender ($label)",
    ({ amount, state }) => {
      expect(() =>
        resolveBundlesTokenRequirements({
          token: usdc,
          // GeneralAdapter1 is a registered SDK approval spender, but never a bundles spender.
          spender: getChainAddress(chainId, "bundler3.generalAdapter1"),
          owner,
          chainId,
          amount,
          deadline,
          state,
        }),
      ).toThrow(UnsupportedErc20ApprovalSpenderError);
    },
  );
});
