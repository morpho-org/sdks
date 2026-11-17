import { fc, test as propertyTest } from "@fast-check/vitest";
import { Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  concatHex,
  type Hex,
  parseSignature,
  recoverTypedDataAddress,
  serializeCompactSignature,
  serializeSignature,
  signatureToCompactSignature,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assert, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_VAULT,
} from "../../test/fixtures/inKindRedeem.js";
import {
  BundlesPermitMismatchError,
  InvalidSignatureError,
} from "../types/error.js";
import { TransactionPlanSignatureMismatchError } from "./error.js";
import { applySignatures, buildTransactions } from "./plan.js";
import type { TransactionPlan } from "./types.js";

const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
const other = privateKeyToAccount(toHex(2n, { size: 32 }));
const args = {
  spender: getChainAddress(1, "bundles.vaultBundlesV1"),
  amount: 100n,
  nonce: 0n,
  deadline: 2_000_000_000n,
};
const typedData = getPermitTypedData(
  {
    erc20: new Token({ address: IN_KIND_ASSET, name: "Asset" }),
    owner: owner.address,
    allowance: args.amount,
    ...args,
  },
  1,
);
const plan: TransactionPlan = deepFreeze({
  version: 1,
  chainId: 1,
  account: owner.address,
  expiresAt: Number(args.deadline),
  steps: [
    {
      id: "deposit",
      label: "Deposit",
      action: {
        type: "vaultV2Deposit",
        inputs: {
          chainId: 1,
          account: owner.address,
          vault: IN_KIND_VAULT,
          asset: IN_KIND_ASSET,
          amount: args.amount,
          deadline: args.deadline,
          maxSharePrice: 10n ** 27n,
          referralFeePct: 0n,
          referralFeeRecipient: zeroAddress,
        },
        signatureRequestIds: { tokenPermit: "permit" },
      },
    },
  ],
  signatureRequests: [{ id: "permit", kind: "permit", args, typedData }],
});

test.each([false, true])(
  "verifies and serializes the owner's signature without mutation, compact: %s",
  async (compact) => {
    const serialized = await owner.signTypedData(typedData);
    const signature = compact
      ? serializeCompactSignature(
          signatureToCompactSignature(parseSignature(serialized)),
        )
      : serialized;
    const updates = deepFreeze([{ id: "permit", signature }]);
    const signed = applySignatures(plan, updates);
    expect(signed).not.toBe(plan);
    expect(signed.steps).toBe(plan.steps);
    expect(signed.signatureRequests[0]?.signature).toBe(serialized);
    expect(plan.signatureRequests[0]?.signature).toBeUndefined();
    expect(updates[0]?.signature).toBe(signature);
    expect(buildTransactions(signed)).toHaveLength(1);
  },
);

test("preserves omitted signatures and shares untouched requests", async () => {
  const request = plan.signatureRequests[0]!;
  const step = plan.steps[0]!;
  assert(step.action.type === "vaultV2Deposit");
  const original: TransactionPlan = {
    ...plan,
    steps: [
      ...plan.steps,
      {
        ...step,
        id: "second",
        action: {
          ...step.action,
          signatureRequestIds: { tokenPermit: "secondPermit" },
        },
      },
    ],
    signatureRequests: [
      request,
      {
        ...request,
        id: "secondPermit",
        signature: await owner.signTypedData(typedData),
      },
    ],
  };
  const signed = applySignatures(original, [
    { id: "permit", signature: await owner.signTypedData(typedData) },
  ]);
  expect(signed.signatureRequests[1]).toBe(original.signatureRequests[1]);
  expect(applySignatures(signed, [])).toBe(signed);
});

test("rejects a signature from another key", async () => {
  const signature = await other.signTypedData(typedData);
  expect(() => applySignatures(plan, [{ id: "permit", signature }])).toThrow(
    InvalidSignatureError,
  );
});

test.each([false, true])(
  "validates every request before signatures, already signed: %s",
  (signed) => {
    const tampered: TransactionPlan = {
      ...plan,
      signatureRequests: [
        {
          ...plan.signatureRequests[0]!,
          signature: signed ? "0x1234" : undefined,
          typedData: {
            ...typedData,
            message: { ...typedData.message, owner: other.address },
          },
        },
      ],
    };
    for (const signatures of [
      [],
      [{ id: "permit", signature: "0x" as const }],
    ]) {
      expect(() => applySignatures(tampered, signatures)).toThrow(
        new TransactionPlanSignatureMismatchError("permit", "message.owner"),
      );
    }
  },
);

