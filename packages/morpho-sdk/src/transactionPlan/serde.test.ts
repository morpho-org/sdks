import { fc, test as propertyTest } from "@fast-check/vitest";
import { Token } from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  erc5267Abi,
  getPermitTypedData,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  maxUint256,
  serializeSignature,
  type TypedData,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV2Data,
} from "../../test/fixtures/inKindRedeem.js";
import {
  InvalidTransactionPlanError,
  UnsupportedTransactionPlanActionError,
  UnsupportedTransactionPlanVersionError,
} from "./error.js";
import { buildTransactions, getPendingSignatureRequests } from "./plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "./serde.js";
import type { SignatureRequest, Step, TransactionPlan } from "./types.js";
import { prepareVaultV2Deposit } from "./vaultv2/deposit.js";
import { prepareVaultV2Withdraw } from "./vaultv2/withdraw.js";

const spender = getChainAddress(1, "bundles.vaultBundlesV1");
const inputs = {
  chainId: 1,
  account: IN_KIND_USER,
  vault: IN_KIND_VAULT,
  asset: IN_KIND_ASSET,
  maxSharePrice: 10n ** 27n,
  amount: 100n,
  deadline: 2_000_000_000n,
  referralFeePct: 0n,
  referralFeeRecipient: zeroAddress,
};
const permitArgs = {
  spender,
  amount: inputs.amount,
  deadline: inputs.deadline,
  nonce: 0n,
};
const typedData = getPermitTypedData(
  {
    erc20: new Token({ address: IN_KIND_ASSET, name: "Asset" }),
    owner: IN_KIND_USER,
    allowance: permitArgs.amount,
    ...permitArgs,
  },
  1,
);
const permitRequest = (id: string): SignatureRequest => ({
  id,
  kind: "permit",
  typedData,
  args: permitArgs,
});
const signature = serializeSignature({
  r: toHex(1n, { size: 32 }),
  s: toHex(2n, { size: 32 }),
  yParity: 0,
});
const approveStep = {
  id: "approval",
  label: "Approve",
  action: {
    type: "erc20Approval",
    inputs: {
      token: IN_KIND_ASSET,
      spender,
      amount: inputs.amount,
      chainId: 1,
      account: IN_KIND_USER,
    },
  },
} as const satisfies Step;
const depositStep = {
  id: "deposit",
  label: "Deposit",
  action: {
    type: "vaultV2Deposit",
    inputs,
    signatureRequestIds: { tokenPermit: "tokenPermit" },
  },
} as const satisfies Step;
const pendingPlan: TransactionPlan = {
  version: 1,
  chainId: 1,
  account: IN_KIND_USER,
  expiresAt: Number(inputs.deadline),
  steps: [approveStep, depositStep],
  signatureRequests: [permitRequest("tokenPermit")],
};
const completePlan: TransactionPlan = {
  ...pendingPlan,
  signatureRequests: [{ ...permitRequest("tokenPermit"), signature }],
};
describe("serializeTransactionPlan and parseTransactionPlan", () => {
  test("stored version-1 deposit with a permit builds unchanged", () => {
    const fixture =
      '{"version":1,"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","expiresAt":2000000000,"calldataOrigin":"0xcafe","steps":[{"id":"vaultV2Deposit","label":"Deposit into vault","action":{"type":"vaultV2Deposit","inputs":{"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","vault":"0x0000000000000000000000000000000000001001","amount":{"$bigint":"100"},"deadline":{"$bigint":"2000000000"},"referralFeePct":{"$bigint":"0"},"referralFeeRecipient":"0x0000000000000000000000000000000000000000","asset":"0x0000000000000000000000000000000000001003","maxSharePrice":{"$bigint":"1000000000000000000000000000"}},"signatureRequestIds":{"tokenPermit":"vaultV2Deposit:tokenPermit"}}}],"signatureRequests":[{"id":"vaultV2Deposit:tokenPermit","kind":"permit","typedData":{"domain":{"name":"Asset","version":"1","chainId":1,"verifyingContract":"0x0000000000000000000000000000000000001003"},"types":{"Permit":[{"name":"owner","type":"address"},{"name":"spender","type":"address"},{"name":"value","type":"uint256"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}]},"message":{"owner":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","spender":"0x02912516d49dE997db75B9D7858faAE59209650B","value":{"$bigint":"100"},"nonce":{"$bigint":"7"},"deadline":{"$bigint":"2000000000"}},"primaryType":"Permit"},"args":{"spender":"0x02912516d49dE997db75B9D7858faAE59209650B","amount":{"$bigint":"100"},"deadline":{"$bigint":"2000000000"},"nonce":{"$bigint":"7"}},"signature":"0x078f6df4a0b9d71420081948c52c91b9d3842248521c3a5048d69741e6195a1020945a0fbf591161c1ff9583d61d00afc6ecc91f7ad7a2586159276708460e241b"}]}';
    expect(
      buildTransactions(parseTransactionPlan(fixture)).map(
        ({ to, data, value }) => ({ to, data, value }),
      ),
    ).toEqual([
      {
        to: "0x02912516d49dE997db75B9D7858faAE59209650B",
        data: "0x6bbba4e0000000000000000000000000000000000000000000000000000000000000100100000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000033b2e3c9fd0803ce800000000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000773594000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000077359400000000000000000000000000000000000000000000000000000000000000001b078f6df4a0b9d71420081948c52c91b9d3842248521c3a5048d69741e6195a1020945a0fbf591161c1ff9583d61d00afc6ecc91f7ad7a2586159276708460e24cafe",
        value: 0n,
      },
    ]);
  });

  test("stored version-1 withdrawal with a direct approval builds unchanged", () => {
    const fixture =
      '{"version":1,"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","expiresAt":2000000000,"steps":[{"id":"vaultV2Withdraw:approval","label":"Approve token spending","action":{"type":"erc20Approval","inputs":{"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","token":"0x0000000000000000000000000000000000001001","spender":"0x02912516d49dE997db75B9D7858faAE59209650B","amount":{"$bigint":"115792089237316195423570985008687907853269984665640564039457584007913129639935"}}}},{"id":"vaultV2Withdraw","label":"Withdraw from vault","action":{"type":"vaultV2Withdraw","inputs":{"chainId":1,"account":"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf","vault":"0x0000000000000000000000000000000000001001","amount":{"$bigint":"100"},"deadline":{"$bigint":"2000000000"},"referralFeePct":{"$bigint":"0"},"referralFeeRecipient":"0x0000000000000000000000000000000000000000","requiredShareAllowance":{"$bigint":"120"}},"signatureRequestIds":{}}}],"signatureRequests":[]}';
    expect(
      buildTransactions(parseTransactionPlan(fixture)).map(
        ({ to, data, value }) => ({ to, data, value }),
      ),
    ).toEqual([
      {
        to: "0x0000000000000000000000000000000000001001",
        data: "0x095ea7b300000000000000000000000002912516d49de997db75b9d7858faae59209650bffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        value: 0n,
      },
      {
        to: "0x02912516d49dE997db75B9D7858faAE59209650B",
        data: "0x932084a8000000000000000000000000000000000000000000000000000000000000100100000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000077359400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000077359400",
        value: 0n,
      },
    ]);
  });

  test("round-trips an empty plan", () => {
    const empty = { ...pendingPlan, steps: [], signatureRequests: [] };
    expect(parseTransactionPlan(serializeTransactionPlan(empty))).toEqual(
      empty,
    );
  });

  test("rejects malformed JSON", () => {
    expect(() => parseTransactionPlan("{")).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => parseTransactionPlan("{")).toThrow(
      expect.objectContaining({ path: "$", cause: expect.any(SyntaxError) }),
    );
  });

  test("default: round-trips bigint fields and rebuilds identical calldata", () => {
    const withOrigin: TransactionPlan = {
      ...completePlan,
      calldataOrigin: "0xcafe",
    };
    const restored = parseTransactionPlan(serializeTransactionPlan(withOrigin));
    expect(restored).toEqual(withOrigin);
    expect(buildTransactions(restored)).toEqual(buildTransactions(withOrigin));
    const partial = parseTransactionPlan(serializeTransactionPlan(pendingPlan));
    expect(getPendingSignatureRequests(partial).map(({ id }) => id)).toEqual([
      "tokenPermit",
    ]);
  });
});

