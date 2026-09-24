import type { MarketId } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  getAddress,
  type Hex,
  isAddress,
  maxUint256,
} from "viem";
import { z } from "zod";
import type { SimulationAuthorization } from "../../domain/authorizations.js";
import type { NormalizedSimulateParams } from "../../domain/request.js";
import { brandParsed, type ParsedRequest } from "../../domain/stages.js";
import { SimulationValidationError } from "../../errors.js";
import { resolveEffectiveLimits } from "./effective-limits.js";

// ─── Scalars ──────────────────────────────────────────────────────────────────

const addressSchema = z
  .string()
  .refine(isAddress, { error: "must be a valid address" })
  .transform((value) => getAddress(value));

const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, { error: "must be hex data" })
  .transform((value) => value as Hex);

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, { error: "must be 32-byte hex" })
  .transform((value) => value as Hex);

const marketIdSchema = bytes32Schema.transform((value) => value as MarketId);

const uint256Schema = z
  .bigint()
  .min(0n, { error: "must be non-negative" })
  .max(maxUint256, { error: "exceeds uint256" });

const blockTagSchema = z.enum([
  "latest",
  "earliest",
  "pending",
  "safe",
  "finalized",
]);

// ─── Transactions ─────────────────────────────────────────────────────────────

const transactionSchema = z.strictObject({
  from: addressSchema,
  to: addressSchema,
  data: hexSchema,
  value: uint256Schema.optional(),
});

// ─── Authorization typed data ─────────────────────────────────────────────────

const domainSchema = z.strictObject({
  name: z.string().optional(),
  version: z.string().optional(),
  chainId: z.union([z.number().int().positive(), uint256Schema]),
  verifyingContract: addressSchema,
  salt: bytes32Schema.optional(),
});

const typedField = (name: string, type: string) =>
  z.strictObject({ name: z.literal(name), type: z.literal(type) });

const erc2612TypedDataSchema = z.strictObject({
  domain: domainSchema,
  primaryType: z.literal("Permit"),
  types: z.strictObject({
    Permit: z.tuple([
      typedField("owner", "address"),
      typedField("spender", "address"),
      typedField("value", "uint256"),
      typedField("nonce", "uint256"),
      typedField("deadline", "uint256"),
    ]),
  }),
  message: z.strictObject({
    owner: addressSchema,
    spender: addressSchema,
    value: uint256Schema,
    nonce: uint256Schema,
    deadline: uint256Schema,
  }),
});

const permit2TypedDataSchema = z.strictObject({
  domain: domainSchema,
  primaryType: z.literal("PermitTransferFrom"),
  types: z.strictObject({
    PermitTransferFrom: z.tuple([
      typedField("permitted", "TokenPermissions"),
      typedField("spender", "address"),
      typedField("nonce", "uint256"),
      typedField("deadline", "uint256"),
    ]),
    TokenPermissions: z.tuple([
      typedField("token", "address"),
      typedField("amount", "uint256"),
    ]),
  }),
  message: z.strictObject({
    permitted: z.strictObject({
      token: addressSchema,
      amount: uint256Schema,
    }),
    spender: addressSchema,
    nonce: uint256Schema,
    deadline: uint256Schema,
  }),
});

const blueAuthorizationTypedDataSchema = z.strictObject({
  domain: domainSchema,
  primaryType: z.literal("Authorization"),
  types: z.strictObject({
    Authorization: z.tuple([
      typedField("authorizer", "address"),
      typedField("authorized", "address"),
      typedField("isAuthorized", "bool"),
      typedField("nonce", "uint256"),
      typedField("deadline", "uint256"),
    ]),
  }),
  message: z.strictObject({
    authorizer: addressSchema,
    authorized: addressSchema,
    isAuthorized: z.boolean(),
    nonce: uint256Schema,
    deadline: uint256Schema,
  }),
});

const authorizationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("erc20Approval"),
    token: addressSchema,
    owner: addressSchema,
    spender: addressSchema,
    amount: uint256Schema,
  }),
  z.strictObject({
    type: z.literal("erc2612Permit"),
    typedData: erc2612TypedDataSchema,
  }),
  z.strictObject({
    type: z.literal("permit2SignatureTransfer"),
    owner: addressSchema,
    typedData: permit2TypedDataSchema,
  }),
  z.strictObject({
    type: z.literal("blueAuthorization"),
    authorizer: addressSchema,
    authorized: addressSchema,
    isAuthorized: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("blueAuthorizationSignature"),
    typedData: blueAuthorizationTypedDataSchema,
  }),
]);

