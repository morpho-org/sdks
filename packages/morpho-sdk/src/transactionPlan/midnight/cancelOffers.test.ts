import { midnightAbi } from "@morpho-org/midnight-sdk";
import {
  ChainId,
  getChainAddress,
  getChainAddresses,
  registerCustomAddresses,
  UnknownAddressError,
} from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import {
  type Address,
  concatHex,
  decodeFunctionData,
  type Hex,
  maxUint128,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  ChainIdMismatchError,
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  InvalidBigIntInputError,
  InvalidMidnightHexInputError,
  MissingContractCodeError,
} from "../../types/index.js";
import { InvalidTransactionPlanError, ZeroAccountError } from "../error.js";
import {
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  buildMidnightCancelOffers,
  prepareMidnightCancelOffers,
  validateMidnightCancelOffersPlanAction,
} from "./cancelOffers.js";

const chainId = ChainId.BaseMainnet;
const account = "0x1111111111111111111111111111111111111111" as Address;
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
const now = 1_700_000_000n;
const params = { chainId, account, groups: [groupA], now };

const prepare = (overrides: Partial<typeof params> = {}) =>
  prepareMidnightCancelOffers(createMockClient(base).client, {
    ...params,
    ...overrides,
  });

const decodeCancellations = (data: Hex) => {
  const decode = (call: Hex) => {
    const decoded = decodeFunctionData({ abi: midnightAbi, data: call });
    if (decoded.functionName !== "setConsumed") {
      throw new Error(`expected setConsumed, got ${decoded.functionName}`);
    }
    return decoded.args;
  };
  const outer = decodeFunctionData({ abi: midnightAbi, data });
  if (outer.functionName === "multicall") {
    return { multicall: true, calls: outer.args[0].map(decode) };
  }
  return { multicall: false, calls: [decode(data)] };
};

