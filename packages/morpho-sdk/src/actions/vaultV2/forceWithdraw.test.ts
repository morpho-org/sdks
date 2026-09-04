import { MathLib, registerCustomAddresses } from "@morpho-org/blue-sdk";
import {
  UnknownAddressError,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";
import fc from "fast-check";
import {
  bytesToHex,
  decodeFunctionData,
  getAddress,
  maxUint256,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import {
  InputExceedsMaxError,
  MissingReferralFeeRecipientError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  VaultExitBundlesV1PermitMismatchError,
} from "../../types/index.js";
import { vaultV2ForceWithdraw } from "./forceWithdraw.js";

const chainId = 31_339;
/** Registered chain deliberately left without a `bundles` entry. */
const unregisteredBundlesChainId = 31_340;
const blue = "0x0000000000000000000000000000000000000001" as const;
const vault = "0x0000000000000000000000000000000000000002" as const;
const adapter = "0x0000000000000000000000000000000000000003" as const;
const userAddress = "0x0000000000000000000000000000000000000004" as const;
const vaultExitBundlesV1 =
  "0x0000000000000000000000000000000000000005" as const;
const referralFeeRecipient =
  "0x0000000000000000000000000000000000000013" as const;
const deadline = 1_900_000_000n;
const minSharePriceE27 = 990_000_000_000_000_000_000_000_000n;

const addressArbitrary = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => getAddress(bytesToHex(bytes)));
const positiveUint256Arbitrary = fc.bigInt({ min: 1n, max: maxUint256 });
const forceWithdrawArbitrary = fc.record({
  vaultAddress: addressArbitrary,
  adapterAddress: addressArbitrary,
  exitAssets: positiveUint256Arbitrary,
  minSharePriceE27: fc.bigInt({ min: 0n, max: maxUint256 }),
  referralFeePct: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
  referralFeeRecipient: addressArbitrary,
  onBehalf: addressArbitrary,
  deadline: positiveUint256Arbitrary,
});

const signature = {
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
  yParity: 1,
} as const;
const serializedSignature = serializeSignature(signature);
const permitAmount = 125n;

registerCustomAddresses({
  addresses: {
    [chainId]: {
      blue,
      morpho: blue,
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000010",
        generalAdapter1: "0x0000000000000000000000000000000000000011",
      },
      bundles: { vaultExitBundlesV1 },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000012",
    },
    [unregisteredBundlesChainId]: {
      blue,
      morpho: blue,
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000010",
        generalAdapter1: "0x0000000000000000000000000000000000000011",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000012",
    },
  },
});

const permitWith = (
  overrides?: Partial<PermitRequirementSignature["args"]>,
): PermitRequirementSignature => ({
  args: {
    owner: userAddress,
    nonce: 7n,
    asset: vault,
    signature: serializedSignature,
    amount: permitAmount,
    deadline,
    ...overrides,
  },
  action: {
    type: "permit",
    args: { spender: vaultExitBundlesV1, amount: permitAmount, deadline },
  },
});

const decode = (data: `0x${string}`) => {
  const decoded = decodeFunctionData({ abi: vaultExitBundlesV1Abi, data });
  if (decoded.functionName !== "vaultExitBundlesV1ForceWithdrawVaultV2") {
    throw new TypeError("Unexpected VaultExitBundlesV1 function");
  }

  return decoded;
};

