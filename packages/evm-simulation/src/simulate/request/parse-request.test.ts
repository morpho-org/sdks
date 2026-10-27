import type { MarketId } from "@morpho-org/blue-sdk";
import {
  Market as MidnightMarket,
  MarketParams as MidnightMarketParams,
} from "@morpho-org/morpho-sdk/midnight/entities";
import { MarketUtils as MidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { type Address, getAddress, maxUint256, zeroAddress } from "viem";
import { expectTypeOf } from "vitest";
import type { SimulationAuthorization } from "../../authorizations.js";
import { SimulationValidationError } from "../../errors.js";
import type { MidnightMarketStruct } from "../../limits.js";
import type { SimulateParams } from "../../params.js";
import type { SimulationVerification } from "../../result.js";
import type { SimulationTransaction } from "../../types.js";
import {
  conditionalQuoteViolations,
  missingInKindProceeds,
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
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const _MARKET_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000aa";
const MIDNIGHT_MARKET_PARAMS = new MidnightMarketParams({
  chainId: 1,
  midnight: TARGET,
  loanToken: TOKEN,
  collateralParams: [
    {
      token: SPENDER,
      lltv: 0n,
      liquidationCursor: 0n,
      oracle: TARGET,
    },
  ],
  maturity: 1n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});
const MIDNIGHT_MARKET = MidnightMarketUtils.toStruct(MIDNIGHT_MARKET_PARAMS);

test.each(["vaultV1Deposit", "vaultV2Deposit"] as const)(
  "%s undefined quote fields behave like omitted fields",
  (type) => {
    const parse = (quote: { sharesMinted?: bigint } | undefined) =>
      parseRequest({
        chainId: 1,
        transactions: [{ from: OWNER, to: TARGET, data: "0x12345678" }],
        limits: {
          operations: [
            { type, vault: TARGET, inputs: { assets: 100n }, quote },
          ],
        },
      });
    expect(parse({ sharesMinted: undefined })).toEqual(parse({}));
    expect(parse({ sharesMinted: undefined })).toEqual(parse(undefined));
  },
);
const MIDNIGHT_MARKET_ID = MidnightMarketUtils.toId(MIDNIGHT_MARKET);
const MIDNIGHT_HYDRATED_MARKET = new MidnightMarket({
  params: MIDNIGHT_MARKET_PARAMS,
  totalUnits: 0n,
  lossFactor: 0n,
  withdrawable: 0n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 4,
});
const MIDNIGHT_MARKET_WITHOUT_COLLATERAL_PARAMS: object = {
  ...MIDNIGHT_MARKET,
};
Reflect.deleteProperty(
  MIDNIGHT_MARKET_WITHOUT_COLLATERAL_PARAMS,
  "collateralParams",
);

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

const parse = (input: unknown) =>
  parseRequest({ limits: "none", ...(input as object) } as SimulateParams);

/** Operations of a parsed request whose limits are an object. */
const limitsOperations = (request: ParsedRequest) =>
  request.limits === "none" ? undefined : request.limits.operations;

describe("parseRequest", () => {
  test.each([
    {
      type: "blueWithdraw",
      marketId: _MARKET_ID,
      inputs: { assets: 1n, shares: undefined },
    },
    {
      type: "blueRepay",
      marketId: _MARKET_ID,
      inputs: { assets: undefined, shares: 1n },
    },
    {
      type: "blueSupplyCollateralBorrow",
      marketId: _MARKET_ID,
      inputs: { collateralAssets: 1n, borrowAssets: undefined },
    },
    {
      type: "blueRepayWithdrawCollateral",
      marketId: _MARKET_ID,
      inputs: { collateralAssets: 1n, repay: undefined },
    },
  ])("ignores undefined optional input amounts %#", (operation) => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: { operations: [operation] },
      }),
    ).not.toThrow();
  });
  test.each([
    {
      type: "blueRepay",
      marketId: _MARKET_ID,
      inputs: { assets: undefined, shares: undefined },
    },
    {
      type: "blueSupplyCollateralBorrow",
      marketId: _MARKET_ID,
      inputs: { collateralAssets: undefined, borrowAssets: undefined },
    },
  ])("undefined-only inputs still fail closed %#", (operation) => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: { operations: [operation] },
      }),
    ).toThrow(SimulationValidationError);
  });
  test.each([
    { type: "blueWithdraw", marketId: _MARKET_ID },
    { type: "vaultV1MigrateToV2", sourceVault: TARGET, targetVault: TOKEN },
  ])(
    "non-repayment input instructions exclude full repayment %#",
    (operation) => {
      const call = () =>
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: { operations: [{ ...operation, inputs: 5n }] },
        });
      expect(call).toThrow(SimulationValidationError);
      try {
        call();
      } catch (error) {
        expect(JSON.stringify(error)).toContain(
          "supply exactly one of assets or shares",
        );
        expect(JSON.stringify(error)).not.toContain('or \\"full\\"');
      }
    },
  );
  test.each([
    { quote: {}, slippageTolerance: 0n },
    { slippageTolerance: 0n },
    { quote: { sharesMinted: -1n }, slippageTolerance: 0n },
    { quote: { sharesMinted: 1n, unexpected: 1n }, slippageTolerance: 0n },
  ])("error: SimulationValidationError for malformed quote %#", (fields) => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [{ type: "vaultV2Deposit", vault: TARGET, ...fields }],
        },
      }),
    ).toThrow(SimulationValidationError);
  });
  test.each([-1n, 10n ** 18n, 10n ** 18n + 1n, 0.01])(
    "error: SimulationValidationError for malformed slippageTolerance %s",
    (slippageTolerance) => {
      let error: unknown;
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "vaultV2Deposit",
                vault: TARGET,
                quote: { sharesMinted: 1n, assetsPaid: 1n },
                slippageTolerance,
              },
            ],
          },
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.startsWith("limits.operations[0].slippageTolerance"),
        ),
      ).toBe(true);
    },
  );
  test.each([0n, 10_000000000000000n, 10n ** 18n - 1n])(
    "behavior: accepts tolerance %s below 1e18",
    (slippageTolerance) => {
      const operation = {
        type: "vaultV2Deposit",
        vault: TARGET,
        quote: { sharesMinted: 1n, assetsPaid: 1n },
        slippageTolerance,
      };
      expect(
        limitsOperations(
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: { operations: [operation] },
          }),
        ),
      ).toEqual([operation]);
    },
  );
  test("behavior: an omitted tolerance defaults to DEFAULT_SLIPPAGE_TOLERANCE", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault: TARGET,
            quote: { sharesMinted: 1n, assetsPaid: 1n },
          },
        ],
      },
    });
    expect(limitsOperations(request)?.[0]?.slippageTolerance).toBe(
      3_00000000000000n,
    );
  });
  test.each([
    {
      type: "vaultV2Deposit",
      subject: { vault: TARGET },
      field: "assetsReceived",
    },
    { type: "vaultV2Deposit", subject: { vault: TARGET }, field: "assetsPaid" },
    {
      type: "vaultV2Deposit",
      subject: { vault: TARGET },
      field: "sharesMinted",
    },
    {
      type: "vaultV2Deposit",
      subject: { vault: TARGET },
      field: "sharesBurned",
    },
    {
      type: "blueSupplyCollateral",
      subject: { marketId: _MARKET_ID },
      field: "collateralSupplied",
    },
    {
      type: "blueWithdrawCollateral",
      subject: { marketId: _MARKET_ID },
      field: "collateralWithdrawn",
    },
  ] as const)(
    "error: SimulationValidationError for a zero $field quote",
    ({ type, subject, field }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  ...subject,
                  quote: { [field]: 0n },
                  slippageTolerance: 0n,
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
        `limits.operations[0].quote.${field}: must be positive (got "0")`,
      );
    },
  );
  const mintSideOps = [
    ["blueSupply", { marketId: _MARKET_ID }],
    ["blueBorrow", { marketId: _MARKET_ID }],
    ["vaultV1Deposit", { vault: TARGET }],
    ["vaultV2Deposit", { vault: TARGET }],
    ["vaultV1MigrateToV2", { sourceVault: SPENDER, targetVault: TARGET }],
  ] as const;
  const burnSideOps = [
    ["blueWithdraw", { marketId: _MARKET_ID }],
    ["blueRepay", { marketId: _MARKET_ID }],
    [
      "blueRefinance",
      { sourceMarketId: _MARKET_ID, targetMarketId: _MARKET_ID },
    ],
    ["vaultV1Withdraw", { vault: TARGET }],
    ["vaultV2Withdraw", { vault: TARGET }],
    ["vaultV1Redeem", { vault: TARGET }],
    ["vaultV2Redeem", { vault: TARGET }],
    ["vaultV2ForceWithdraw", { vault: TARGET }],
    ["vaultV2ForceRedeem", { vault: TARGET }],
    ["vaultV1InKindRedeem", { vault: TARGET }],
    ["vaultV2InKindRedeem", { vault: TARGET }],
    ["vaultV1MigrateToV2", { sourceVault: SPENDER, targetVault: TARGET }],
  ] as const;
  test.each(
    mintSideOps.map(([type, subject]) => ({
      type,
      subject,
      field: "sharesMinted",
      quote:
        type === "vaultV1MigrateToV2"
          ? { sharesBurned: 1n }
          : { assetsPaid: 1n },
    })),
  )(
    "error: SimulationValidationError for $type missing $field",
    ({ type, subject, field, quote }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [{ type, ...subject, quote, slippageTolerance: 0n }],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toContainEqual(
        `limits.operations[0].quote.${field}: required for "${type}"`,
      );
    },
  );
  test.each(
    burnSideOps.map(([type, subject]) => ({
      type,
      subject,
      field: "sharesBurned",
      quote:
        type === "vaultV1MigrateToV2"
          ? { sharesMinted: 1n }
          : { assetsReceived: 1n },
    })),
  )(
    "error: SimulationValidationError for $type missing $field",
    ({ type, subject, field, quote }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [{ type, ...subject, quote, slippageTolerance: 0n }],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toContainEqual(
        `limits.operations[0].quote.${field}: required for "${type}"`,
      );
    },
  );
  test.each([
    {
      type: "blueSupply",
      subject: { marketId: _MARKET_ID },
      field: "assetsPaid",
      quote: { sharesMinted: 1n },
    },
    {
      type: "blueRepay",
      subject: { marketId: _MARKET_ID },
      field: "assetsPaid",
      quote: { sharesBurned: 1n },
    },
    {
      type: "vaultV1Deposit",
      subject: { vault: TARGET },
      field: "assetsPaid",
      quote: { sharesMinted: 1n },
    },
    {
      type: "vaultV2Deposit",
      subject: { vault: TARGET },
      field: "assetsPaid",
      quote: { sharesMinted: 1n },
    },
    {
      type: "blueRefinance",
      subject: { sourceMarketId: _MARKET_ID, targetMarketId: _MARKET_ID },
      field: "sharesBurned",
      quote: { sharesMinted: 1n },
    },
    {
      type: "blueRefinance",
      subject: { sourceMarketId: _MARKET_ID, targetMarketId: _MARKET_ID },
      field: "sharesMinted",
      quote: { sharesBurned: 1n },
    },
    {
      type: "blueSupplyCollateral",
      subject: { marketId: _MARKET_ID },
      field: "collateralSupplied",
      quote: { assetsPaid: 1n },
    },
    {
      type: "blueSupplyCollateral",
      subject: { marketId: _MARKET_ID },
      field: "assetsPaid",
      quote: { collateralSupplied: 1n },
    },
    {
      type: "blueWithdrawCollateral",
      subject: { marketId: _MARKET_ID },
      field: "collateralWithdrawn",
      quote: { assetsReceived: 1n },
    },
    {
      type: "blueWithdrawCollateral",
      subject: { marketId: _MARKET_ID },
      field: "assetsReceived",
      quote: { collateralWithdrawn: 1n },
    },
    {
      type: "blueWithdraw",
      subject: { marketId: _MARKET_ID },
      field: "assetsReceived",
      quote: { sharesBurned: 1n },
    },
    {
      type: "blueBorrow",
      subject: { marketId: _MARKET_ID },
      field: "assetsReceived",
      quote: { sharesMinted: 1n },
    },
    ...[
      "vaultV1Withdraw",
      "vaultV2Withdraw",
      "vaultV1Redeem",
      "vaultV2Redeem",
      "vaultV2ForceWithdraw",
      "vaultV2ForceRedeem",
    ].map((type) => ({
      type,
      subject: { vault: TARGET },
      field: "assetsReceived",
      quote: { sharesBurned: 1n },
    })),
  ] as const)(
    "error: SimulationValidationError for $type missing $field",
    ({ type, subject, field, quote }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [{ type, ...subject, quote, slippageTolerance: 0n }],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toContainEqual(
        `limits.operations[0].quote.${field}: required for "${type}"`,
      );
    },
  );
  test.each([
    {
      type: "blueSupplyCollateralBorrow",
      fields: 'collateralSupplied", "assetsReceived',
      rejects: { assetsPaid: 1n },
      accepts: [
        { collateralSupplied: 1n, sharesMinted: 1n, assetsPaid: 1n },
        // Borrow-only: `1n` is the inactive pay-in leg's cap.
        { assetsReceived: 1n, sharesMinted: 1n, assetsPaid: 1n },
      ],
      missingCap: { collateralSupplied: 1n },
      capField: "sharesMinted",
    },
    {
      type: "blueRepayWithdrawCollateral",
      fields: 'sharesBurned", "assetsReceived',
      rejects: { assetsPaid: 1n },
      accepts: [
        { sharesBurned: 1n, collateralWithdrawn: 1n, assetsPaid: 1n },
        // Withdraw-only: `1n` is the inactive pay-in leg's cap.
        { assetsReceived: 1n, collateralWithdrawn: 1n, assetsPaid: 1n },
      ],
      missingCap: { sharesBurned: 1n },
      capField: "collateralWithdrawn",
    },
  ] as const)(
    "behavior: $type requires at least one quoted side",
    ({ type, fields, rejects, accepts, missingCap, capField }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  quote: rejects,
                  slippageTolerance: 0n,
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
        `limits.operations[0].quote: supply at least one of "${fields}" for "${type}"`,
      );
      for (const quote of accepts) {
        expect(
          limitsOperations(
            parse({
              chainId: 1,
              transactions: [tx()],
              limits: {
                operations: [
                  {
                    type,
                    marketId: _MARKET_ID,
                    quote,
                    slippageTolerance: 0n,
                  },
                ],
              },
            }),
          ),
        ).toHaveLength(1);
      }
      // A single-leg use still must quote the required cap on the inactive
      // leg (a small positive cap such as `1n`, since 0 is rejected).
      const missingCapError = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  quote: missingCap,
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(missingCapError).toBeInstanceOf(SimulationValidationError);
      expect(
        (missingCapError as SimulationValidationError).fieldErrors,
      ).toContainEqual(
        `limits.operations[0].quote.${capField}: required for "${type}"`,
      );
    },
  );
  test.each([
    {
      type: "blueSupplyCollateralBorrow",
      quote: { collateralSupplied: 1n, sharesMinted: 1n },
    },
    {
      type: "blueRepayWithdrawCollateral",
      quote: { sharesBurned: 1n, collateralWithdrawn: 1n },
    },
  ] as const)(
    "error: $type requires the assetsPaid cap unconditionally",
    ({ type, quote }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  quote,
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (thrown) {
          return thrown;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.startsWith("limits.operations[0].quote.assetsPaid: required"),
        ),
      ).toBe(true);
    },
  );
  test.each([
    {
      type: "blueSupplyCollateralBorrow",
      quote: { assetsPaid: 2n, sharesMinted: 1n },
      field: "collateralSupplied",
      leg: "supply",
      accepts: { collateralSupplied: 1n, sharesMinted: 1n, assetsPaid: 1n },
    },
    {
      type: "blueRepayWithdrawCollateral",
      quote: { assetsPaid: 2n, collateralWithdrawn: 1n },
      field: "sharesBurned",
      leg: "repay",
      accepts: { sharesBurned: 1n, collateralWithdrawn: 1n, assetsPaid: 1n },
    },
  ] as const)(
    "behavior: $type requires the $leg leg's position side when the pay-in leg is active",
    ({ type, quote, field, leg, accepts }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                { type, marketId: _MARKET_ID, quote, slippageTolerance: 0n },
              ],
            },
          });
        } catch (thrown) {
          return thrown;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toContainEqual(
        `limits.operations[0].quote.${field}: required for "${type}" when the ${leg} leg is active ("assetsPaid" above 1n)`,
      );
      // The inactive 1n cap does not activate the position side.
      expect(
        limitsOperations(
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  quote: accepts,
                  slippageTolerance: 0n,
                },
              ],
            },
          }),
        )?.[0]?.quote,
      ).toEqual(accepts);
    },
  );
  test.each([
    {
      type: "blueSupplyCollateralBorrow",
      activeField: "sharesMinted",
      accepts: [
        {
          collateralSupplied: 1n,
          assetsPaid: 1n,
          sharesMinted: 1n,
        },
      ],
      rejects: { collateralSupplied: 1n, assetsPaid: 1n, sharesMinted: 2n },
    },
    {
      type: "blueRepayWithdrawCollateral",
      activeField: "collateralWithdrawn",
      accepts: [
        {
          sharesBurned: 1n,
          assetsPaid: 1n,
          collateralWithdrawn: 1n,
        },
      ],
      rejects: {
        sharesBurned: 1n,
        assetsPaid: 1n,
        collateralWithdrawn: 2n,
      },
    },
  ] as const)(
    "error: $type with an active leg ($activeField above 1n) requires assetsReceived",
    ({ type, accepts, rejects }) => {
      for (const quote of accepts) {
        expect(
          limitsOperations(
            parse({
              chainId: 1,
              transactions: [tx()],
              limits: {
                operations: [
                  {
                    type,
                    marketId: _MARKET_ID,
                    quote,
                    slippageTolerance: 0n,
                  },
                ],
              },
            }),
          ),
        ).toHaveLength(1);
      }
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  quote: rejects,
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.startsWith(
            "limits.operations[0].quote.assetsReceived: required",
          ),
        ),
      ).toBe(true);
    },
  );

  test.each([
    { type: "blueSupply", field: "collateralSupplied" },
    { type: "blueWithdraw", field: "collateralWithdrawn" },
    { type: "vaultV2Deposit", field: "collateralSupplied" },
    { type: "vaultV2Deposit", field: "collateralWithdrawn" },
    {
      type: "blueSupplyCollateral",
      field: "collateralWithdrawn",
      extra: { collateralSupplied: 1n },
    },
    {
      type: "blueWithdrawCollateral",
      field: "collateralSupplied",
      extra: { collateralWithdrawn: 1n },
    },
  ] as const)(
    "error: SimulationValidationError for unmeasurable $field on $type",
    ({ type, field, extra }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  vault: TARGET,
                  quote: { [field]: 1n, ...extra },
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.includes(`quote.${field}: cannot be measured`),
        ),
      ).toBe(true);
    },
  );

  test.each([
    ["missing", undefined],
    ["empty operations", { operations: [] }],
    ["missing operations", {}],
    ["non-object", 7],
  ] as const)(
    "error: SimulationValidationError for %s limits",
    (_name, limits) => {
      const error = (() => {
        try {
          parseRequest({
            chainId: 1,
            transactions: [tx()],
            ...(limits === undefined ? {} : { limits }),
          } as SimulateParams);
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.startsWith("limits"),
        ),
      ).toBe(true);
    },
  );

  test("behavior: 'none' opts out of every limit check", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: "none",
    });
    expect(request.limits).toBe("none");
  });
  test("behavior: separate asset overrides are preserved", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: _MARKET_ID,
            assetPaid: TARGET,
            assetReceived: SPENDER,
            quote: {
              assetsPaid: 1n,
              assetsReceived: 2n,
              collateralSupplied: 1n,
              sharesMinted: 1n,
            },
            slippageTolerance: 0n,
          },
        ],
      },
    });
    expect(limitsOperations(request)?.[0]).toMatchObject({
      assetPaid: TARGET,
      assetReceived: SPENDER,
    });
  });
  test.each([
    "minAssetsReceived",
    "minSharesMinted",
    "maxAssetsPaid",
    "maxSharesBurned",
    "maxPenaltyAssets",
    "minRefundAssets",
  ])("error: SimulationValidationError for removed bound %s", (field) => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              quote: { sharesMinted: 1n },
              slippageTolerance: 0n,
              [field]: 0n,
            },
          ],
        },
      }),
    ).toThrow(SimulationValidationError);
  });
  test.each([
    { type: "blueSupplyCollateral", field: "sharesMinted" },
    { type: "blueSupplyCollateral", field: "sharesBurned" },
    { type: "blueWithdrawCollateral", field: "sharesMinted" },
    { type: "blueWithdrawCollateral", field: "sharesBurned" },
  ])(
    "error: SimulationValidationError for $field on $type",
    ({ type, field }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  quote: { [field]: 1n },
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.includes(`quote.${field}`),
        ),
      ).toBe(true);
    },
  );
  test.each(["blueSupply", "vaultV2Redeem", "vaultV2ForceRedeem"] as const)(
    "error: SimulationValidationError for positions on %s",
    (type) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  vault: TARGET,
                  quote: {
                    positions: [{ marketId: _MARKET_ID, supplyShares: 1n }],
                  },
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.includes("quote.positions"),
        ),
      ).toBe(true);
    },
  );
  test.each([
    ["an empty array", { positions: [] }],
    ["a non-array", { positions: "0x00" }],
    [
      "a duplicate marketId",
      {
        positions: [
          { marketId: _MARKET_ID, supplyShares: 1n },
          { marketId: _MARKET_ID, supplyShares: 2n },
        ],
      },
    ],
    [
      "a negative supplyShares",
      {
        positions: [{ marketId: _MARKET_ID, supplyShares: -1n }],
      },
    ],
    [
      "an unknown entry field",
      {
        positions: [
          { marketId: _MARKET_ID, supplyShares: 1n, borrowShares: 0n },
        ],
      },
    ],
    [
      "a malformed marketId",
      {
        positions: [{ marketId: "0x00", supplyShares: 1n }],
      },
    ],
    [
      "a non-object entry",
      {
        positions: [1n],
      },
    ],
    [
      "a duplicate marketId differing only in hex case",
      {
        positions: [
          { marketId: _MARKET_ID, supplyShares: 1n },
          {
            marketId: _MARKET_ID.toUpperCase().replace("0X", "0x"),
            supplyShares: 2n,
          },
        ],
      },
    ],
  ])(
    "error: SimulationValidationError for positions with %s",
    (_name, positions) => {
      expect(() =>
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "vaultV1InKindRedeem",
                vault: TARGET,
                quote: positions,
                slippageTolerance: 0n,
              },
            ],
          },
        }),
      ).toThrow(SimulationValidationError);
    },
  );
  test.each(["blueSupply", "vaultV2Redeem", "vaultV1InKindRedeem"] as const)(
    "error: SimulationValidationError for penalty/deallocations on %s",
    (type) => {
      for (const quote of [
        { penalty: 1n, sharesBurned: 1n, assetsReceived: 1n },
        {
          deallocations: [{ marketId: _MARKET_ID, assets: 1n }],
          sharesBurned: 1n,
          assetsReceived: 1n,
        },
      ]) {
        const error = (() => {
          try {
            parse({
              chainId: 1,
              transactions: [tx()],
              limits: {
                operations: [
                  {
                    type,
                    marketId: _MARKET_ID,
                    vault: TARGET,
                    quote,
                    slippageTolerance: 0n,
                  },
                ],
              },
            });
          } catch (caught) {
            return caught;
          }
        })();
        expect(error).toBeInstanceOf(SimulationValidationError);
      }
    },
  );
  test.each([
    ["an empty array", { deallocations: [] }],
    ["a non-array", { deallocations: "0x00" }],
    [
      "a duplicate marketId",
      {
        deallocations: [
          { marketId: _MARKET_ID, assets: 1n },
          { marketId: _MARKET_ID, assets: 2n },
        ],
      },
    ],
    [
      "a negative assets",
      {
        deallocations: [{ marketId: _MARKET_ID, assets: -1n }],
      },
    ],
    [
      "an unknown entry field",
      {
        deallocations: [{ marketId: _MARKET_ID, assets: 1n, shares: 0n }],
      },
    ],
    [
      "a non-object entry",
      {
        deallocations: [1n],
      },
    ],
    [
      "a duplicate marketId differing only in hex case",
      {
        deallocations: [
          { marketId: _MARKET_ID, assets: 1n },
          {
            marketId: _MARKET_ID.toUpperCase().replace("0X", "0x"),
            assets: 2n,
          },
        ],
      },
    ],
  ])(
    "error: SimulationValidationError for deallocations with %s",
    (_name, quote) => {
      expect(() =>
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "vaultV2ForceRedeem",
                vault: TARGET,
                quote,
                slippageTolerance: 0n,
              },
            ],
          },
        }),
      ).toThrow(SimulationValidationError);
    },
  );
  test.each(["vaultV2ForceWithdraw", "vaultV2ForceRedeem"] as const)(
    "behavior: penalty and deallocations quotes on %s count as non-empty",
    (type) => {
      for (const quote of [
        { penalty: 1n, sharesBurned: 1n, assetsReceived: 1n },
        {
          deallocations: [{ marketId: _MARKET_ID, assets: 1n }],
          sharesBurned: 1n,
          assetsReceived: 1n,
        },
      ]) {
        const parsed = parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type,
                vault: TARGET,
                quote,
                slippageTolerance: 0n,
              },
            ],
          },
        });
        expect(limitsOperations(parsed)?.[0]?.quote).toEqual(quote);
      }
    },
  );
  test("behavior: a zero penalty quote on vaultV2ForceWithdraw survives parsing", () => {
    const quote = { penalty: 0n, sharesBurned: 1n, assetsReceived: 1n };
    const parsed = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type: "vaultV2ForceWithdraw",
            vault: TARGET,
            quote,
            slippageTolerance: 0n,
          },
        ],
      },
    });
    expect(limitsOperations(parsed)?.[0]?.quote).toEqual(quote);
  });
  test.each(["vaultV1InKindRedeem", "vaultV2InKindRedeem"] as const)(
    "error: SimulationValidationError for %s without positions or assetsReceived",
    (type) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  vault: TARGET,
                  quote: { sharesBurned: 1n },
                  slippageTolerance: 0n,
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
        `limits.operations[0].quote: "positions" or "assetsReceived" required for "${type}"`,
      );
    },
  );
  test.each(["vaultV1InKindRedeem", "vaultV2InKindRedeem"] as const)(
    "behavior: %s parses with assetsReceived and no positions",
    (type) => {
      expect(() =>
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type,
                vault: TARGET,
                quote: { sharesBurned: 1n, assetsReceived: 1n },
                slippageTolerance: 0n,
              },
            ],
          },
        }),
      ).not.toThrow();
    },
  );
  test.each(["vaultV1InKindRedeem", "vaultV2InKindRedeem"] as const)(
    "error: SimulationValidationError for a zero supplyShares on %s",
    (type) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  vault: TARGET,
                  quote: {
                    sharesBurned: 1n,
                    positions: [{ marketId: _MARKET_ID, supplyShares: 0n }],
                  },
                  slippageTolerance: 0n,
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.includes("quote.positions[0].supplyShares: must be positive"),
        ),
      ).toBe(true);
    },
  );
  test.each(["vaultV1InKindRedeem", "vaultV2InKindRedeem"] as const)(
    "behavior: a positions-only quote on %s counts as non-empty",
    (type) => {
      const operation = {
        type,
        vault: TARGET,
        quote: {
          sharesBurned: 1n,
          positions: [
            { marketId: _MARKET_ID, supplyShares: 1n },
            {
              marketId:
                "0x00000000000000000000000000000000000000000000000000000000000000bb",
              supplyShares: 2n,
            },
          ],
        },
        slippageTolerance: 0n,
      };
      expect(
        limitsOperations(
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: { operations: [operation] },
          }),
        ),
      ).toEqual([operation]);
    },
  );

  test.each([
    [
      "a non-object",
      { sharePrice: "0x00", quote: { assetsPaid: 1n, sharesMinted: 1n } },
    ],
    [
      "an unknown key",
      {
        sharePrice: { expected: 1n, tolerance: 0n, minPrice: 1n },
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
    ],
    [
      "a zero expected",
      {
        sharePrice: { expected: 0n, tolerance: 0n },
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
    ],
    [
      "a negative tolerance",
      {
        sharePrice: { expected: 1n, tolerance: -1n },
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
    ],
    [
      "a tolerance above 100%",
      {
        sharePrice: { expected: 1n, tolerance: 10n ** 18n + 1n },
        quote: { assetsPaid: 1n, sharesMinted: 1n },
      },
    ],
  ])(
    "error: SimulationValidationError for sharePrice with %s",
    (_name, fields) => {
      expect(() =>
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "vaultV2Deposit",
                vault: TARGET,
                slippageTolerance: 0n,
                ...fields,
              },
            ],
          },
        }),
      ).toThrow(SimulationValidationError);
    },
  );
  test.each([
    {
      type: "vaultV2Deposit" as const,
      quote: { assetsPaid: 1n },
      missing: "quote.sharesMinted",
    },
    {
      type: "vaultV2Deposit" as const,
      quote: { sharesMinted: 1n },
      missing: "quote.assetsPaid",
    },
    {
      type: "blueWithdraw" as const,
      quote: { sharesBurned: 1n },
      missing: "quote.assetsReceived",
    },
    {
      type: "blueRepay" as const,
      quote: { assetsPaid: 1n },
      missing: "quote.sharesBurned",
    },
  ])(
    "error: SimulationValidationError for sharePrice on $type missing $missing",
    ({ type, quote, missing }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  vault: TARGET,
                  quote,
                  slippageTolerance: 0n,
                  sharePrice: { expected: 1n, tolerance: 0n },
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.includes(missing),
        ),
      ).toBe(true);
    },
  );
  test.each([
    "blueSupplyCollateral",
    "blueWithdrawCollateral",
    "blueRefinance",
    "vaultV1InKindRedeem",
    "vaultV2InKindRedeem",
    "vaultV1MigrateToV2",
  ] as const)(
    "error: SimulationValidationError for sharePrice on %s",
    (type) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: {
              operations: [
                {
                  type,
                  marketId: _MARKET_ID,
                  sourceMarketId: _MARKET_ID,
                  targetMarketId: _MARKET_ID,
                  vault: TARGET,
                  sourceVault: TARGET,
                  targetVault: TARGET,
                  quote: {
                    assetsPaid: 1n,
                    sharesBurned: 1n,
                    sharesMinted: 1n,
                    assetsReceived: 1n,
                  },
                  slippageTolerance: 0n,
                  sharePrice: { expected: 1n, tolerance: 0n },
                },
              ],
            },
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect(
        (error as SimulationValidationError).fieldErrors?.some((message) =>
          message.includes("sharePrice: cannot be measured"),
        ),
      ).toBe(true);
    },
  );
  test("behavior: a valid sharePrice bound is preserved", () => {
    const operation = {
      type: "vaultV2Redeem",
      vault: TARGET,
      quote: { assetsReceived: 1n, sharesBurned: 1n },
      slippageTolerance: 0n,
      sharePrice: { expected: 10n ** 27n, tolerance: 10_000000000000000n },
    };
    expect(
      limitsOperations(
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: { operations: [operation] },
        }),
      ),
    ).toEqual([operation]);
  });

  test.each([
    {
      name: "a non-object",
      fields: { position: 1n, quote: { assetsPaid: 1n } },
    },
    {
      name: "an unknown key",
      fields: {
        position: { maxBorrowShares: 1n, maxSupplyShares: 1n },
        quote: { assetsPaid: 1n },
      },
    },
    {
      name: "an empty object",
      fields: { position: {}, quote: { assetsPaid: 1n } },
    },
    {
      name: "a non-uint256 bound",
      fields: { position: { minCollateral: "1" }, quote: { assetsPaid: 1n } },
    },
    {
      name: "a negative bound",
      fields: { position: { minCollateral: -1n }, quote: { assetsPaid: 1n } },
    },
  ])(
    "error: SimulationValidationError for position with $name",
    ({ fields }) => {
      expect(() =>
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "blueSupply",
                marketId: _MARKET_ID,
                slippageTolerance: 0n,
                ...fields,
              },
            ],
          },
        }),
      ).toThrow(SimulationValidationError);
    },
  );
  test.each([
    "vaultV1Deposit",
    "vaultV2Withdraw",
    "vaultV2ForceRedeem",
    "vaultV1InKindRedeem",
    "vaultV2InKindRedeem",
    "vaultV1MigrateToV2",
  ] as const)("error: SimulationValidationError for position on %s", (type) => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type,
                vault: TARGET,
                sourceVault: TARGET,
                targetVault: TARGET,
                quote: { assetsPaid: 1n },
                slippageTolerance: 0n,
                position: { maxBorrowShares: 1n },
              },
            ],
          },
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(
      (error as SimulationValidationError).fieldErrors?.some((message) =>
        message.includes("position: cannot be measured"),
      ),
    ).toBe(true);
  });
  test("error: malformed Blue market id does not make position unmeasurable", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "blueSupply",
                marketId: "0x12",
                quote: { assetsPaid: 1n },
                slippageTolerance: 0n,
                position: { maxBorrowShares: 1n },
              },
            ],
          },
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    const fieldErrors = (error as SimulationValidationError).fieldErrors ?? [];
    expect(fieldErrors.some((message) => message.includes("marketId"))).toBe(
      true,
    );
    expect(
      fieldErrors.some((message) =>
        message.includes("position: cannot be measured"),
      ),
    ).toBe(false);
  });
  test("error: invalid position bound does not add empty-bounds error", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "blueSupply",
                marketId: _MARKET_ID,
                quote: { assetsPaid: 1n },
                slippageTolerance: 0n,
                position: { minCollateral: "1" },
              },
            ],
          },
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    const fieldErrors = (error as SimulationValidationError).fieldErrors ?? [];
    expect(
      fieldErrors.some((message) => message.includes("position.minCollateral")),
    ).toBe(true);
    expect(
      fieldErrors.some((message) =>
        message.includes("supply at least one bound"),
      ),
    ).toBe(false);
  });
  test.each(["blueSupply", "blueRefinance"] as const)(
    "behavior: valid position bounds are preserved on %s",
    (type) => {
      const shared = {
        quote:
          type === "blueRefinance"
            ? { sharesBurned: 1n, sharesMinted: 1n }
            : { assetsPaid: 1n, sharesMinted: 1n },
        slippageTolerance: 0n,
        position: { maxBorrowShares: 10n, minCollateral: 5n },
      };
      const operation =
        type === "blueRefinance"
          ? {
              type,
              sourceMarketId: _MARKET_ID,
              targetMarketId: _MARKET_ID,
              ...shared,
            }
          : { type, marketId: _MARKET_ID, ...shared };
      expect(
        limitsOperations(
          parse({
            chainId: 1,
            transactions: [tx()],
            limits: { operations: [operation] },
          }),
        ),
      ).toEqual([operation]);
    },
  );

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
            slippageTolerance: 0n,
            quote: {
              assetsPaid: 1n,
              sharesMinted: 1n,
            },
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
    expect(limitsOperations(request)?.[0]).toMatchObject({ vault: SPENDER });
  });

  test("behavior: copies the caller's assertion without checksumming its address", () => {
    const callerAssertion = {
      to: TOKEN.toLowerCase(),
      data: "0x12345678",
      check: () => undefined,
    };
    const request = parse({
      chainId: 1,
      transactions: [tx({ assertBefore: [callerAssertion] })],
    });
    const parsedAssertion = request.transactions[0]?.assertBefore?.[0];
    expect(parsedAssertion).toEqual(callerAssertion);
    expect(parsedAssertion).not.toBe(callerAssertion);
    expect(Object.isFrozen(callerAssertion)).toBe(false);
    expect(parsedAssertion?.to).toBe(callerAssertion.to);
  });

  test("behavior: empty assertion arrays are omitted", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx({ assertBefore: [], assertAfter: [] })],
    });
    expect(request.transactions[0]).not.toHaveProperty("assertBefore");
    expect(request.transactions[0]).not.toHaveProperty("assertAfter");
  });

  test.each([
    {
      assertion: { to: "not-an-address", data: "0x", check: () => undefined },
      field: "to",
    },
    {
      assertion: { to: TARGET, data: "not-hex", check: () => undefined },
      field: "data",
    },
    { assertion: { to: TARGET, data: "0x", check: null }, field: "check" },
    {
      assertion: {
        to: TARGET,
        data: "0x",
        check: () => undefined,
        extra: true,
      },
      field: "extra",
    },
    { assertion: null, field: "" },
  ])(
    "error: rejects invalid assertion field $field",
    ({ assertion, field }) => {
      const error = (() => {
        try {
          parse({
            chainId: 1,
            transactions: [tx({ assertBefore: [assertion] })],
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      const message =
        (error as SimulationValidationError).fieldErrors?.join("\n") ?? "";
      expect(message).toContain(
        field === ""
          ? "transactions[0].assertBefore[0]: must be an object"
          : `transactions[0].assertBefore[0].${field}`,
      );
    },
  );

  test("error: rejects a non-array assertion list", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [
            tx({
              assertBefore: {
                to: TOKEN,
                data: "0x",
                check: () => undefined,
              },
            }),
          ],
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(
      (error as SimulationValidationError).fieldErrors?.join("\n"),
    ).toContain("transactions[0].assertBefore: must be an array");
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
      "operation transactionIndex",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueSupply",
              marketId: _MARKET_ID,
              quote: { assetsPaid: 1n },
              slippageTolerance: 0n,
              transactionIndex: 0,
            },
          ],
        },
      },
    ],
    [
      "removed policy field",
      { transactions: [tx()], limits: { legacyPolicy: 1n } },
    ],
  ])("error: SimulationValidationError for %s", (_name, input) => {
    expect(() => parse({ chainId: 1, ...(input as object) })).toThrow(
      SimulationValidationError,
    );
  });

  test.each([
    [
      "shares and asset bounds",
      {
        quote: { sharesMinted: 1n, sharesBurned: 1n, assetsPaid: 1n },
        slippageTolerance: 0n,
      },
    ],
    [
      "share bounds only",
      { quote: { sharesMinted: 1n, sharesBurned: 1n }, slippageTolerance: 0n },
    ],
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
      expect(limitsOperations(request)).toHaveLength(1);
    },
  );

  test("behavior: accepts assetPaid on a vaultV1MigrateToV2 limit", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type: "vaultV1MigrateToV2",
            sourceVault: SPENDER,
            targetVault: TARGET,
            assetPaid: SPENDER,
            quote: { assetsPaid: 1n, sharesMinted: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
        ],
      },
    });
    expect(limitsOperations(request)?.[0]).toMatchObject({
      assetPaid: SPENDER,
    });
  });

  test("error: rejects asset on a vaultV1MigrateToV2 limit", () => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "vaultV1MigrateToV2",
              sourceVault: SPENDER,
              targetVault: TARGET,
              asset: SPENDER,
              quote: { assetsPaid: 1n, sharesMinted: 1n, sharesBurned: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      }),
    ).toThrow(SimulationValidationError);
  });

  test("error: rejects adapter on a vault limit as an unknown key", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [
              {
                type: "vaultV2Deposit",
                vault: SPENDER,
                adapter: TARGET,
                quote: { sharesMinted: 1n },
                slippageTolerance: 0n,
              },
            ],
          },
        });
      } catch (caughtError) {
        return caughtError;
      }
    })();

    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(error).toMatchObject({
      fieldErrors: expect.arrayContaining([
        "limits.operations[0].adapter: unknown field",
      ]),
    });
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

  test("error: same-sender errors name the raw transaction index", () => {
    const error = (() => {
      try {
        parse({
          chainId: 1,
          transactions: [
            tx({ to: "0xnotanaddress" }),
            tx(),
            tx({ from: SPENDER }),
          ],
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationValidationError);
    const fieldErrors = (error as SimulationValidationError).fieldErrors ?? [];
    expect(
      fieldErrors.some((field) => field.startsWith("transactions[0].to")),
    ).toBe(true);
    // The rejected first transaction must not shift the reported index.
    expect(
      fieldErrors.some((field) => field.startsWith("transactions[2].from")),
    ).toBe(true);
    expect(
      fieldErrors.some((field) => field.startsWith("transactions[1].from")),
    ).toBe(false);
  });

  test("behavior: accepts a supplied block", () => {
    const block = {
      number: 20_000_000n,
      hash: `0x${"ab".repeat(32)}`,
      timestamp: 1_700_000_000n,
    } as const;
    const request = parse({ chainId: 1, transactions: [tx()], block });
    expect(request.block).toEqual(block);
    expect(request.blockNumber).toBeUndefined();
  });

  test("behavior: lowercases a supplied block hash", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      block: { number: 1n, hash: `0x${"AB".repeat(32)}`, timestamp: 1n },
    });
    expect(request.block?.hash).toBe(`0x${"ab".repeat(32)}`);
  });

  test("error: SimulationValidationError for block combined with blockNumber", () => {
    expect(() =>
      parse({
        chainId: 1,
        transactions: [tx()],
        blockNumber: 1n,
        block: {
          number: 1n,
          hash: `0x${"ab".repeat(32)}`,
          timestamp: 1n,
        },
      }),
    ).toThrow(SimulationValidationError);
  });

  test("behavior: accepts blockNumber 'finalized'", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      blockNumber: "finalized",
    });
    expect(request.blockNumber).toBe("finalized");
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
      readonly limits: "none";
    }>().toExtend<SimulateParams>();
  });

  test("behavior: missingInKindProceeds flags only in-kind redeems lacking both proceeds sides", () => {
    expect(missingInKindProceeds("vaultV1InKindRedeem", {})).toBe(true);
    expect(missingInKindProceeds("vaultV2InKindRedeem", {})).toBe(true);
    expect(
      missingInKindProceeds("vaultV2InKindRedeem", { assetsReceived: 1n }),
    ).toBe(false);
    expect(
      missingInKindProceeds("vaultV1InKindRedeem", {
        positions: [{ marketId: _MARKET_ID as MarketId, supplyShares: 1n }],
      }),
    ).toBe(false);
    expect(missingInKindProceeds("blueSupply", {})).toBe(false);
  });

  test("type-level: checked limits always carry the applied tolerance", () => {
    expectTypeOf<
      Exclude<
        SimulationVerification["limits"],
        "none"
      >["operations"][number]["slippageTolerance"]
    >().toEqualTypeOf<bigint>();
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
        operations: [
          {
            type: "blueSupply",
            marketId: _MARKET_ID,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        ],
      },
    };
    const request = parse(input);
    expect(Object.isFrozen(input.authorizations[0])).toBe(false);
    expect(Object.isFrozen(input.limits)).toBe(false);
    expect(Object.isFrozen(input.limits.operations[0]!.quote)).toBe(false);
    expect(Object.isFrozen(limitsOperations(request)?.[0]?.quote)).toBe(true);
    expect(request.authorizations[0]).not.toBe(erc20Approval);
    expect(request.authorizations[0]).toEqual(erc20Approval);
    expect(request.authorizations[1]).not.toBe(permit2Auth);
    expect(limitsOperations(request)?.[0]).toMatchObject({
      type: "blueSupply",
      marketId: _MARKET_ID,
    });
  });

  test.each([
    [
      "unknown limit field",
      { transactions: [tx()], limits: { legacyPolicy: 1n } },
    ],
    [
      "removed asset override",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueSupply",
              marketId: _MARKET_ID,
              asset: TARGET,
              quote: { assetsPaid: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      },
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
    ["unknown input field", { transactions: [tx()], stateOverrides: {} }],
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
      "non-array transactions",
      {
        transactions: null,
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
      "erc2612Permit typedData chainId mismatch",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...permitAuth,
            typedData: {
              ...permitAuth.typedData,
              domain: { ...permitAuth.typedData.domain, chainId: 42 },
            },
          },
        ],
      },
    ],
    [
      "blueAuthorizationSignature typedData chainId mismatch",
      {
        mode: "preview",
        transactions: [tx()],
        authorizations: [
          {
            ...blueSigAuth,
            typedData: {
              ...blueSigAuth.typedData,
              domain: { ...blueSigAuth.typedData.domain, chainId: 42 },
            },
          },
        ],
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
      "operation bad assetPaid address",
      {
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "blueSupply",
              marketId: _MARKET_ID,
              assetPaid: "0xnot",
              quote: { assetsPaid: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      },
    ],
    ["invalid mode", { mode: "draft", transactions: [tx()] }],
    ["negative blockNumber", { blockNumber: -1n, transactions: [tx()] }],
    ["non-object block", { block: 1n, transactions: [tx()] }],
    [
      "short block hash",
      {
        block: { number: 1n, hash: "0xab", timestamp: 1n },
        transactions: [tx()],
      },
    ],
    [
      "unknown block key",
      {
        block: {
          number: 1n,
          hash: `0x${"ab".repeat(32)}`,
          timestamp: 1n,
          extra: 1,
        },
        transactions: [tx()],
      },
    ],
    [
      "negative block number",
      {
        block: { number: -1n, hash: `0x${"ab".repeat(32)}`, timestamp: 1n },
        transactions: [tx()],
      },
    ],
    [
      "missing block timestamp",
      {
        block: { number: 1n, hash: `0x${"ab".repeat(32)}` },
        transactions: [tx()],
      },
    ],
    [
      "non-bigint block timestamp",
      {
        block: { number: 1n, hash: `0x${"ab".repeat(32)}`, timestamp: 1 },
        transactions: [tx()],
      },
    ],
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

  test("behavior: accepts a blueWithdraw limit with share and asset bounds", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type: "blueWithdraw",
            marketId: _MARKET_ID,
            slippageTolerance: 0n,
            quote: {
              sharesBurned: 1n,
              assetsReceived: 2n,
            },
          },
        ],
      },
    });
    expect(limitsOperations(request)).toHaveLength(1);
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

  test("error: SimulationValidationError for a zero-address transaction", () => {
    for (const [field, txOverrides] of [
      ["from", { from: zeroAddress }],
      ["to", { to: zeroAddress }],
    ] as const) {
      const error = (() => {
        try {
          parse({ chainId: 1, transactions: [tx(txOverrides)] });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toContainEqual(
        `transactions[0].${field}: must be a non-zero address`,
      );
    }
  });
});

describe("parseRequest — Midnight market struct", () => {
  const valid = {
    type: "midnightTakeLend",
    marketId: MIDNIGHT_MARKET_ID,
    market: MIDNIGHT_MARKET,
    quote: { assetsPaid: 1n, unitsBought: 1n },
  };

  test.each([
    {
      type: "midnightSupplyCollateral",
      fields: {
        collateralIndex: 0n,
        quote: { assetsPaid: 1n, collateralSupplied: 1n },
      },
    },
    {
      type: "midnightTakeLend",
      fields: { quote: { assetsPaid: 1n, unitsBought: 1n } },
    },
    {
      type: "midnightTakeBorrow",
      fields: { quote: { unitsSold: 1n, assetsReceived: 1n } },
    },
    {
      type: "midnightSupplyCollateralTakeBorrow",
      fields: {
        quote: {
          collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
          unitsSold: 1n,
          assetsReceived: 1n,
        },
      },
    },
  ] as const)("accepts and normalizes market on $type", ({ type, fields }) => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            type,
            marketId: MIDNIGHT_MARKET_ID,
            market: MIDNIGHT_MARKET,
            ...fields,
          },
        ],
      },
    });
    const operation = limitsOperations(request)?.[0];
    expect(operation).toMatchObject({ type });
    expect(operation).toHaveProperty(
      "market",
      MidnightMarketUtils.toStruct(MIDNIGHT_MARKET),
    );
  });

  test("accepts a hydrated market and normalizes it to a struct", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            ...valid,
            market: MIDNIGHT_HYDRATED_MARKET as unknown as MidnightMarketStruct,
          },
        ],
      },
    });
    expect(limitsOperations(request)?.[0]).toHaveProperty(
      "market",
      MidnightMarketUtils.toStruct(MIDNIGHT_MARKET),
    );
  });

  test("accepts a market id that matches case-insensitively", () => {
    const request = parse({
      chainId: 1,
      transactions: [tx()],
      limits: {
        operations: [
          {
            ...valid,
            marketId: `0x${MIDNIGHT_MARKET_ID.slice(2).toUpperCase()}`,
          },
        ],
      },
    });
    expect(limitsOperations(request)?.[0]).toMatchObject({
      marketId: `0x${MIDNIGHT_MARKET_ID.slice(2).toUpperCase()}`,
      market: MidnightMarketUtils.toStruct(MIDNIGHT_MARKET),
    });
  });

  test("rejects a market struct whose id does not match marketId", () => {
    let error: unknown;
    try {
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [{ ...valid, marketId: _MARKET_ID }],
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect((error as SimulationValidationError).fieldErrors).toContain(
      "limits.operations[0].market: must identify the same Midnight market as marketId; pass the struct used to build the operation.",
    );
  });

  test.each([
    ["null", null],
    ["empty collateralParams", { ...MIDNIGHT_MARKET, collateralParams: [] }],
    ["missing collateralParams", MIDNIGHT_MARKET_WITHOUT_COLLATERAL_PARAMS],
    ["invalid maturity", { ...MIDNIGHT_MARKET, maturity: "invalid" }],
  ] as const)(
    "rejects malformed market (%s) as a request validation error",
    (_case, market) => {
      let error: unknown;
      try {
        parse({
          chainId: 1,
          transactions: [tx()],
          limits: {
            operations: [{ ...valid, market }],
          },
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toContain(
        "limits.operations[0].market: must be a valid Midnight market struct; pass the struct used to build the operation.",
      );
    },
  );

  test("rejects market on an operation that does not accept it", () => {
    let error: unknown;
    try {
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: {
          operations: [
            {
              type: "midnightRedeem",
              marketId: MIDNIGHT_MARKET_ID,
              market: MIDNIGHT_MARKET,
              quote: { creditRedeemed: 1n, assetsReceived: 1n },
            },
          ],
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(
      (error as SimulationValidationError).fieldErrors?.some(
        (line) =>
          line.includes("limits.operations[0]") && line.includes("market"),
      ),
    ).toBe(true);
  });
});

describe("conditionalQuoteViolations", () => {
  test.each([
    {
      type: "blueSupplyCollateralBorrow",
      quote: { sharesMinted: 2n },
      expected: ["assetsReceived"],
    },
    {
      type: "blueSupplyCollateralBorrow",
      quote: { assetsPaid: 2n },
      expected: ["collateralSupplied"],
    },
    {
      type: "blueSupplyCollateralBorrow",
      quote: { sharesMinted: 2n, assetsPaid: 2n },
      expected: ["assetsReceived", "collateralSupplied"],
    },
    {
      type: "blueRepayWithdrawCollateral",
      quote: { collateralWithdrawn: 2n },
      expected: ["assetsReceived"],
    },
    {
      type: "blueRepayWithdrawCollateral",
      quote: { assetsPaid: 2n },
      expected: ["sharesBurned"],
    },
    {
      type: "blueSupplyCollateralBorrow",
      quote: { sharesMinted: 1n, assetsPaid: 1n },
      expected: [],
    },
    {
      type: "blueRepayWithdrawCollateral",
      quote: { collateralWithdrawn: 1n, assetsPaid: 1n },
      expected: [],
    },
    { type: "blueSupply", quote: { assetsPaid: 2n }, expected: [] },
  ] as const)("$type → $expected", ({ type, quote, expected }) => {
    expect(conditionalQuoteViolations(type, quote).map((v) => v.field)).toEqual(
      expected,
    );
  });
});

describe("parseRequest — midnightSupplyCollateral", () => {
  const fieldErrors = (operation: object): readonly string[] => {
    try {
      parse({
        chainId: 8453,
        transactions: [tx()],
        limits: { operations: [operation] },
      });
    } catch (caught) {
      expect(caught).toBeInstanceOf(SimulationValidationError);
      return (caught as SimulationValidationError).fieldErrors ?? [];
    }
    return [];
  };
  const valid = {
    type: "midnightSupplyCollateral",
    marketId: _MARKET_ID,
    collateralIndex: 1n,
    account: TARGET,
    quote: { assetsPaid: 5n, collateralSupplied: 5n },
  };

  test("behavior: parses the Midnight market id and collateral index", () => {
    const request = parse({
      chainId: 8453,
      transactions: [tx()],
      limits: { operations: [valid] },
    });
    expect(limitsOperations(request)?.[0]).toMatchObject({
      type: "midnightSupplyCollateral",
      marketId: _MARKET_ID,
      collateralIndex: 1n,
      account: TARGET,
      quote: { assetsPaid: 5n, collateralSupplied: 5n },
    });
  });
  test("error: requires collateralIndex", () => {
    const { collateralIndex: _, ...rest } = valid;
    expect(fieldErrors(rest)).toContain(
      "limits.operations[0].collateralIndex: must be a bigint",
    );
  });
  test.each([
    ["collateralSupplied", { assetsPaid: 5n }],
    ["assetsPaid", { collateralSupplied: 5n }],
  ] as const)("error: requires quote.%s", (field, quote) => {
    expect(fieldErrors({ ...valid, quote })).toContain(
      `limits.operations[0].quote.${field}: required for "midnightSupplyCollateral"`,
    );
  });
  test("error: a final-zero collateral quote is rejected, not treated as absent", () => {
    expect(
      fieldErrors({
        ...valid,
        quote: { assetsPaid: 5n, collateralSupplied: 0n },
      }),
    ).toContain(
      'limits.operations[0].quote.collateralSupplied: must be positive (got "0")',
    );
  });
  test.each([
    [
      { quote: { ...valid.quote, sharesMinted: 1n } },
      "quote.sharesMinted: cannot be measured",
    ],
    [{ position: { minCollateral: 1n } }, "position: cannot be measured"],
    [
      { sharePrice: { expected: 1n, tolerance: 0n } },
      "sharePrice: cannot be measured",
    ],
    [{ vault: TARGET }, "vault: unknown field"],
  ] as const)("error: rejects unsupported field %#", (extra, message) => {
    expect(
      fieldErrors({ ...valid, ...extra }).some((error) =>
        error.includes(message),
      ),
    ).toBe(true);
  });
  test("error: collateralIndex is unknown on other operation types", () => {
    expect(
      fieldErrors({
        type: "blueSupplyCollateral",
        marketId: _MARKET_ID,
        collateralIndex: 0n,
        quote: { assetsPaid: 5n, collateralSupplied: 5n },
      }),
    ).toContain("limits.operations[0].collateralIndex: unknown field");
  });
});
describe("parseRequest — midnightSupplyBlueMakeLend", () => {
  const valid = {
    type: "midnightSupplyBlueMakeLend",
    loanToken: TOKEN,
    marketId: _MARKET_ID,
    callbackSalt: _MARKET_ID,
    quote: { assetsPaid: 5n, sharesMinted: 2n },
  };
  const fieldErrors = (operation: object) => {
    try {
      parse({
        chainId: 1,
        transactions: [tx()],
        limits: { operations: [operation] },
      });
      return [];
    } catch (error) {
      return error instanceof SimulationValidationError
        ? (error.fieldErrors ?? [])
        : [];
    }
  };

  test("requires a positive assetsPaid quote", () => {
    expect(fieldErrors({ ...valid, quote: {} })).toContain(
      'limits.operations[0].quote.assetsPaid: required for "midnightSupplyBlueMakeLend"',
    );
    expect(fieldErrors({ ...valid, quote: { assetsPaid: 0n } })).toContain(
      'limits.operations[0].quote.assetsPaid: must be positive (got "0")',
    );
  });

  test("requires a positive sharesMinted quote", () => {
    expect(fieldErrors({ ...valid, quote: { assetsPaid: 5n } })).toContain(
      'limits.operations[0].quote.sharesMinted: required for "midnightSupplyBlueMakeLend"',
    );
    expect(
      fieldErrors({
        ...valid,
        quote: { assetsPaid: 5n, sharesMinted: 0n },
      }),
    ).toContain(
      'limits.operations[0].quote.sharesMinted: must be positive (got "0")',
    );
  });

  test.each(["marketId", "callbackSalt"] as const)(
    "requires %s as bytes32",
    (field) => {
      const invalid = { ...valid };
      Reflect.deleteProperty(invalid, field);
      expect(fieldErrors(invalid)).toContain(
        `limits.operations[0].${field}: must be 32-byte hex`,
      );
    },
  );

  test.each(["assetPaid", "assetReceived"] as const)(
    "rejects %s address overrides",
    (field) => {
      expect(fieldErrors({ ...valid, [field]: TARGET })).toContain(
        `limits.operations[0].${field}: unknown field`,
      );
    },
  );

  test.each([
    { quote: { ...valid.quote, assetsReceived: 1n } },
    {
      quote: {
        ...valid.quote,
        positions: [{ marketId: _MARKET_ID, supplyShares: 1n }],
      },
    },
    { sharePrice: { expected: 1n, tolerance: 0n } },
    { position: { minCollateral: 1n } },
  ])("rejects unmeasured fields %#", (extra) => {
    expect(fieldErrors({ ...valid, ...extra }).length).toBeGreaterThan(0);
  });
});

describe("parseRequest — midnightRedeem", () => {
  const fieldErrors = (operation: object): readonly string[] => {
    try {
      parse({
        chainId: 8453,
        transactions: [tx()],
        limits: { operations: [operation] },
      });
    } catch (caught) {
      expect(caught).toBeInstanceOf(SimulationValidationError);
      return (caught as SimulationValidationError).fieldErrors ?? [];
    }
    return [];
  };
  const valid = {
    type: "midnightRedeem",
    marketId: _MARKET_ID,
    account: TARGET,
    quote: { assetsReceived: 5n, creditRedeemed: 5n },
    position: { maxCredit: 0n },
  };

  test("behavior: parses the credit quote and final-credit bound", () => {
    const request = parse({
      chainId: 8453,
      transactions: [tx()],
      limits: { operations: [valid] },
    });
    expect(limitsOperations(request)?.[0]).toMatchObject(valid);
  });
  test.each([
    ["creditRedeemed", { assetsReceived: 5n }],
    ["assetsReceived", { creditRedeemed: 5n }],
  ] as const)("error: requires quote.%s", (field, quote) => {
    expect(fieldErrors({ ...valid, quote })).toContain(
      `limits.operations[0].quote.${field}: required for "midnightRedeem"`,
    );
  });
  test("error: Blue position bounds are rejected on a redeem, and maxCredit elsewhere", () => {
    expect(
      fieldErrors({ ...valid, position: { maxBorrowShares: 0n } }).join("\n"),
    ).toContain("limits.operations[0].position");
    expect(
      fieldErrors({
        type: "midnightSupplyCollateral",
        marketId: _MARKET_ID,
        collateralIndex: 0n,
        quote: { assetsPaid: 5n, collateralSupplied: 5n },
        position: { maxCredit: 0n },
      }).join("\n"),
    ).toContain("limits.operations[0].position");
  });
  test("error: creditRedeemed cannot be quoted on other operations", () => {
    expect(
      fieldErrors({
        type: "blueWithdraw",
        marketId: _MARKET_ID,
        quote: { assetsReceived: 5n, sharesBurned: 5n, creditRedeemed: 5n },
      }),
    ).toContain(
      'limits.operations[0].quote.creditRedeemed: cannot be measured for "blueWithdraw"',
    );
  });
});

describe("parseRequest — Midnight sells", () => {
  const fieldErrors = (operation: object): readonly string[] => {
    try {
      parse({
        chainId: 8453,
        transactions: [tx()],
        limits: { operations: [operation] },
      });
    } catch (caught) {
      expect(caught).toBeInstanceOf(SimulationValidationError);
      return (caught as SimulationValidationError).fieldErrors ?? [];
    }
    return [];
  };
  const borrow = {
    type: "midnightTakeBorrow",
    marketId: _MARKET_ID,
    quote: { unitsSold: 5n, assetsReceived: 5n },
  };
  const withdraw = {
    type: "midnightTakeWithdraw",
    marketId: _MARKET_ID,
    quote: { creditRedeemed: 5n, assetsReceived: 5n },
  };
  const supplyBorrow = {
    type: "midnightSupplyCollateralTakeBorrow",
    marketId: _MARKET_ID,
    quote: {
      collateralSupplies: [{ collateralIndex: 0n, assets: 5n }],
      unitsSold: 5n,
      assetsReceived: 5n,
    },
  };

  test.each([borrow, withdraw, supplyBorrow])(
    "behavior: accepts required quotes for %s",
    (op) => {
      expect(() =>
        parse({
          chainId: 8453,
          transactions: [tx()],
          limits: { operations: [op] },
        }),
      ).not.toThrow();
    },
  );
  test("error: combined supply/take requires a nonempty unique positive collateral quote", () => {
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: { ...supplyBorrow.quote, collateralSupplies: [] },
      }).join("\n"),
    ).toContain("collateralSupplies");
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: {
          ...supplyBorrow.quote,
          collateralSupplies: [
            { collateralIndex: 0n, assets: 5n },
            { collateralIndex: 0n, assets: 5n },
          ],
        },
      }).join("\n"),
    ).toContain("duplicate");
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: {
          ...supplyBorrow.quote,
          collateralSupplies: [{ collateralIndex: 0n, assets: 0n }],
        },
      }).join("\n"),
    ).toContain("positive");
  });
  test.each(["account", "assetPaid", "assetReceived"] as const)(
    "error: combined supply/take rejects %s address overrides",
    (field) => {
      expect(
        fieldErrors({ ...supplyBorrow, [field]: TARGET }).join("\n"),
      ).toContain(`limits.operations[0].${field}: unknown field`);
    },
  );
  test("error: collateralSupplies is exclusive to the combined operation", () => {
    expect(
      fieldErrors({
        ...borrow,
        quote: {
          ...borrow.quote,
          collateralSupplies: [{ collateralIndex: 0n, assets: 5n }],
        },
      }),
    ).toContain(
      'limits.operations[0].quote.collateralSupplies: cannot be measured for "midnightTakeBorrow"',
    );
  });
  test("error: combined supply/take collateralSupplies must be an array", () => {
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: { ...supplyBorrow.quote, collateralSupplies: "invalid" },
      }),
    ).toContain(
      "limits.operations[0].quote.collateralSupplies: must be an array of { collateralIndex, assets }",
    );
  });
  test("error: combined supply/take requires collateralSupplies", () => {
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: {
          unitsSold: supplyBorrow.quote.unitsSold,
          assetsReceived: supplyBorrow.quote.assetsReceived,
        },
      }),
    ).toContain(
      "limits.operations[0].quote.collateralSupplies: must be an array of { collateralIndex, assets }",
    );
  });
  test.each([borrow, withdraw])("error: rejects account for %s", (op) => {
    expect(fieldErrors({ ...op, account: TARGET })).toContain(
      "limits.operations[0].account: unknown field",
    );
    expect(fieldErrors({ ...op, account: undefined })).toContain(
      "limits.operations[0].account: unknown field",
    );
  });
  test("error: takeBorrow requires both position reduction and proceeds", () => {
    expect(fieldErrors({ ...borrow, quote: { assetsReceived: 5n } })).toContain(
      'limits.operations[0].quote.unitsSold: required for "midnightTakeBorrow"',
    );
    expect(fieldErrors({ ...borrow, quote: { unitsSold: 5n } })).toContain(
      'limits.operations[0].quote.assetsReceived: required for "midnightTakeBorrow"',
    );
  });
  test("error: combined supply/take requires position reduction and proceeds", () => {
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: {
          collateralSupplies: supplyBorrow.quote.collateralSupplies,
          assetsReceived: 5n,
        },
      }),
    ).toContain(
      'limits.operations[0].quote.unitsSold: required for "midnightSupplyCollateralTakeBorrow"',
    );
    expect(
      fieldErrors({
        ...supplyBorrow,
        quote: {
          collateralSupplies: supplyBorrow.quote.collateralSupplies,
          unitsSold: 5n,
        },
      }),
    ).toContain(
      'limits.operations[0].quote.assetsReceived: required for "midnightSupplyCollateralTakeBorrow"',
    );
  });
  test("error: takeWithdraw requires credit reduction and proceeds", () => {
    expect(
      fieldErrors({ ...withdraw, quote: { assetsReceived: 5n } }),
    ).toContain(
      'limits.operations[0].quote.creditRedeemed: required for "midnightTakeWithdraw"',
    );
  });
  test("error: position quote fields are exclusive to their sell operation", () => {
    expect(
      fieldErrors({
        ...borrow,
        quote: { unitsSold: 5n, assetsReceived: 5n, creditRedeemed: 5n },
      }),
    ).toContain(
      'limits.operations[0].quote.creditRedeemed: cannot be measured for "midnightTakeBorrow"',
    );
    expect(
      fieldErrors({
        ...withdraw,
        quote: { unitsSold: 5n, assetsReceived: 5n, creditRedeemed: 5n },
      }),
    ).toContain(
      'limits.operations[0].quote.unitsSold: cannot be measured for "midnightTakeWithdraw"',
    );
  });
  test.each([borrow, withdraw, supplyBorrow])(
    "error: position bounds are rejected for %s",
    (op) => {
      expect(
        fieldErrors({ ...op, position: { maxSupplyShares: 0n } }).join("\n"),
      ).toContain("limits.operations[0].position");
    },
  );
  const repayment = {
    type: "midnightRepayWithdrawCollateral",
    marketId: _MARKET_ID,
    quote: { assetsPaid: 10n, debtRepaid: 10n },
  };

  test.each(["account", "assetPaid", "assetReceived"] as const)(
    "error: rejects %s for midnightRepayWithdrawCollateral",
    (field) => {
      expect(fieldErrors({ ...repayment, [field]: TARGET })).toContain(
        `limits.operations[0].${field}: unknown field`,
      );
    },
  );

  test.each([
    "0x0000000000000000000000000000000000000001",
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  ])("error: rejects assetPaid address %s", (assetPaid) => {
    expect(fieldErrors({ ...repayment, assetPaid })).toContain(
      "limits.operations[0].assetPaid: unknown field",
    );
  });

  test("error: rejects assetsReceived and assetReceived on repayment", () => {
    expect(
      fieldErrors({
        ...repayment,
        quote: { assetsReceived: 10n },
      }),
    ).toContain(
      'limits.operations[0].quote.assetsReceived: cannot be measured for "midnightRepayWithdrawCollateral"',
    );
    expect(fieldErrors({ ...repayment, assetReceived: TARGET })).toContain(
      "limits.operations[0].assetReceived: unknown field",
    );
  });

  test("behavior: accepts repayment, withdrawal-only, and exact zero final bounds", () => {
    expect(fieldErrors(repayment)).toEqual([]);
    expect(
      fieldErrors({
        ...repayment,
        quote: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
        },
      }),
    ).toEqual([]);
    expect(
      fieldErrors({
        ...repayment,
        quote: {
          assetsPaid: 10n,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
        },
        position: {
          maxDebt: 0n,
          maxCollateral: [{ collateralIndex: 0n, assets: 0n }],
        },
      }),
    ).toEqual([]);
  });

  const takeRepayment = {
    ...repayment,
    type: "midnightTakeRepayWithdrawCollateral",
  };

  test("behavior: accepts take repayment with withdrawals and a full-debt bound", () => {
    expect(fieldErrors(takeRepayment)).toEqual([]);
    expect(
      fieldErrors({
        ...takeRepayment,
        quote: {
          assetsPaid: 10n,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
        },
        position: { maxDebt: 0n },
      }),
    ).toEqual([]);
  });

  test("error: take repayment requires the repayment leg", () => {
    expect(
      fieldErrors({
        ...takeRepayment,
        quote: {
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
        },
      }),
    ).toContain(
      'limits.operations[0]: quote.debtRepaid or position.maxDebt is required for "midnightTakeRepayWithdrawCollateral"',
    );
  });

  test("error: rejects account, assetReceived and unmatched maxCollateral on take repayment", () => {
    expect(fieldErrors({ ...takeRepayment, account: TARGET })).toContain(
      "limits.operations[0].account: unknown field",
    );
    expect(fieldErrors({ ...takeRepayment, assetReceived: TARGET })).toContain(
      "limits.operations[0].assetReceived: unknown field",
    );
    expect(
      fieldErrors({
        ...takeRepayment,
        position: { maxCollateral: [{ collateralIndex: 1n, assets: 0n }] },
      }),
    ).toContain(
      "limits.operations[0].position.maxCollateral[0].collateralIndex: requires a matching quote.collateralWithdrawals entry",
    );
  });

  test.each([
    { quote: {} },
    { quote: { collateralWithdrawals: [] } },
    { quote: { assetsPaid: 10n } },
    { quote: { debtRepaid: 10n } },
    { quote: { assetsPaid: 10n, debtRepaid: 0n } },
    { quote: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }] } },
    {
      quote: {
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 1n },
          { collateralIndex: 0n, assets: 2n },
        ],
      },
    },
    {
      quote: {
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 1n, unexpected: true },
        ],
      },
    },
    {
      quote: {
        collateralWithdrawals: [
          { collateralIndex: maxUint256 + 1n, assets: 1n },
        ],
      },
    },
    {
      quote: {
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: maxUint256 + 1n },
        ],
      },
    },
  ])("error: rejects malformed or inactive legs %#", (fields) => {
    expect(fieldErrors({ ...repayment, ...fields })).not.toEqual([]);
  });

  test("error: rejects empty collateral withdrawals with a non-empty-array message", () => {
    expect(
      fieldErrors({
        ...repayment,
        quote: { collateralWithdrawals: [] },
      }).join("\n"),
    ).toContain(
      "limits.operations[0].quote.collateralWithdrawals: must be a non-empty array",
    );
  });

  test.each([
    { maxDebt: -1n },
    { maxCollateral: [] },
    { maxCollateral: [{ collateralIndex: 0n, assets: -1n }] },
    {
      maxCollateral: [
        { collateralIndex: 0n, assets: 0n },
        { collateralIndex: 0n, assets: 1n },
      ],
    },
    { maxCollateral: [{ collateralIndex: 0n, assets: 0n, other: 1n }] },
    { maxCredit: 0n },
    { maxSupplyShares: 0n },
  ])("error: rejects invalid or unrelated position bounds %#", (position) => {
    expect(fieldErrors({ ...repayment, position })).not.toEqual([]);
  });

  test("error: requires a quoted withdrawal for each maxCollateral index", () => {
    expect(
      fieldErrors({
        ...repayment,
        position: { maxCollateral: [{ collateralIndex: 0n, assets: 0n }] },
      }).join("\n"),
    ).toContain(
      "position.maxCollateral[0].collateralIndex: requires a matching quote.collateralWithdrawals entry",
    );
  });

  test("error: rejects Midnight debt fields on other operation types", () => {
    expect(
      fieldErrors({
        type: "midnightRedeem",
        marketId: _MARKET_ID,
        quote: { assetsReceived: 1n, creditRedeemed: 1n, debtRepaid: 1n },
      }).join("\n"),
    ).toContain("debtRepaid");
    expect(
      fieldErrors({
        type: "midnightRedeem",
        marketId: _MARKET_ID,
        quote: {
          assetsReceived: 1n,
          creditRedeemed: 1n,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        },
      }).join("\n"),
    ).toContain("collateralWithdrawals");
    expect(
      fieldErrors({
        type: "blueRepay",
        marketId: _MARKET_ID,
        quote: { assetsPaid: 1n, sharesBurned: 1n },
        position: { maxDebt: 0n },
      }).join("\n"),
    ).toContain("maxDebt");
  });

  test("error: sharePrice is not measurable for this operation", () => {
    expect(
      fieldErrors({
        ...repayment,
        sharePrice: { expected: 10n ** 27n, tolerance: 0n },
      }).join("\n"),
    ).toContain("sharePrice");
  });
});

