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
import {
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
} from "./plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "./serde.js";
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
  version: 2,
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
          assets: args.amount,
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

test("audit: stored signatures are recovered at every boundary", async () => {
  const signature = await other.signTypedData(typedData);
  const stored = {
    ...plan,
    signatureRequests: [{ ...plan.signatureRequests[0]!, signature }],
  };
  expect(() => buildTransactions(stored)).toThrow(InvalidSignatureError);
  expect(() => getPendingSignatureRequests(stored)).toThrow(
    InvalidSignatureError,
  );
  expect(() => applySignatures(stored, [])).toThrow(InvalidSignatureError);
  expect(() => parseTransactionPlan(serializeTransactionPlan(stored))).toThrow(
    InvalidTransactionPlanError,
  );
});

test("audit: a consistently changed permit amount invalidates the old signature", async () => {
  const stored = structuredClone(plan);
  const signature = await owner.signTypedData(typedData);
  Object.assign(stored.steps[0]!.action.inputs, { assets: 101n });
  Object.assign(stored.signatureRequests[0]!.args, { amount: 101n });
  Object.assign(stored.signatureRequests[0]!.typedData.message, {
    value: 101n,
  });
  Object.assign(stored.signatureRequests[0]!, { signature });
  expect(() => buildTransactions(stored)).toThrow(InvalidSignatureError);
});

test("audit: signed permits still validate action consistency", async () => {
  const stored = structuredClone(plan);
  Object.assign(stored.steps[0]!.action.inputs, { assets: 101n });
  Object.assign(stored.signatureRequests[0]!, {
    signature: await owner.signTypedData(typedData),
  });
  expect(() => getPendingSignatureRequests(stored)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
});

test.each(["0x1", "0xgg", `0x${"00".repeat(1024 * 1024 + 1)}`])(
  "audit: rejects malformed or oversized origin %#",
  (calldataOrigin) => {
    const stored = { ...plan, calldataOrigin } as TransactionPlan;
    expect(() => buildTransactions(stored)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => getPendingSignatureRequests(stored)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(stored)),
    ).toThrow(InvalidTransactionPlanError);
  },
);

test.each(["chain", "account", "requestId", "stepId", "expiry"])(
  "audit: validates direct plan headers: %s",
  (field) => {
    const stored = structuredClone(plan);
    if (field === "chain") Object.assign(stored, { chainId: 8453 });
    if (field === "account") Object.assign(stored, { account: other.address });
    if (field === "requestId")
      Object.assign(stored, {
        signatureRequests: [
          ...stored.signatureRequests,
          stored.signatureRequests[0],
        ],
      });
    if (field === "stepId")
      Object.assign(stored, { steps: [...stored.steps, stored.steps[0]] });
    if (field === "expiry")
      Object.assign(stored, { expiresAt: Number(args.deadline) + 1 });
    expect(() => getPendingSignatureRequests(stored)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => buildTransactions(stored)).toThrow(
      InvalidTransactionPlanError,
    );
  },
);

test("audit: rejects one permit referenced by two steps", () => {
  const stored = {
    ...plan,
    steps: [...plan.steps, { ...plan.steps[0]!, id: "second" }],
  };
  expect(() => getPendingSignatureRequests(stored)).toThrow(
    TransactionPlanSignatureMismatchError,
  );
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

test("repairs only the stored signatures named by the updates", async () => {
  const badSignature = await other.signTypedData(typedData);
  const signature = await owner.signTypedData(typedData);
  const request = plan.signatureRequests[0]!;
  const step = plan.steps[0]!;
  assert(step.action.type === "vaultV2Deposit");
  const stored: TransactionPlan = deepFreeze({
    ...plan,
    steps: [
      step,
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
      { ...request, signature: badSignature },
      { ...request, id: "secondPermit" },
    ],
  });
  const repaired = applySignatures(stored, [{ id: "permit", signature }]);
  expect(repaired.signatureRequests[0]?.signature).toBe(signature);
  expect(getPendingSignatureRequests(repaired).map(({ id }) => id)).toEqual([
    "secondPermit",
  ]);
  expect(stored.signatureRequests[0]?.signature).toBe(badSignature);
  expect(() =>
    applySignatures(stored, [{ id: "secondPermit", signature }]),
  ).toThrow(InvalidSignatureError);
  expect(() =>
    applySignatures(stored, [{ id: "permit", signature: badSignature }]),
  ).toThrow(InvalidSignatureError);
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

test("rejects a header chain that disagrees with the action", async () => {
  const signature = await owner.signTypedData(typedData);
  expect(() =>
    applySignatures({ ...plan, chainId: 8453 }, [{ id: "permit", signature }]),
  ).toThrow(InvalidTransactionPlanError);
});

// fast-check reads Vitest's global current test, which concurrent siblings can clear.
propertyTest.sequential.prop([
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
    assert(request.kind === "permit");
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
      account: account.address,
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