// ─── Limits ───────────────────────────────────────────────────────────────────

const tokenAmountSchema = z.strictObject({
  token: addressSchema,
  amount: uint256Schema,
});

const deallocationSchema = z.strictObject({
  adapter: addressSchema,
  marketId: marketIdSchema.optional(),
  amount: uint256Schema,
});

const marketSupplyMinimumSchema = z.strictObject({
  marketId: marketIdSchema,
  minAssets: uint256Schema,
});

const transactionIndexField = {
  transactionIndex: z.number().int().min(0).optional(),
};

const migrateToV2Base = {
  type: z.literal("vaultV1MigrateToV2"),
  sourceVault: addressSchema,
  targetVault: addressSchema,
  expectedReceiver: addressSchema.optional(),
  minTargetSharesMinted: uint256Schema.optional(),
  ...transactionIndexField,
};

const operationLimitSchema = z.union([
  z.strictObject({
    type: z.literal("blueSupply"),
    marketId: marketIdSchema,
    expectedAssets: uint256Schema.optional(),
    expectedOnBehalf: addressSchema.optional(),
    minSupplySharesMinted: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueWithdraw"),
    marketId: marketIdSchema,
    expectedReceiver: addressSchema.optional(),
    expectedFullClose: z.boolean().optional(),
    minAssetsReceived: uint256Schema.optional(),
    maxSupplySharesBurned: uint256Schema.optional(),
    maxUtilizationAfterWad: uint256Schema.optional(),
    maxReallocationPenaltyAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueSupplyCollateral"),
    marketId: marketIdSchema,
    expectedAssets: uint256Schema.optional(),
    expectedOnBehalf: addressSchema.optional(),
    maxLtvAfterWad: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueBorrow"),
    marketId: marketIdSchema,
    expectedAssets: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    maxBorrowSharesMinted: uint256Schema.optional(),
    maxLtvAfterWad: uint256Schema.optional(),
    minHealthFactorAfterWad: uint256Schema.optional(),
    maxUtilizationAfterWad: uint256Schema.optional(),
    maxBorrowApyAfterWad: uint256Schema.optional(),
    maxReallocationPenaltyAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueSupplyCollateralBorrow"),
    marketId: marketIdSchema,
    expectedCollateralAssets: uint256Schema.optional(),
    expectedBorrowAssets: uint256Schema.optional(),
    expectedOnBehalf: addressSchema.optional(),
    expectedReceiver: addressSchema.optional(),
    maxBorrowSharesMinted: uint256Schema.optional(),
    maxLtvAfterWad: uint256Schema.optional(),
    minHealthFactorAfterWad: uint256Schema.optional(),
    maxUtilizationAfterWad: uint256Schema.optional(),
    maxBorrowApyAfterWad: uint256Schema.optional(),
    maxReallocationPenaltyAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueRepay"),
    marketId: marketIdSchema,
    expectedOnBehalf: addressSchema.optional(),
    expectedFullClose: z.boolean().optional(),
    maxAssetsPaid: uint256Schema.optional(),
    minBorrowSharesBurned: uint256Schema.optional(),
    maxResidualBorrowShares: uint256Schema.optional(),
    minRefundAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueWithdrawCollateral"),
    marketId: marketIdSchema,
    expectedAssets: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    maxLtvAfterWad: uint256Schema.optional(),
    minHealthFactorAfterWad: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueRepayWithdrawCollateral"),
    marketId: marketIdSchema,
    expectedWithdrawAssets: uint256Schema.optional(),
    expectedOnBehalf: addressSchema.optional(),
    expectedReceiver: addressSchema.optional(),
    expectedFullClose: z.boolean().optional(),
    maxAssetsPaid: uint256Schema.optional(),
    minBorrowSharesBurned: uint256Schema.optional(),
    maxResidualBorrowShares: uint256Schema.optional(),
    minRefundAssets: uint256Schema.optional(),
    maxLtvAfterWad: uint256Schema.optional(),
    minHealthFactorAfterWad: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueRefinance"),
    sourceMarketId: marketIdSchema,
    targetMarketId: marketIdSchema,
    expectedSourceFullClose: z.boolean().optional(),
    maxTargetBorrowAssets: uint256Schema.optional(),
    maxTargetBorrowSharesMinted: uint256Schema.optional(),
    maxSourceResidualBorrowShares: uint256Schema.optional(),
    maxTargetLtvAfterWad: uint256Schema.optional(),
    minTargetHealthFactorAfterWad: uint256Schema.optional(),
    maxLoanDustAssets: uint256Schema.optional(),
    maxReallocationPenaltyAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("blueAuthorization"),
    authorized: addressSchema,
    expectedIsAuthorized: z.boolean().optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV1Deposit"),
    vault: addressSchema,
    expectedAssets: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    minSharesMinted: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV2Deposit"),
    vault: addressSchema,
    expectedAssets: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    minSharesMinted: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV1Withdraw"),
    vault: addressSchema,
    expectedAssets: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    maxSharesBurned: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV2Withdraw"),
    vault: addressSchema,
    expectedAssets: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    maxSharesBurned: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV1Redeem"),
    vault: addressSchema,
    expectedShares: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    minAssetsReceived: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV2Redeem"),
    vault: addressSchema,
    expectedShares: uint256Schema.optional(),
    expectedReceiver: addressSchema.optional(),
    minAssetsReceived: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV2ForceWithdraw"),
    vault: addressSchema,
    expectedExitAssets: uint256Schema.optional(),
    expectedAdapter: addressSchema.optional(),
    maxSharesBurned: uint256Schema.optional(),
    minAssetsReceived: uint256Schema.optional(),
    maxPenaltyAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV2ForceRedeem"),
    vault: addressSchema,
    expectedShares: uint256Schema.optional(),
    expectedDeallocations: z.array(deallocationSchema).optional(),
    minAssetsReceived: uint256Schema.optional(),
    maxPenaltyShares: uint256Schema.optional(),
    maxPenaltyAssets: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV1InKindRedeem"),
    vault: addressSchema,
    expectedAssets: uint256Schema.optional(),
    expectedMarketIds: z.array(marketIdSchema).optional(),
    maxSharesBurned: uint256Schema.optional(),
    minIdleAssetsReceived: uint256Schema.optional(),
    minSupplyAssetsByMarket: z.array(marketSupplyMinimumSchema).optional(),
    maxPenaltyAssets: uint256Schema.optional(),
    maxResidualShareAllowance: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    type: z.literal("vaultV2InKindRedeem"),
    vault: addressSchema,
    expectedAssets: uint256Schema.optional(),
    expectedMarketIds: z.array(marketIdSchema).optional(),
    maxSharesBurned: uint256Schema.optional(),
    minIdleAssetsReceived: uint256Schema.optional(),
    minSupplyAssetsByMarket: z.array(marketSupplyMinimumSchema).optional(),
    maxPenaltyAssets: uint256Schema.optional(),
    maxResidualShareAllowance: uint256Schema.optional(),
    ...transactionIndexField,
  }),
  z.strictObject({
    ...migrateToV2Base,
    expectedAssets: uint256Schema.optional(),
    expectedShares: z.undefined().optional(),
  }),
  z.strictObject({
    ...migrateToV2Base,
    expectedAssets: z.undefined().optional(),
    expectedShares: uint256Schema.optional(),
  }),
]);