describe("parseRequest — Midnight buys", () => {
  const buy = {
    type: "midnightTakeLend",
    marketId: _MARKET_ID,
    quote: { assetsPaid: 5n, unitsBought: 5n },
  };
  const fieldErrors = (operation: object): readonly string[] => {
    try {
      parse({
        chainId: 8453,
        transactions: [tx()],
        limits: { operations: [operation] },
      });
    } catch (caught) {
      expect(caught).toBeInstanceOf(SimulationValidationError);
      return (caught as SimulationValidationError).fieldErrors ?? [];
    }
    return [];
  };
  test("behavior: accepts required spend and net-position quotes", () => {
    expect(() =>
      parse({
        chainId: 8453,
        transactions: [tx()],
        limits: { operations: [buy] },
      }),
    ).not.toThrow();
  });
  test.each([TARGET, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"])(
    "error: rejects assetPaid address %s",
    (assetPaid) => {
      expect(fieldErrors({ ...buy, assetPaid })).toContain(
        "limits.operations[0].assetPaid: unknown field",
      );
    },
  );
  test.each(["account", "receiver"] as const)(
    "error: rejects %s address",
    (field) => {
      expect(fieldErrors({ ...buy, [field]: TARGET })).toContain(
        `limits.operations[0].${field}: unknown field`,
      );
    },
  );
  test("error: rejects assetsReceived quote", () => {
    expect(
      fieldErrors({ ...buy, quote: { ...buy.quote, assetsReceived: 5n } }),
    ).toContain(
      'limits.operations[0].quote.assetsReceived: cannot be measured for "midnightTakeLend"',
    );
  });
  test("error: rejects assetReceived", () => {
    expect(fieldErrors({ ...buy, assetReceived: TARGET })).toContain(
      "limits.operations[0].assetReceived: unknown field",
    );
  });
  test("error: rejects position bounds", () => {
    expect(
      fieldErrors({ ...buy, position: { maxSupplyAssets: 1n } }),
    ).toContain(
      'limits.operations[0].position: cannot be measured for "midnightTakeLend"',
    );
  });
  test.each([
    ["assetsPaid", { unitsBought: 5n }],
    ["unitsBought", { assetsPaid: 5n }],
  ] as const)("error: requires %s", (field, quote) => {
    expect(fieldErrors({ ...buy, quote })).toContain(
      `limits.operations[0].quote.${field}: required for "midnightTakeLend"`,
    );
  });
});