const uint256Fields = [
  "steps[0].action.inputs.amount",
  "steps[1].action.inputs.amount",
  "steps[1].action.inputs.maxSharePrice",
  "steps[1].action.inputs.deadline",
  "steps[1].action.inputs.referralFeePct",
  "signatureRequests[0].args.amount",
  "signatureRequests[0].args.nonce",
  "signatureRequests[0].args.deadline",
  "signatureRequests[0].typedData.message.value",
  "signatureRequests[0].typedData.message.nonce",
  "signatureRequests[0].typedData.message.deadline",
];
const addressFields = [
  "account",
  "steps[0].action.inputs.account",
  "steps[0].action.inputs.token",
  "steps[0].action.inputs.spender",
  "steps[1].action.inputs.account",
  "steps[1].action.inputs.vault",
  "steps[1].action.inputs.asset",
  "steps[1].action.inputs.referralFeeRecipient",
  "signatureRequests[0].args.spender",
  "signatureRequests[0].typedData.domain.verifyingContract",
  "signatureRequests[0].typedData.message.owner",
  "signatureRequests[0].typedData.message.spender",
];

describe("restored plan validation", () => {
  test.each(["null", "[]", '"plan"', "1", "true"])(
    "rejects non-object root %s",
    (json) => {
      expect(() => parseTransactionPlan(json)).toThrow(
        InvalidTransactionPlanError,
      );
      expect(() => parseTransactionPlan(json)).toThrow(
        expect.objectContaining({ path: "$" }),
      );
    },
  );

  test.each([
    { path: "version", value: undefined },
    { path: "version", value: "1" },
    { path: "version", value: 1.5 },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", undefined].map(
      (value) => ({ path: "chainId", value }),
    ),
    ...[1.5, Number.MAX_SAFE_INTEGER + 1, "1", undefined].map((value) => ({
      path: "expiresAt",
      value,
    })),
    ...["0x1", "0xzz", null].map((value) => ({
      path: "calldataOrigin",
      value,
    })),
    { path: "steps", value: {} },
    { path: "steps", value: undefined },
    { path: "signatureRequests", value: null },
    { path: "signatureRequests", value: undefined },
    { path: "steps[0]", value: null },
    { path: "steps[0].id", value: 1 },
    { path: "steps[0].label", value: undefined },
    { path: "steps[0].action", value: [] },
    { path: "steps[0].action.type", value: undefined },
    { path: "steps[0].action.inputs", value: null },
    { path: "steps[1].action.inputs", value: undefined },
    { path: "steps[0].action.inputs.chainId", value: 0 },
    {
      path: "steps[1].action.inputs.chainId",
      value: Number.MAX_SAFE_INTEGER + 1,
    },
    { path: "steps[1].id", value: "approval" },
    { path: "steps[1].action.signatureRequestIds", value: [] },
    { path: "steps[1].action.signatureRequestIds.tokenPermit", value: 1 },
    {
      path: "steps[1].action.signatureRequestIds.tokenPermit",
      value: "missing",
    },
    { path: "signatureRequests[0]", value: null },
    { path: "signatureRequests[0].id", value: undefined },
    { path: "signatureRequests[0].kind", value: "permit2" },
    { path: "signatureRequests[0].kind", value: null },
    { path: "signatureRequests[0].args", value: [] },
    { path: "signatureRequests[0].typedData", value: null },
    { path: "signatureRequests[0].typedData.domain", value: [] },
    { path: "signatureRequests[0].typedData.domain.chainId", value: 0 },
    { path: "signatureRequests[0].typedData.domain.name", value: 1 },
    { path: "signatureRequests[0].typedData.domain.version", value: 1 },
    { path: "signatureRequests[0].typedData.domain.salt", value: "0x1" },
    { path: "signatureRequests[0].typedData.types", value: undefined },
    { path: "signatureRequests[0].typedData.types.Permit", value: {} },
    { path: "signatureRequests[0].typedData.types.Permit[0]", value: null },
    { path: "signatureRequests[0].typedData.types.Permit[0].name", value: 1 },
    {
      path: "signatureRequests[0].typedData.types.Permit[0].type",
      value: undefined,
    },
    { path: "signatureRequests[0].typedData.primaryType", value: 1 },
    { path: "signatureRequests[0].typedData.message", value: [] },
    { path: "signatureRequests[0].signature", value: "0x1" },
    { path: "signatureRequests[0].signature", value: 1 },
    ...addressFields.map((path) => ({ path, value: "0x1234" })),
    ...uint256Fields.flatMap((path) =>
      [
        1,
        undefined,
        { $bigint: "-1" },
        { $bigint: (maxUint256 + 1n).toString() },
      ].map((value) => ({ path, value })),
    ),
  ])("rejects malformed field $path = $value", ({ path, value }) => {
    const saved = JSON.parse(serializeTransactionPlan(pendingPlan)) as Record<
      string,
      unknown
    >;
    const keys = path.replaceAll(/\[(\d+)\]/g, ".$1").split(".");
    let target = saved;
    for (const key of keys.slice(0, -1))
      target = target[key] as Record<string, unknown>;
    target[keys.at(-1)!] = value;
    const parse = () => parseTransactionPlan(JSON.stringify(saved));
    expect(parse).toThrow(InvalidTransactionPlanError);
    const errorPath =
      path === "steps[1].action.inputs.amount" && value === undefined
        ? "steps[1].action.inputs"
        : path;
    expect(parse).toThrow(
      expect.objectContaining({
        path: `$.${errorPath}`,
        reason: expect.any(String),
      }),
    );
  });

  test.each([2, -1])("preserves the typed version error for %s", (version) => {
    expect(() =>
      parseTransactionPlan(
        serializeTransactionPlan({
          ...pendingPlan,
          version,
        } as unknown as TransactionPlan),
      ),
    ).toThrow(new UnsupportedTransactionPlanVersionError(version));
  });

  test.each([
    "futureAction",
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
  ])("preserves the typed action error for %s", (type) => {
    const saved = serializeTransactionPlan(pendingPlan).replace(
      '"type":"erc20Approval"',
      `"type":"${type}"`,
    );
    expect(() => parseTransactionPlan(saved)).toThrow(
      new UnsupportedTransactionPlanActionError(type),
    );
  });

  test("wraps a malformed bigint tag in the typed parse error", () => {
    const saved = serializeTransactionPlan(pendingPlan).replace(
      '"$bigint":"100"',
      '"$bigint":"invalid"',
    );
    expect(() => parseTransactionPlan(saved)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => parseTransactionPlan(saved)).toThrow(
      expect.objectContaining({ path: "$", cause: expect.any(SyntaxError) }),
    );
  });

  test("rejects duplicate request IDs", () => {
    const saved = {
      ...pendingPlan,
      signatureRequests: [
        ...pendingPlan.signatureRequests,
        pendingPlan.signatureRequests[0]!,
      ],
    };
    expect(() => parseTransactionPlan(serializeTransactionPlan(saved))).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => parseTransactionPlan(serializeTransactionPlan(saved))).toThrow(
      expect.objectContaining({ path: "$.signatureRequests[1].id" }),
    );
  });

  test.each(["chainId", "account"] as const)(
    "rejects each action's inconsistent %s",
    (field) => {
      for (const index of [0, 1]) {
        const inconsistent = structuredClone(pendingPlan);
        Object.assign(inconsistent.steps[index]!.action.inputs, {
          [field]: field === "chainId" ? 2 : zeroAddress,
        });
        const saved = serializeTransactionPlan(inconsistent);
        expect(() => parseTransactionPlan(saved)).toThrow(
          InvalidTransactionPlanError,
        );
        expect(() => parseTransactionPlan(saved)).toThrow(
          expect.objectContaining({
            path: `$.steps[${index}].action.inputs.${field}`,
          }),
        );
      }
    },
  );

  test.each([
    { section: "domain", field: "chainId", value: 2 },
    { section: "domain", field: "verifyingContract", value: zeroAddress },
    { section: "message", field: "owner", value: zeroAddress },
    { section: "message", field: "spender", value: zeroAddress },
    { section: "message", field: "value", value: 101n },
    { section: "message", field: "nonce", value: 1n },
    { section: "message", field: "deadline", value: 1n },
  ] as const)(
    "validates signed and unsigned permit consistency at $section.$field",
    ({ section, field, value }) => {
      for (const storedSignature of [undefined, "0x1234" as const]) {
        const request = {
          ...permitRequest("tokenPermit"),
          signature: storedSignature,
          typedData: {
            ...typedData,
            [section]: { ...typedData[section], [field]: value },
          },
        };
        const saved = serializeTransactionPlan({
          ...pendingPlan,
          signatureRequests: [request],
        });
        expect(() => parseTransactionPlan(saved)).toThrow(
          InvalidTransactionPlanError,
        );
        expect(() => parseTransactionPlan(saved)).toThrow(
          expect.objectContaining({
            path: `$.signatureRequests[0].typedData.${section}.${field}`,
            cause: expect.any(Error),
          }),
        );
      }
    },
  );

  test("reuses amount and spender consistency checks", () => {
    for (const [field, request] of [
      [
        "amount",
        {
          ...permitRequest("tokenPermit"),
          args: { ...permitArgs, amount: 101n },
          typedData: {
            ...typedData,
            message: { ...typedData.message, value: 101n },
          },
        },
      ],
      [
        "spender",
        {
          ...permitRequest("tokenPermit"),
          args: { ...permitArgs, spender: zeroAddress },
        },
      ],
    ] as const) {
      const saved = serializeTransactionPlan({
        ...pendingPlan,
        signatureRequests: [request],
      });
      expect(() => parseTransactionPlan(saved)).toThrow(
        InvalidTransactionPlanError,
      );
      expect(() => parseTransactionPlan(saved)).toThrow(
        expect.objectContaining({
          path: `$.signatureRequests[0].args.${field}`,
        }),
      );
    }
  });

  test("rejects an unreferenced request", () => {
    const saved = serializeTransactionPlan({
      ...pendingPlan,
      steps: [approveStep],
    });
    expect(() => parseTransactionPlan(saved)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => parseTransactionPlan(saved)).toThrow(
      expect.objectContaining({ path: "$.signatureRequests[0].id" }),
    );
  });

  test("reuses primary-type consistency validation", () => {
    const request = {
      ...permitRequest("tokenPermit"),
      typedData: {
        ...typedData,
        primaryType: "Other",
        types: { ...typedData.types, Other: typedData.types.Permit },
      },
    };
    const saved = serializeTransactionPlan({
      ...pendingPlan,
      signatureRequests: [request],
    });
    expect(() => parseTransactionPlan(saved)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => parseTransactionPlan(saved)).toThrow(
      expect.objectContaining({
        path: "$.signatureRequests[0].typedData.primaryType",
      }),
    );
  });

  test("requires exclusive deposit funding and validates native uint256", () => {
    for (const [fields, path] of [
      [{ amount: 1n, nativeAmount: 1n }, "$.steps[0].action.inputs"],
      [
        { amount: undefined, nativeAmount: undefined },
        "$.steps[0].action.inputs",
      ],
      [
        { amount: undefined, nativeAmount: -1n },
        "$.steps[0].action.inputs.nativeAmount",
      ],
    ] as const) {
      const saved = serializeTransactionPlan({
        ...pendingPlan,
        steps: [
          {
            ...depositStep,
            action: { ...depositStep.action, inputs: { ...inputs, ...fields } },
          },
        ],
        signatureRequests: [],
      } as unknown as TransactionPlan);
      expect(() => parseTransactionPlan(saved)).toThrow(
        InvalidTransactionPlanError,
      );
      expect(() => parseTransactionPlan(saved)).toThrow(
        expect.objectContaining({ path }),
      );
    }
    const native: TransactionPlan = {
      ...pendingPlan,
      steps: [
        {
          ...depositStep,
          action: {
            ...depositStep.action,
            inputs: { ...inputs, amount: undefined, nativeAmount: maxUint256 },
            signatureRequestIds: {},
          },
        },
      ],
      signatureRequests: [],
    };
    expect(parseTransactionPlan(serializeTransactionPlan(native))).toEqual(
      native,
    );
  });

  test.each(["amount", "requiredShareAllowance", "deadline", "referralFeePct"])(
    "validates withdrawal uint256 %s",
    (field) => {
      for (const value of [1, undefined, -1n, maxUint256 + 1n]) {
        const saved = serializeTransactionPlan({
          ...pendingPlan,
          steps: [
            {
              ...depositStep,
              action: {
                type: "vaultV2Withdraw",
                inputs: {
                  ...inputs,
                  requiredShareAllowance: 100n,
                  [field]: value,
                },
                signatureRequestIds: {},
              },
            },
          ],
          signatureRequests: [],
        } as unknown as TransactionPlan);
        expect(() => parseTransactionPlan(saved)).toThrow(
          InvalidTransactionPlanError,
        );
        expect(() => parseTransactionPlan(saved)).toThrow(
          expect.objectContaining({
            path: `$.steps[0].action.inputs.${field}`,
          }),
        );
      }
    },
  );

  test("allows extra keys, expired plans, unverified signatures and well-formed tampering", () => {
    const changed = structuredClone(completePlan);
    Object.assign(changed, {
      expiresAt: -1,
      calldataOrigin: "0x",
      extra: { retained: true },
    });
    for (const step of changed.steps) {
      Object.assign(step, { extra: true });
      Object.assign(step.action, { extra: true });
      Object.assign(step.action.inputs, { extra: 1 });
      if (step.action.type === "vaultV2Deposit")
        Object.assign(step.action.inputs, { maxSharePrice: maxUint256 });
    }
    for (const request of changed.signatureRequests) {
      Object.assign(request, { extra: true, signature: "0x1234" });
      Object.assign(request.args, { extra: true });
      Object.assign(request.typedData, { extra: true });
      Object.assign(request.typedData.domain!, { extra: true });
      Object.assign(request.typedData.message, { extra: true });
    }
    expect(parseTransactionPlan(serializeTransactionPlan(changed))).toEqual(
      changed,
    );
  });
});

