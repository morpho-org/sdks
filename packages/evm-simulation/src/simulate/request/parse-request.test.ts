import { type Address, getAddress, maxUint256, zeroAddress } from "viem";
import { expectTypeOf } from "vitest";
import type { SimulationAuthorization } from "../../domain/authorizations.js";
import type {
  FinalSimulateParams,
  SimulateParams,
} from "../../domain/request.js";
import type { ParsedRequest } from "../../domain/stages.js";
import { SimulationValidationError } from "../../errors.js";
import type { SimulationTransaction } from "../../types.js";
import { parseRequest } from "./parse-request.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const MARKET_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000aa";

const tx = (overrides: object = {}) => ({
  from: OWNER,
  to: TARGET,
  data: "0x12345678",
  ...overrides,
});

const erc20Approval: SimulationAuthorization = {
  type: "erc20Approval",
  token: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  owner: OWNER,
  spender: SPENDER,
  amount: 100n,
};

const permit2Auth: SimulationAuthorization = {
  type: "permit2SignatureTransfer",
  owner: OWNER,
  typedData: {
    domain: {
      name: "Permit2",
      chainId: 1,
      verifyingContract: getAddress(
        "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      ),
    },
    primaryType: "PermitTransferFrom",
    types: {
      PermitTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
      TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
    message: {
      permitted: {
        token: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
        amount: 5n,
      },
      spender: SPENDER,
      nonce: 0n,
      deadline: 999_999n,
    },
  },
};

const parse = (input: unknown) => parseRequest(input);

describe("parseRequest", () => {
  test("default", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
    });
    expect(request.mode).toBe("final");
    expect(request.authorizations).toEqual([]);
    expect(request.chainId).toBe(1);
    expect(request.transactions).toEqual([
      { from: OWNER, to: TARGET, data: "0x12345678", value: 0n },
    ]);
  });

  test("behavior: normalizes addresses, value, mode and authorizations", () => {
    const request = parse({
      chainId: 1,
      mode: "preview",
      transactions: [
        {
          from: OWNER.toLowerCase(),
          to: TARGET.toLowerCase(),
          data: "0x12",
          value: 5n,
        },
      ],
      authorizations: [{ ...erc20Approval, owner: OWNER.toLowerCase() }],
    });
    expect(request.mode).toBe("preview");
    expect(request.transactions[0]?.from).toBe(OWNER);
    expect(request.transactions[0]?.to).toBe(TARGET);
    expect(request.transactions[0]?.value).toBe(5n);
    expect(request.authorizations).toHaveLength(1);
  });

  test("behavior: preview without authorizations parses", () => {
    const request = parse({
      chainId: 1,
      mode: "preview",
      transactions: [tx()],
    });
    expect(request.authorizations).toEqual([]);
  });

  test("behavior: accepts typed authorizations in preview", () => {
    const request = parse({
      chainId: 1,
      mode: "preview",
      transactions: [tx()],
      authorizations: [erc20Approval, permit2Auth],
    });
    expect(request.authorizations).toHaveLength(2);
  });

  test("behavior: result is deep-frozen", () => {
    const request = parse({ chainId: 1, transactions: [tx()] });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.transactions)).toBe(true);
    expect(Object.isFrozen(request.transactions[0])).toBe(true);
  });

  test.each([
    [
      "legacy signature variant",
      { type: "signature", token: TARGET, spender: SPENDER },
    ],
    ["legacy approval variant", { type: "approval", transaction: tx() }],
  ])("error: SimulationValidationError for %s", (_name, authorization) => {
    expect(() =>
      parse({
        chainId: 1,
        mode: "preview",
        transactions: [tx()],
        authorizations: [authorization],
      }),
    ).toThrow(SimulationValidationError);
  });

  test("error: SimulationValidationError for PermitSingle-shaped typedData", () => {
    expect(() =>
      parse({
        chainId: 1,
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permit2Auth,
            typedData: {
              ...permit2Auth.typedData,
              primaryType: "PermitSingle",
            },
          },
        ],
      }),
    ).toThrow(SimulationValidationError);
  });

  test("error: SimulationValidationError for a foreign operation-limit field", () => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueBorrow",
              marketId: MARKET_ID,
              maxSharesBurned: 1n,
            },
          ],
        },
      }),
    ).toThrow(SimulationValidationError);
  });

  test.each([
    ["negative value", { transactions: [tx({ value: -1n })] }],
    ["oversized value", { transactions: [tx({ value: maxUint256 + 1n })] }],
    ["mixed senders", { transactions: [tx(), tx({ from: SPENDER })] }],
    ["empty transactions", { transactions: [] }],
    ["bad chainId", { chainId: 0, transactions: [tx()] }],
    ["malformed from", { transactions: [tx({ from: "0xnotanaddress" })] }],
    [
      "final mode with authorizations",
      {
        mode: "final",
        transactions: [tx()],
        authorizations: [erc20Approval],
      },
    ],
    [
      "default mode with authorizations",
      { transactions: [tx()], authorizations: [] },
    ],
    [
      "authorization owner mismatch",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [{ ...erc20Approval, owner: SPENDER }],
      },
    ],
    [
      "typedData chainId mismatch",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permit2Auth,
            typedData: {
              ...permit2Auth.typedData,
              domain: { ...permit2Auth.typedData.domain, chainId: 42 },
            },
          },
        ],
      },
    ],
    [
      "operation transactionIndex out of range",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueAuthorization",
              authorized: SPENDER,
              transactionIndex: 1,
            },
          ],
        },
      },
    ],
    [
      "weakening limits",
      {
        transactions: [tx()],
        limits: { maxSlippageWad: 10n ** 18n },
      },
    ],
  ])("error: SimulationValidationError for %s", (_name, input) => {
    expect(() => parse({ chainId: 1, ...(input as object) })).toThrow(
      SimulationValidationError,
    );
  });

  test("behavior: accepts limits within bounds", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        maxSlippageWad: 1n,
        operations: [
          {
            type: "blueAuthorization",
            authorized: SPENDER,
            transactionIndex: 0,
          },
        ],
      },
    });
    expect(request.limits?.operations).toHaveLength(1);
  });

  test("error: SimulationValidationError for non-object input", () => {
    expect(() => parseRequest(null)).toThrow(SimulationValidationError);
    expect(() => parseRequest("x")).toThrow(SimulationValidationError);
    expect(() => parseRequest(42)).toThrow(SimulationValidationError);
  });

  test("type-level: FinalSimulateParams cannot carry authorizations", () => {
    expectTypeOf<{
      chainId: number;
      transactions: readonly SimulationTransaction[];
      authorizations: readonly SimulationAuthorization[];
    }>().not.toExtend<FinalSimulateParams>();
  });

  test("type-level: SimulateParams accepts readonly arrays", () => {
    expectTypeOf<{
      readonly chainId: number;
      readonly transactions: readonly Readonly<SimulationTransaction>[];
    }>().toExtend<SimulateParams>();
  });

  test("type-level: ParsedRequest fields are readonly", () => {
    expectTypeOf<ParsedRequest["transactions"]>().toEqualTypeOf<
      readonly Readonly<SimulationTransaction>[]
    >();
    expectTypeOf<ParsedRequest["chainId"]>().toEqualTypeOf<number>();
  });

  test("behavior: zeroAddress from is schema-valid per the domain type", () => {
    // Address format passes; semantic zero-sender rejection is not a parser rule.
    const request = parse({
      chainId: 1,
      transactions: [tx({ from: zeroAddress })],
    });
    expect(request.transactions[0]?.from).toBe(zeroAddress);
  });
});