test("rejects changed typed data even when it remains action-consistent", async () => {
  const signature = await owner.signTypedData(typedData);
  const tampered: TransactionPlan = {
    ...plan,
    signatureRequests: [
      {
        ...plan.signatureRequests[0]!,
        typedData: {
          ...typedData,
          domain: { ...typedData.domain, name: "Other" },
        },
      },
    ],
  };
  expect(() =>
    applySignatures(tampered, [{ id: "permit", signature }]),
  ).toThrow(InvalidSignatureError);
});

test("rejects unknown input IDs before parsing signatures", () => {
  expect(() =>
    applySignatures(plan, [{ id: "unknown", signature: "0x" }]),
  ).toThrow(new TransactionPlanSignatureMismatchError("unknown", "reference"));
});

test("rejects duplicate input IDs before parsing signatures", () => {
  expect(() =>
    applySignatures(plan, [
      { id: "permit", signature: "0x" },
      { id: "permit", signature: "0x1234" },
    ]),
  ).toThrow(new TransactionPlanSignatureMismatchError("permit", "duplicate"));
});

test.each(["0x", "0x1234", toHex(1n, { size: 96 })] as const)(
  "rejects unsupported signature format %s with the builders' typed error",
  (signature) => {
    expect(() => applySignatures(plan, [{ id: "permit", signature }])).toThrow(
      BundlesPermitMismatchError,
    );
  },
);

test.each([
  { r: 0n, s: 1n },
  { r: 1n, s: 0n },
  { r: secp256k1.CURVE.n, s: 1n },
])(
  "rejects invalid ECDSA scalars %s with the parser's typed error",
  ({ r, s }) => {
    const signature = concatHex([
      toHex(r, { size: 32 }),
      toHex(s, { size: 32 }),
      "0x1b",
    ]);
    expect(() => applySignatures(plan, [{ id: "permit", signature }])).toThrow(
      BundlesPermitMismatchError,
    );
  },
);

test("rejects high-s even when recovery matches the owner", async () => {
  const parsed = parseSignature(await owner.signTypedData(typedData));
  const signature = serializeSignature({
    r: parsed.r,
    s: toHex(secp256k1.CURVE.n - BigInt(parsed.s), { size: 32 }),
    yParity: parsed.yParity === 0 ? 1 : 0,
  });
  expect(await recoverTypedDataAddress({ ...typedData, signature })).toBe(
    owner.address,
  );
  expect(() => applySignatures(plan, [{ id: "permit", signature }])).toThrow(
    InvalidSignatureError,
  );
});

test("empty input validates requests and returns the identical plan", () => {
  expect(applySignatures(plan, [])).toBe(plan);
  const empty = { ...plan, steps: [], signatureRequests: [] };
  expect(applySignatures(empty, [])).toBe(empty);
  const unreferenced = { ...plan, steps: [] };
  expect(() => applySignatures(unreferenced, [])).toThrow(
    new TransactionPlanSignatureMismatchError("permit", "reference"),
  );
});

test("uses the action and EIP-712 chain rather than the informational header", async () => {
  const signature = await owner.signTypedData(typedData);
  const signed = applySignatures({ ...plan, chainId: 8453 }, [
    { id: "permit", signature },
  ]);
  expect(signed.signatureRequests[0]?.signature).toBe(signature);
});

propertyTest.prop([
  fc.record({
    key: fc.bigInt({ min: 1n, max: secp256k1.CURVE.n - 1n }),
    nonce: fc.bigInt({ min: 0n, max: 2n ** 256n - 1n }),
    compact: fc.boolean(),
  }),
])(
  "synchronous recovery agrees with viem recoverTypedDataAddress",
  async ({ key, nonce, compact }) => {
    const account = privateKeyToAccount(toHex(key, { size: 32 }));
    const request = plan.signatureRequests[0]!;
    const data = {
      ...typedData,
      message: { ...typedData.message, owner: account.address, nonce },
    };
    const serialized = await account.signTypedData(data);
    const signature: Hex = compact
      ? serializeCompactSignature(
          signatureToCompactSignature(parseSignature(serialized)),
        )
      : serialized;
    const step = plan.steps[0]!;
    assert(step.action.type === "vaultV2Deposit");
    const target: TransactionPlan = {
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: { ...step.action.inputs, account: account.address },
          },
        },
      ],
      signatureRequests: [
        { ...request, args: { ...args, nonce }, typedData: data },
      ],
    };
    const recovered = await recoverTypedDataAddress({
      ...data,
      signature: serialized,
    });
    expect(recovered).toBe(account.address);
    expect(
      applySignatures(target, [{ id: "permit", signature }])
        .signatureRequests[0]?.signature,
    ).toBe(serialized);
  },
);
