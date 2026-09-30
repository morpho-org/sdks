import { type Address, getAddress, maxUint256, zeroAddress } from "viem";
import { expectTypeOf } from "vitest";
import type { SimulationAuthorization } from "../../authorizations.js";
import { SimulationValidationError } from "../../errors.js";
import type { SimulateParams } from "../../params.js";
import type { SimulationTransaction } from "../../types.js";
import {
  type ParsedRequest,
  type ParsedTransaction,
  parseRequest,
} from "./parse-request.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const _MARKET_ID =
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

const parse = (input: unknown) => parseRequest(input as SimulateParams);

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
      limits: {
        operations: [
          {
            type: "vaultV1Deposit",
            vault: SPENDER.toLowerCase(),
            expectedAssets: 1n,
          },
        ],
      },
    });
    expect(request.mode).toBe("preview");
    expect(request.transactions[0]?.from).toBe(OWNER);
    expect(request.transactions[0]?.to).toBe(TARGET);
    expect(request.transactions[0]?.value).toBe(5n);
    expect(request.authorizations).toHaveLength(1);
    expect((request.authorizations[0] as { owner: Address }).owner).toBe(OWNER);
    expect(request.limits?.operations?.[0]).toMatchObject({ vault: SPENDER });
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

  test.each([
    ["expectedAssets only", { expectedAssets: 1n }],
    ["expectedShares only", { expectedShares: 1n }],
    ["neither", {}],
  ])(
    "behavior: accepts a vaultV1MigrateToV2 limit with %s",
    (_name, fields) => {
      const request = parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "vaultV1MigrateToV2",
              sourceVault: SPENDER,
              targetVault: TARGET,
              ...fields,
            },
          ],
        },
      });
      expect(request.limits?.operations).toHaveLength(1);
    },
  );

  test("error: SimulationValidationError for a vaultV1MigrateToV2 limit with both expectedAssets and expectedShares", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "vaultV1MigrateToV2",
                sourceVault: SPENDER,
                targetVault: TARGET,
                expectedAssets: 1n,
                expectedShares: 1n,
              },
            ],
          },
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect((error as SimulationValidationError).fieldErrors).toContainEqual(
      "limits.operations[0]: set expectedAssets or expectedShares, not both",
    );
  });

  test("error: SimulationValidationError for blockNumber 'pending'", () => {
    const error = (() => {
      try {
        parse({ chainId: 1, transactions: [tx()], blockNumber: "pending" });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(
      (error as SimulationValidationError).fieldErrors?.some((field) =>
        field.includes("blockNumber"),
      ),
    ).toBe(true);
  });

  test("behavior: accepts blockNumber 'finalized'", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      blockNumber: "finalized",
    });
    expect(request.blockNumber).toBe("finalized");
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
    expect(() => parseRequest(null as unknown as SimulateParams)).toThrow(
      SimulationValidationError,
    );
    expect(() => parseRequest("x" as unknown as SimulateParams)).toThrow(
      SimulationValidationError,
    );
    expect(() => parseRequest(42 as unknown as SimulateParams)).toThrow(
      SimulationValidationError,
    );
  });

  test("type-level: SimulateParams accepts readonly arrays", () => {
    expectTypeOf<{
      readonly chainId: number;
      readonly transactions: readonly Readonly<SimulationTransaction>[];
    }>().toExtend<SimulateParams>();
  });

  test("type-level: ParsedRequest fields are readonly", () => {
    expectTypeOf<ParsedRequest["transactions"]>().toEqualTypeOf<
      readonly ParsedTransaction[]
    >();
    expectTypeOf<ParsedRequest["chainId"]>().toEqualTypeOf<number>();
  });

  const permitAuth: SimulationAuthorization = {
    type: "erc2612Permit",
    typedData: {
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 1,
        verifyingContract: getAddress(
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        ),
      },
      primaryType: "Permit",
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        owner: OWNER,
        spender: SPENDER,
        value: 7n,
        nonce: 0n,
        deadline: 9_999_999n,
      },
    },
  };

  const blueSigAuth: SimulationAuthorization = {
    type: "blueAuthorizationSignature",
    typedData: {
      domain: {
        name: "Morpho",
        version: "1",
        chainId: 1,
        verifyingContract: getAddress(
          "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
        ),
      },
      primaryType: "Authorization",
      types: {
        Authorization: [
          { name: "authorizer", type: "address" },
          { name: "authorized", type: "address" },
          { name: "isAuthorized", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: true,
        nonce: 0n,
        deadline: 9_999_999n,
      },
    },
  };

  test("behavior: input objects are not returned or frozen", () => {
    const input = {
      chainId: 1,
      mode: "preview",
      transactions: [tx()],
      authorizations: [erc20Approval, permit2Auth],
      limits: {
        maxSlippageWad: 1n,
        operations: [{ type: "blueAuthorization", authorized: SPENDER }],
      },
    };
    const request = parse(input);
    expect(Object.isFrozen(input.authorizations[0])).toBe(false);
    expect(Object.isFrozen(input.limits)).toBe(false);
    expect(request.authorizations[0]).not.toBe(erc20Approval);
    expect(request.authorizations[0]).toEqual(erc20Approval);
    expect(request.authorizations[1]).not.toBe(permit2Auth);
    expect(request.limits?.operations?.[0]).toMatchObject({
      type: "blueAuthorization",
      authorized: SPENDER,
    });
  });

  test.each([
    [
      "unknown limit field",
      { transactions: [tx()], limits: { maxSlipageWad: 1n } },
    ],
    [
      "unknown operation field",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueBorrow",
              marketId: _MARKET_ID,
              maxLtvAftrWad: 1n,
            },
          ],
        },
      },
    ],
    ["unknown transaction field", { transactions: [tx({ gasPrice: 1n })] }],
    [
      "unknown authorization field",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [{ ...erc20Approval, nonce: 0n }],
      },
    ],
  ])("error: SimulationValidationError for %s", (_name, input) => {
    expect(() => parse({ chainId: 1, ...(input as object) })).toThrow(
      SimulationValidationError,
    );
  });

  test.each([
    [
      "null operation",
      { transactions: [tx()], limits: { operations: [null] } },
    ],
    [
      "operation transactionIndex without transactions",
      {
        transactions: null,
        limits: {
          operations: [
            {
              type: "blueAuthorization",
              authorized: SPENDER,
              transactionIndex: 0,
            },
          ],
        },
      },
    ],
    [
      "prototype-polluting type",
      {
        transactions: [tx()],
        limits: { operations: [{ type: "constructor" }] },
      },
    ],
    [
      "erc2612Permit wrong primaryType",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            type: "erc2612Permit",
            typedData: { ...permitAuth.typedData, primaryType: "PermitX" },
          },
        ],
      },
    ],
    [
      "erc2612Permit reordered fields",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            type: "erc2612Permit",
            typedData: {
              ...permitAuth.typedData,
              types: {
                Permit: [...permitAuth.typedData.types.Permit].reverse(),
              },
            },
          },
        ],
      },
    ],
    [
      "erc2612Permit out-of-range nonce",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            type: "erc2612Permit",
            typedData: {
              ...permitAuth.typedData,
              message: { ...permitAuth.typedData.message, nonce: -1n },
            },
          },
        ],
      },
    ],
    [
      "erc2612Permit out-of-range deadline",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            type: "erc2612Permit",
            typedData: {
              ...permitAuth.typedData,
              message: {
                ...permitAuth.typedData.message,
                deadline: maxUint256 + 1n,
              },
            },
          },
        ],
      },
    ],
    [
      "blueAuthorizationSignature non-bool isAuthorized",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            type: "blueAuthorizationSignature",
            typedData: {
              ...blueSigAuth.typedData,
              message: {
                ...blueSigAuth.typedData.message,
                isAuthorized: "yes",
              },
            },
          },
        ],
      },
    ],
    [
      "blueAuthorizationSignature reordered fields",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            type: "blueAuthorizationSignature",
            typedData: {
              ...blueSigAuth.typedData,
              types: {
                Authorization: [
                  ...blueSigAuth.typedData.types.Authorization,
                ].reverse(),
              },
            },
          },
        ],
      },
    ],
    [
      "permit2 TokenPermissions order",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permit2Auth,
            typedData: {
              ...permit2Auth.typedData,
              types: {
                ...permit2Auth.typedData.types,
                TokenPermissions: [
                  ...permit2Auth.typedData.types.TokenPermissions,
                ].reverse(),
              },
            },
          },
        ],
      },
    ],
    [
      "domain bad verifyingContract",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permit2Auth,
            typedData: {
              ...permit2Auth.typedData,
              domain: {
                ...permit2Auth.typedData.domain,
                verifyingContract: "0xnot",
              },
            },
          },
        ],
      },
    ],
    [
      "domain bad salt",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permit2Auth,
            typedData: {
              ...permit2Auth.typedData,
              domain: { ...permit2Auth.typedData.domain, salt: "0x1234" },
            },
          },
        ],
      },
    ],
    [
      "domain invalid chainId",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permit2Auth,
            typedData: {
              ...permit2Auth.typedData,
              domain: { ...permit2Auth.typedData.domain, chainId: "one" },
            },
          },
        ],
      },
    ],
    [
      "unknown authorization type",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [{ type: "mystery" }],
      },
    ],
    [
      "operation bad marketId",
      {
        transactions: [tx()],
        limits: { operations: [{ type: "blueBorrow", marketId: "0x12" }] },
      },
    ],
    [
      "operation bad address",
      {
        transactions: [tx()],
        limits: {
          operations: [{ type: "blueAuthorization", authorized: "0xnot" }],
        },
      },
    ],
    [
      "operation bad uint",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueAuthorization",
              authorized: SPENDER,
              expectedIsAuthorized: true,
              maxExpected: -2n,
            },
          ],
        },
      },
    ],
    [
      "operation bad bool",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueAuthorization",
              authorized: SPENDER,
              expectedIsAuthorized: "yes",
            },
          ],
        },
      },
    ],
    [
      "operation bad marketId array",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "vaultV1InKindRedeem",
              vault: SPENDER,
              expectedMarketIds: ["0x12"],
            },
          ],
        },
      },
    ],
    [
      "operation bad deallocations",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "vaultV2ForceRedeem",
              vault: SPENDER,
              expectedDeallocations: [
                { adapter: "0xnot", marketId: _MARKET_ID, assets: 1n },
              ],
            },
          ],
        },
      },
    ],
    [
      "operation bad minSupplyByMarket",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "vaultV1InKindRedeem",
              vault: SPENDER,
              minSupplyAssetsByMarket: [
                { marketId: _MARKET_ID, minSupplyAssets: -1n },
              ],
            },
          ],
        },
      },
    ],
    [
      "operation missing required address",
      {
        transactions: [tx()],
        limits: {
          operations: [{ type: "vaultV1Deposit", expectedAssets: 1n }],
        },
      },
    ],
    ["invalid mode", { mode: "draft", transactions: [tx()] }],
    ["negative blockNumber", { blockNumber: -1n, transactions: [tx()] }],
    ["non-hex data", { transactions: [tx({ data: "0xzz" })] }],
    ["non-object transaction", { transactions: [42] }],
    [
      "non-array authorizations",
      { mode: "preview", transactions: [tx()], authorizations: {} },
    ],
    ["non-object limits", { transactions: [tx()], limits: 7 }],
    [
      "non-array operations",
      { transactions: [tx()], limits: { operations: {} } },
    ],
    [
      "non-bigint maxSlippageWad",
      { transactions: [tx()], limits: { maxSlippageWad: "1" } },
    ],
  ])("error: SimulationValidationError for %s", (_name, input) => {
    expect(() => parse({ chainId: 1, ...(input as object) })).toThrow(
      SimulationValidationError,
    );
  });

  test("error: SimulationValidationError for a prototype-polluting authorization type", () => {
    expect(() =>
      parse({
        chainId: 1,
        mode: "preview",
        transactions: [tx()],
        authorizations: [{ type: "constructor" }],
      }),
    ).toThrow(SimulationValidationError);
  });

  test("behavior: accepts a blueWithdraw limit with utilization and penalty bounds", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type: "blueWithdraw",
            marketId: _MARKET_ID,
            maxUtilizationAfterWad: 1n,
            maxReallocationPenaltyAssets: 2n,
          },
        ],
      },
    });
    expect(request.limits?.operations).toHaveLength(1);
  });

  test("error: SimulationValidationError reports maxSlippageWad exactly once", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: { maxSlippageWad: -1n },
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    const hits = (error as SimulationValidationError).fieldErrors?.filter(
      (line) => line.includes("maxSlippageWad"),
    );
    expect(hits).toHaveLength(1);
  });

  test("error: SimulationValidationError for a non-bigint symbol limit", () => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: { maxSlippageWad: Symbol("x") },
      }),
    ).toThrow(SimulationValidationError);
  });

  test("behavior: preview parses permit and blue signature authorizations", () => {
    const request = parse({
      chainId: 1,
      mode: "preview",
      transactions: [tx()],
      authorizations: [permitAuth, blueSigAuth],
    });
    expect(request.authorizations).toHaveLength(2);
  });

  test.each([
    [
      "erc2612Permit",
      {
        type: "erc2612Permit",
        typedData: {
          ...permitAuth.typedData,
          message: { ...permitAuth.typedData.message, owner: SPENDER },
        },
      },
    ],
    ["permit2SignatureTransfer", { ...permit2Auth, owner: SPENDER }],
    [
      "blueAuthorization",
      {
        type: "blueAuthorization",
        authorizer: SPENDER,
        authorized: TARGET,
        isAuthorized: true,
      },
    ],
    [
      "blueAuthorizationSignature",
      {
        type: "blueAuthorizationSignature",
        typedData: {
          ...blueSigAuth.typedData,
          message: {
            ...blueSigAuth.typedData.message,
            authorizer: SPENDER,
          },
        },
      },
    ],
  ])(
    "error: SimulationValidationError for %s owner mismatch",
    (_name, authorization) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            mode: "preview",
            transactions: [tx()],
            authorizations: [authorization],
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((line) =>
          line.includes("authorizations[0]"),
        ),
      ).toBe(true);
    },
  );

  test("behavior: zeroAddress from is schema-valid per the domain type", () => {
    // Address format passes; semantic zero-sender rejection is not a parser rule.
    const request = parse({
      chainId: 1,
      transactions: [tx({ from: zeroAddress })],
    });
    expect(request.transactions[0]?.from).toBe(zeroAddress);
  });
});