describe("vaultV2ForceWithdraw", () => {
  test("default", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
        requirementSignature: permitWith(),
      },
    });

    expect(tx.to).toBe(vaultExitBundlesV1);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("vaultV2ForceWithdraw");
    expect(decode(tx.data)).toMatchInlineSnapshot(`
      {
        "args": [
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
          100n,
          990000000000000000000000000n,
          {
            "deadline": 1900000000n,
            "nonce": 7n,
            "r": "0x1111111111111111111111111111111111111111111111111111111111111111",
            "s": "0x2222222222222222222222222222222222222222222222222222222222222222",
            "v": 28,
            "value": 125n,
          },
          0n,
          "0x0000000000000000000000000000000000000000",
          1900000000n,
        ],
        "functionName": "vaultExitBundlesV1ForceWithdrawVaultV2",
      }
    `);
  });

  test("default: action metadata mirrors the encoded call", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
      },
    });

    expect(tx.action.args).toEqual({
      vault,
      adapter,
      exitAssets: 100n,
      minSharePriceE27,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
      onBehalf: userAddress,
      deadline,
    });
  });

  test("behavior: embeds the empty-permit sentinel without a signature", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
      },
    });

    expect(decode(tx.data).args[4]).toEqual({
      value: 0n,
      nonce: 0n,
      deadline,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    });
  });

  test("behavior: normalizes a 64-byte EIP-2098 compact signature", () => {
    const compact = serializeCompactSignature(
      signatureToCompactSignature(signature),
    );
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
        requirementSignature: permitWith({ signature: compact }),
      },
    });

    expect(decode(tx.data).args[4]).toMatchObject({
      r: signature.r,
      s: signature.s,
      v: 28,
    });
  });

  test("behavior: forwards the referral fee split", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
        referralFeePct: 10_000_000_000_000_000n,
        referralFeeRecipient,
      },
    });
    const { args } = decode(tx.data);

    expect(args[5]).toBe(10_000_000_000_000_000n);
    expect(args[6]).toBe(referralFeeRecipient);
    expect(tx.action.args).toMatchObject({
      referralFeePct: 10_000_000_000_000_000n,
      referralFeeRecipient,
    });
  });

  test("behavior: accepts a zero minSharePriceE27 opt-out", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27: 0n,
        userAddress,
        deadline,
      },
    });

    expect(decode(tx.data).args[3]).toBe(0n);
  });

  test("behavior: appends analytics metadata to the calldata", () => {
    const base = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
      },
    });
    const withMetadata = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
      },
      metadata: { origin: "deadbeef" },
    });

    expect(withMetadata.data).toBe(`${base.data}deadbeef`);
  });

  test("behavior: returns a deep-frozen transaction", () => {
    const tx = vaultV2ForceWithdraw({
      vault: { chainId, address: vault },
      args: {
        adapter,
        exitAssets: 100n,
        minSharePriceE27,
        userAddress,
        deadline,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("behavior: calldata round-trips across valid primitive inputs", () => {
    fc.assert(
      fc.property(forceWithdrawArbitrary, (input) => {
        const tx = vaultV2ForceWithdraw({
          vault: { chainId, address: input.vaultAddress },
          args: {
            adapter: input.adapterAddress,
            exitAssets: input.exitAssets,
            minSharePriceE27: input.minSharePriceE27,
            userAddress: input.onBehalf,
            deadline: input.deadline,
            // A zero recipient is only valid alongside a zero percentage.
            referralFeePct: input.referralFeePct,
            referralFeeRecipient: input.referralFeeRecipient,
          },
        });
        const { args } = decode(tx.data);

        expect(args[0]).toBe(input.vaultAddress);
        expect(args[1]).toBe(input.adapterAddress);
        expect(args[2]).toBe(input.exitAssets);
        expect(args[3]).toBe(input.minSharePriceE27);
        expect(args[4]).toEqual({
          value: 0n,
          nonce: 0n,
          deadline: input.deadline,
          v: 0,
          r: zeroHash,
          s: zeroHash,
        });
        expect(args[5]).toBe(input.referralFeePct);
        expect(args[6]).toBe(input.referralFeeRecipient);
        expect(args[7]).toBe(input.deadline);
        expect(tx.action.args).toMatchObject({
          vault: input.vaultAddress,
          adapter: input.adapterAddress,
          exitAssets: input.exitAssets,
          minSharePriceE27: input.minSharePriceE27,
          referralFeePct: input.referralFeePct,
          referralFeeRecipient: input.referralFeeRecipient,
          onBehalf: input.onBehalf,
          deadline: input.deadline,
        });
      }),
      { numRuns: 50, seed: 20_260_828 },
    );
  });

  test.each([
    { field: "exitAssets", exitAssets: 0n, deadline },
    { field: "exitAssets", exitAssets: -1n, deadline },
    { field: "deadline", exitAssets: 100n, deadline: 0n },
    { field: "deadline", exitAssets: 100n, deadline: -1n },
  ])("error: NonPositiveInputError for $field", (input) => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: input.exitAssets,
          minSharePriceE27,
          userAddress,
          deadline: input.deadline,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError for a negative referralFeePct", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27,
          userAddress,
          deadline,
          referralFeePct: -1n,
          referralFeeRecipient,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test.each([MathLib.WAD, MathLib.WAD + 1n, maxUint256])(
    "error: InputExceedsMaxError for referralFeePct %s",
    (referralFeePct) => {
      expect(() =>
        vaultV2ForceWithdraw({
          vault: { chainId, address: vault },
          args: {
            adapter,
            exitAssets: 100n,
            minSharePriceE27,
            userAddress,
            deadline,
            referralFeePct,
            referralFeeRecipient,
          },
        }),
      ).toThrow(InputExceedsMaxError);
    },
  );

  test("error: NegativeInputError for a negative minSharePriceE27", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27: -1n,
          userAddress,
          deadline,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError for a minSharePriceE27 above uint256", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27: maxUint256 + 1n,
          userAddress,
          deadline,
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  // A uint256-overflowing `exitAssets` or `deadline` must fail with the SDK's typed error rather
  // than viem's `IntegerOutOfRangeError` at encode time, matching the `minSharePriceE27` guard.
  test.each([
    { field: "exitAssets", exitAssets: maxUint256 + 1n, deadline },
    { field: "deadline", exitAssets: 100n, deadline: maxUint256 + 1n },
  ])("error: InputExceedsMaxError for $field above uint256", (input) => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: input.exitAssets,
          minSharePriceE27,
          userAddress,
          deadline: input.deadline,
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: MissingReferralFeeRecipientError for a fee without a recipient", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27,
          userAddress,
          deadline,
          referralFeePct: 1n,
        },
      }),
    ).toThrow(MissingReferralFeeRecipientError);
  });

  test("error: VaultExitBundlesV1PermitMismatchError for a permit on another asset", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27,
          userAddress,
          deadline,
          requirementSignature: permitWith({ asset: adapter }),
        },
      }),
    ).toThrow(VaultExitBundlesV1PermitMismatchError);
  });

  test("error: UnknownAddressError on a chain without VaultExitBundlesV1", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId: unregisteredBundlesChainId, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27,
          userAddress,
          deadline,
        },
      }),
    ).toThrow(UnknownAddressError);
  });

  test("error: UnsupportedChainIdError on a chain with no registry", () => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { chainId: 999_999, address: vault },
        args: {
          adapter,
          exitAssets: 100n,
          minSharePriceE27,
          userAddress,
          deadline,
        },
      }),
    ).toThrow(UnsupportedChainIdError);
  });
});