const limitsSchema = z.strictObject({
  maxSlippageWad: uint256Schema.optional(),
  minLltvBufferWad: uint256Schema.optional(),
  maxSignatureLifetimeSeconds: uint256Schema.optional(),
  wallet: z
    .strictObject({
      maxDebit: z.array(tokenAmountSchema).optional(),
      minCredit: z.array(tokenAmountSchema).optional(),
    })
    .optional(),
  operations: z.array(operationLimitSchema).optional(),
});

// ─── Request ──────────────────────────────────────────────────────────────────

const requestSchema = z.strictObject({
  chainId: z.number().int().positive().safe(),
  transactions: z.array(transactionSchema).min(1),
  blockNumber: z.union([z.bigint().min(0n), blockTagSchema]).optional(),
  mode: z.enum(["preview", "final"]).optional(),
  authorizations: z.array(authorizationSchema).optional(),
  limits: limitsSchema.optional(),
});

const authorizationOwner = (authorization: SimulationAuthorization): Address =>
  authorization.type === "erc20Approval"
    ? authorization.owner
    : authorization.type === "erc2612Permit"
      ? authorization.typedData.message.owner
      : authorization.type === "permit2SignatureTransfer"
        ? authorization.owner
        : authorization.type === "blueAuthorization"
          ? authorization.authorizer
          : authorization.typedData.message.authorizer;