propertyTest.prop([
  fc.record({
    amount: fc.bigInt({ min: 1n, max: 1_000_000_000n }),
    withdraw: fc.boolean(),
    sufficientAllowance: fc.boolean(),
    supportSignature: fc.boolean(),
    nonce: fc.bigInt({ min: 0n, max: maxUint256 }),
  }),
])(
  "round-trips prepared deposit and withdrawal plans",
  async ({
    amount,
    withdraw,
    sufficientAllowance,
    supportSignature,
    nonce,
  }) => {
    const handle = createMockClient(mainnet);
    const vaultData = inKindVaultV2Data();
    for (const address of [vaultData.asset, vaultData.address]) {
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "allowance",
        result: sufficientAllowance ? maxUint256 : 0n,
      });
      mockRead(handle, {
        address,
        abi: erc2612Abi,
        functionName: "nonces",
        result: nonce,
      });
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "name",
        result: "Asset",
      });
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "symbol",
        result: "ASSET",
      });
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "decimals",
        result: 18,
      });
      mockRead(handle, {
        address,
        abi: erc5267Abi,
        functionName: "eip712Domain",
        result: [
          "0x0f",
          "Asset",
          "1",
          1n,
          address,
          toHex(0n, { size: 32 }),
          [],
        ],
      });
      const domain = {
        name: "Asset",
        version: "1",
        chainId: 1,
        verifyingContract: address,
      };
      mockRead(handle, {
        address: address,
        abi: erc2612Abi,
        functionName: "DOMAIN_SEPARATOR",
        result: hashDomain<TypedData>({
          domain,
          types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
        }),
      });
    }
    const prepare = withdraw ? prepareVaultV2Withdraw : prepareVaultV2Deposit;
    const plan = await prepare(handle.client, {
      vault: vaultData.address,
      vaultData,
      chainId: 1,
      account: IN_KIND_USER,
      amount,
      expiresAt: Number(Time.timestamp() + 3600n),
      supportSignature,
      deployless: false,
      calldataOrigin: "0xcafe",
    });
    const calls = handle.request.mock.calls.length;
    expect(parseTransactionPlan(serializeTransactionPlan(plan))).toEqual(plan);
    expect(handle.request).toHaveBeenCalledTimes(calls);
  },
);