describe("prepareMidnightCancelOffers", () => {
  test("default: one group stores a plain recipe and builds a bare setConsumed", async () => {
    const plan = await prepare();

    expect(plan).toEqual({
      version: 2,
      chainId,
      account,
      expiresAt: Number(now + 7_200n),
      steps: [
        {
          id: "midnightCancelOffers",
          label: "Cancel Midnight offers",
          action: {
            type: "midnightCancelOffers",
            inputs: { chainId, account, groups: [groupA] },
          },
        },
      ],
      signatureRequests: [],
    });
    expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
    expect(getPendingSignatureRequests(plan)).toEqual([]);
    const [tx] = buildTransactions(plan);
    expect(tx?.to).toBe(getChainAddress(chainId, "midnight"));
    expect(tx?.value).toBe(0n);
    expect(decodeCancellations(tx!.data)).toEqual({
      multicall: false,
      calls: [[groupA, maxUint128, account]],
    });
  });

  test("behavior: several groups build one core multicall in list order", async () => {
    const plan = await prepare({ groups: [groupB, groupA] });
    const [tx] = buildTransactions(plan);

    expect(tx?.to).toBe(getChainAddress(chainId, "midnight"));
    expect(decodeCancellations(tx!.data)).toEqual({
      multicall: true,
      calls: [
        [groupB, maxUint128, account],
        [groupA, maxUint128, account],
      ],
    });
  });

  test("behavior: a spread referral fee cannot reject a cancellation that never charges one", async () => {
    const plan = await prepareMidnightCancelOffers(
      createMockClient(base).client,
      {
        ...params,
        referralFee: { bps: 20_000, recipient: account },
      } as Parameters<typeof prepareMidnightCancelOffers>[1],
    );
    expect(plan.steps).toHaveLength(1);
  });

  test("behavior: builds byte-identical transactions after serialize and parse", async () => {
    for (const groups of [[groupA], [groupA, groupB]]) {
      const plan = await prepare({ groups });
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));

      expect(restored).toEqual(plan);
      expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
    }
  });

  test("behavior: appends calldata origin to the built transaction", async () => {
    const calldataOrigin = "0xbeef" as Hex;
    const plan = await prepareMidnightCancelOffers(
      createMockClient(base).client,
      { ...params, calldataOrigin },
    );
    const step = plan.steps[0]!;

    expect(buildTransaction(plan, step).data).toBe(
      concatHex([
        buildMidnightCancelOffers(
          step.action as Parameters<typeof buildMidnightCancelOffers>[0],
        ).data,
        calldataOrigin,
      ]),
    );
  });

  test("behavior: does not freeze the caller's group list", async () => {
    const groups = [groupA, groupB];
    await prepare({ groups });

    expect(Object.isFrozen(groups)).toBe(false);
  });

  test("behavior: builds on a Midnight deployment without MidnightBundlesV2", async () => {
    const customChainId = 999_324;
    const { midnightBundlesV2, ...addresses } = getChainAddresses(chainId);
    const { midnight } = addresses;
    registerCustomAddresses({ addresses: { [customChainId]: addresses } });
    expect(() => getChainAddress(customChainId, "midnightBundlesV2")).toThrow(
      UnknownAddressError,
    );

    const plan = await prepareMidnightCancelOffers(
      createMockClient({ ...base, id: customChainId }).client,
      { ...params, chainId: customChainId, groups: [groupA, groupB] },
    );
    const [tx] = buildTransactions(plan);

    expect(tx?.to).toBe(midnight);
    expect(tx?.to).not.toBe(midnightBundlesV2);
  });

  test("error: EmptyMidnightGroupCancellationsError", async () => {
    await expect(prepare({ groups: [] })).rejects.toBeInstanceOf(
      EmptyMidnightGroupCancellationsError,
    );
  });

  test.each([
    ["exact", [groupA, groupA]],
    ["case-insensitive", [groupA, groupA.toUpperCase().replace("0X", "0x")]],
  ] as const)(
    "error: DuplicateMidnightGroupCancellationError on %s duplicates",
    async (_, groups) => {
      await expect(
        prepare({ groups: groups as readonly Hex[] as Hex[] }),
      ).rejects.toBeInstanceOf(DuplicateMidnightGroupCancellationError);
    },
  );

  test.each([
    ["short", "0xaa"],
    ["not hex", `0x${"zz".repeat(32)}`],
  ])(
    "error: InvalidMidnightHexInputError when a group is %s",
    async (_, group) => {
      await expect(prepare({ groups: [group as Hex] })).rejects.toBeInstanceOf(
        InvalidMidnightHexInputError,
      );
    },
  );

  test.each([
    ["null", null],
    ["a number", 1],
    ["an object", {}],
  ])(
    "error: InvalidMidnightHexInputError naming the index when a group is %s, before RPC",
    async (_, group) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightCancelOffers(client, {
          ...params,
          groups: [groupA, group as unknown as Hex],
        }),
      ).rejects.toMatchObject({
        constructor: InvalidMidnightHexInputError,
        field: "groups[1]",
        reason: "notHex",
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: InvalidBigIntInputError for a decimal-string now without expiresAt before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightCancelOffers(client, {
        chainId,
        account,
        groups: [groupA],
        now: "1800000000" as unknown as bigint,
      }),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: ZeroAccountError", async () => {
    await expect(prepare({ account: zeroAddress })).rejects.toBeInstanceOf(
      ZeroAccountError,
    );
  });

  test("error: UnknownAddressError on a chain without Midnight", async () => {
    const customChainId = 999_325;
    const { midnight: _midnight, ...addresses } = getChainAddresses(chainId);
    registerCustomAddresses({ addresses: { [customChainId]: addresses } });

    await expect(
      prepareMidnightCancelOffers(
        createMockClient({ ...base, id: customChainId }).client,
        { ...params, chainId: customChainId },
      ),
    ).rejects.toBeInstanceOf(UnknownAddressError);
  });

  test("error: ChainIdMismatchError when the client serves another chain", async () => {
    await expect(
      prepareMidnightCancelOffers(createMockClient(mainnet).client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: [INV-05] ChainIdMismatchError when a Base client's RPC serves another chain", async () => {
    const handle = createMockClient(base);
    const request = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (args) =>
      args.method === "eth_chainId" ? "0x1" : request(args),
    );

    await expect(
      prepareMidnightCancelOffers(handle.client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});

describe("prepareMidnightCancelOffers contract code", () => {
  test("error: rejects missing Midnight core code", async () => {
    const midnight = getChainAddress(chainId, "midnight");
    const { client: codeless, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === midnight) {
        return "0x";
      }
      return defaultRequest(args);
    });
    const preparation = prepareMidnightCancelOffers(codeless, params);

    await expect(preparation).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(preparation).rejects.toMatchObject({
      address: midnight,
      role: "midnight",
    });
  });
});

describe("parseTransactionPlan midnightCancelOffers", () => {
  const saved = async () => serializeTransactionPlan(await prepare());

  test("error: InvalidTransactionPlanError when the step account differs from the plan", async () => {
    const other = "0x2222222222222222222222222222222222222222";
    const json = (await saved()).replace(
      `"inputs":{"chainId":${chainId},"account":"${account}"`,
      `"inputs":{"chainId":${chainId},"account":"${other}"`,
    );
    expect(json).toContain(other);

    expect(() => parseTransactionPlan(json)).toThrow(
      expect.objectContaining({
        constructor: InvalidTransactionPlanError,
        path: "$.steps[0].action.inputs.account",
      }),
    );
  });

  test.each([
    { name: "missing groups", to: `"other":[]`, field: "groups" },
    { name: "non-array groups", to: `"groups":"${groupA}"`, field: "groups" },
    { name: "non-hex group", to: `"groups":["aa"]`, field: "groups[0]" },
    { name: "short group", to: `"groups":["0xaa"]`, field: "groups[0]" },
  ])("error: InvalidTransactionPlanError on $name", async ({ to, field }) => {
    const json = (await saved()).replace(`"groups":["${groupA}"]`, to);

    expect(() => parseTransactionPlan(json)).toThrow(
      expect.objectContaining({
        constructor: InvalidTransactionPlanError,
        path: `$.steps[0].action.inputs.${field}`,
      }),
    );
  });

  test("error: InvalidTransactionPlanError on stored signature references", async () => {
    const plan = await prepare();
    const [step] = plan.steps;
    assert(step);
    const action = { ...step.action, signatureRequestIds: {} };
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [{ ...step, action }],
    });

    expect(() => parseTransactionPlan(stored)).toThrow(
      expect.objectContaining({
        constructor: InvalidTransactionPlanError,
        path: "$.steps[0].action.signatureRequestIds",
      }),
    );
  });

  test("behavior: duplicate groups parse but fail at build like the action encoder", async () => {
    const json = (await saved()).replace(
      `"groups":["${groupA}"]`,
      `"groups":["${groupA}","${groupA}"]`,
    );
    const restored = parseTransactionPlan(json);

    expect(() => buildTransactions(restored)).toThrow(
      DuplicateMidnightGroupCancellationError,
    );
  });
});

describe("validateMidnightCancelOffersPlanAction", () => {
  test("default: accepts a stored bytes32 group list", () => {
    expect(() =>
      validateMidnightCancelOffersPlanAction(
        { inputs: { groups: [groupA, groupB] } },
        "$.steps[0].action",
      ),
    ).not.toThrow();
  });

  test("error: rejects signature references on a stored cancellation", () => {
    const validate = () =>
      validateMidnightCancelOffersPlanAction(
        { inputs: { groups: [groupA] }, signatureRequestIds: {} },
        "$.steps[0].action",
      );
    expect(validate).toThrow(InvalidTransactionPlanError);
    expect(validate).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.signatureRequestIds",
      }),
    );
  });

  test("error: InvalidTransactionPlanError when inputs are missing", () => {
    expect(() =>
      validateMidnightCancelOffersPlanAction({}, "$.steps[0].action"),
    ).toThrow(InvalidTransactionPlanError);
  });
});