const authorizationDomainChainId = (
  authorization: SimulationAuthorization,
): number | bigint | undefined =>
  authorization.type === "erc2612Permit" ||
  authorization.type === "permit2SignatureTransfer" ||
  authorization.type === "blueAuthorizationSignature"
    ? authorization.typedData.domain.chainId
    : undefined;

/**
 * Parse and normalize raw `simulate` input into a branded {@link ParsedRequest}.
 *
 * Strict schemas reject unknown keys — legacy `{type: "approval"}` /
 * `{type: "signature"}` authorizations and Permit2 `PermitSingle` payloads fail
 * here rather than being silently reinterpreted. Cross-field rules then pin a
 * single owner: every transaction `from` and every authorization owner must be
 * the same checksummed address, typed-data domains must bind to `chainId`, and
 * `mode: "final"` rejects authorizations outright.
 *
 * @param input - Unvalidated caller input (`SimulateParams`-shaped).
 * @returns A deep-frozen, checksummed request: `mode` explicit (`"final"`
 *   default), `authorizations` always an array, `value` defaulted to `0n`.
 * @throws {SimulationValidationError} On any schema or cross-field violation.
 * @internal
 */
export function parseRequest(input: unknown): ParsedRequest {
  const result = requestSchema.safeParse(input);
  if (!result.success) {
    throw new SimulationValidationError(
      "Invalid simulation input",
      result.error.issues.map(
        (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
      ),
    );
  }

  const parsed = result.data;
  const fieldErrors: string[] = [];

  const owner = parsed.transactions[0]!.from;
  for (const [i, tx] of parsed.transactions.entries()) {
    if (tx.from !== owner) {
      fieldErrors.push(
        `transactions[${i}].from: all transactions must share the same from address (expected ${owner}, got ${tx.from})`,
      );
    }
  }

  const mode = parsed.mode ?? "final";
  const authorizations = parsed.authorizations;
  if (mode === "final" && authorizations !== undefined) {
    fieldErrors.push(
      "authorizations: are only accepted in preview mode; sign them and submit mode 'final' without authorizations",
    );
  }

  for (const [i, authorization] of (authorizations ?? []).entries()) {
    const authorizationOwnerAddress = authorizationOwner(
      authorization as SimulationAuthorization,
    );
    if (authorizationOwnerAddress !== owner) {
      fieldErrors.push(
        `authorizations[${i}]: owner must equal the bundle sender ${owner} (got ${authorizationOwnerAddress})`,
      );
    }
    const domainChainId = authorizationDomainChainId(
      authorization as SimulationAuthorization,
    );
    if (
      domainChainId !== undefined &&
      BigInt(domainChainId) !== BigInt(parsed.chainId)
    ) {
      fieldErrors.push(
        `authorizations[${i}].typedData.domain.chainId: must equal the request chainId ${parsed.chainId} (got ${domainChainId})`,
      );
    }
  }

  for (const [i, operation] of (parsed.limits?.operations ?? []).entries()) {
    if (
      operation.transactionIndex !== undefined &&
      operation.transactionIndex >= parsed.transactions.length
    ) {
      fieldErrors.push(
        `limits.operations[${i}].transactionIndex: ${operation.transactionIndex} is out of range for ${parsed.transactions.length} transaction(s)`,
      );
    }
  }

  try {
    // Validate tightening rules; the resolved value is carried by later stages.
    resolveEffectiveLimits(parsed.limits);
  } catch (error) {
    if (error instanceof SimulationValidationError) {
      fieldErrors.push(...(error.fieldErrors ?? []));
    } else {
      throw error;
    }
  }

  if (fieldErrors.length > 0) {
    throw new SimulationValidationError(
      "Invalid simulation input",
      fieldErrors,
    );
  }

  const normalized: NormalizedSimulateParams = deepFreeze({
    chainId: parsed.chainId,
    transactions: parsed.transactions.map((tx) => ({
      ...tx,
      value: tx.value ?? 0n,
    })),
    ...(parsed.blockNumber !== undefined
      ? { blockNumber: parsed.blockNumber }
      : {}),
    ...(parsed.limits !== undefined ? { limits: parsed.limits } : {}),
    ...(mode === "preview"
      ? { mode, authorizations: authorizations ?? [] }
      : { mode, authorizations: [] }),
  } as NormalizedSimulateParams);

  return brandParsed(normalized);
}
