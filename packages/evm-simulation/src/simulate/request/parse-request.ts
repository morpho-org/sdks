import type { MarketId } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  type BlockTag,
  getAddress,
  type Hex,
  isAddress,
  isAddressEqual,
  isHex,
  maxUint256,
} from "viem";
import type {
  Eip712Field,
  PendingAuthorization,
} from "../../authorizations.js";
import { SimulationValidationError } from "../../errors.js";
import type { OperationType, SimulationLimits } from "../../limits.js";
import type { SimulationMode, VerifiedSimulateParams } from "../../params.js";
import { NATIVE_BALANCE_PROBE_ADDRESS } from "../plan/native-balance-probe.js";
import { resolveEffectiveLimits } from "./effective-limits.js";

/** A normalized user transaction: checksummed addresses, `value` defaulted to `0n`.
 * @internal
 */
export interface ParsedTransaction {
  readonly from: Address;
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

/** The output of {@link parseRequest}: the caller's input validated, checksummed and defaulted.
 * @internal
 */
export interface ParsedRequest {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly transactions: readonly ParsedTransaction[];
  /** Always empty in final mode. */
  readonly authorizations: readonly PendingAuthorization[];
  readonly blockNumber?: bigint | BlockTag;
  readonly limits?: SimulationLimits;
}

// ─── Scalar validators ────────────────────────────────────────────────────────

// `input` is the typed public request, but JS callers can still pass wrong
// values: every scalar is checked at runtime and reports into `fieldErrors`.

const readField = (object: object, key: string): unknown =>
  Reflect.get(object, key);

const isRecord = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// "pending" is rejected: only canonical (mined) blocks can be pinned.
const BLOCK_TAGS = ["latest", "earliest", "safe", "finalized"] as const;

// ─── Typed-data field lists ───────────────────────────────────────

const ERC2612_PERMIT_FIELDS = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

const PERMIT2_TRANSFER_FIELDS = [
  { name: "permitted", type: "TokenPermissions" },
  { name: "spender", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

const PERMIT2_TOKEN_PERMISSIONS_FIELDS = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" },
] as const;

const BLUE_AUTHORIZATION_FIELDS = [
  { name: "authorizer", type: "address" },
  { name: "authorized", type: "address" },
  { name: "isAuthorized", type: "bool" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

// ─── Request validators ───────────────────────────────────────────

interface FieldChecks {
  readonly errors: string[];
  address(value: unknown, path: string): Address | undefined;
  hex(value: unknown, path: string): Hex | undefined;
  bytes32(value: unknown, path: string): Hex | undefined;
  marketId(value: unknown, path: string): MarketId | undefined;
  uint256(value: unknown, path: string): bigint | undefined;
  bool(value: unknown, path: string): boolean | undefined;
  nonNegInt(value: unknown, path: string): number | undefined;
  domain(value: unknown, path: string): void;
  fields(args: {
    readonly actual: unknown;
    readonly expected: readonly {
      readonly name: string;
      readonly type: string;
    }[];
    readonly path: string;
  }): void;
  authorization(value: unknown, path: string): PendingAuthorization | undefined;
  operation(value: unknown, path: string): void;
}

/** Field validators closing over one `errors` accumulator. @internal */
const createChecks = (): FieldChecks => {
  const errors: string[] = [];

  const check: FieldChecks = {
    errors,

    address: (value, path) => {
      if (typeof value === "string" && isAddress(value))
        return getAddress(value);
      errors.push(`${path}: must be a valid address`);
      return undefined;
    },

    hex: (value, path) => {
      if (isHex(value)) return value;
      errors.push(`${path}: must be a hex data`);
      return undefined;
    },

    bytes32: (value, path) => {
      if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value))
        return value as Hex;
      errors.push(`${path}: must be 32-byte hex`);
      return undefined;
    },

    marketId: (value, path) => check.bytes32(value, path) as MarketId,

    uint256: (value, path) => {
      if (typeof value !== "bigint") {
        errors.push(`${path}: must be a bigint`);
        return undefined;
      }
      if (value < 0n) {
        errors.push(`${path}: must be non-negative`);
        return undefined;
      }
      if (value > maxUint256) {
        errors.push(`${path}: exceeds uint256`);
        return undefined;
      }
      return value;
    },

    bool: (value, path) => {
      if (typeof value === "boolean") return value;
      errors.push(`${path}: must be a boolean`);
      return undefined;
    },

    nonNegInt: (value, path) => {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        Number.isSafeInteger(value) &&
        value >= 0
      )
        return value;
      errors.push(`${path}: must be a non-negative integer`);
      return undefined;
    },

    domain: (domain, path) => {
      if (!isRecord(domain)) {
        errors.push(`${path}: must be an object`);
        return;
      }
      const name = readField(domain, "name");
      if (name !== undefined && typeof name !== "string")
        errors.push(`${path}.name: must be a string`);
      const version = readField(domain, "version");
      if (version !== undefined && typeof version !== "string")
        errors.push(`${path}.version: must be a string`);
      const chainId = readField(domain, "chainId");
      const validChainId =
        (typeof chainId === "number" &&
          Number.isInteger(chainId) &&
          chainId > 0) ||
        (typeof chainId === "bigint" && chainId >= 0n && chainId <= maxUint256);
      if (!validChainId)
        errors.push(`${path}.chainId: must be a positive integer or uint256`);
      check.address(
        readField(domain, "verifyingContract"),
        `${path}.verifyingContract`,
      );
      const salt = readField(domain, "salt");
      if (salt !== undefined) check.bytes32(salt, `${path}.salt`);
    },

    fields: ({ actual, expected, path }) => {
      const fields = actual as readonly Eip712Field[] | undefined;
      const equal =
        Array.isArray(fields) &&
        fields.length === expected.length &&
        expected.every(
          (field, i) =>
            fields[i]?.name === field.name && fields[i]?.type === field.type,
        );
      if (!equal)
        errors.push(
          `${path}: must list exactly ${expected.map((f) => `${f.name}: ${f.type}`).join(", ")}`,
        );
    },

    authorization: (authorization, path) => {
      const type = isRecord(authorization)
        ? readField(authorization, "type")
        : undefined;
      if (!isRecord(authorization) || typeof type !== "string") {
        errors.push(`${path}.type: must name an authorization type`);
        return undefined;
      }
      const errorsBefore = errors.length;
      switch (type) {
        case "erc20Approval": {
          check.address(readField(authorization, "token"), `${path}.token`);
          check.address(readField(authorization, "owner"), `${path}.owner`);
          check.address(readField(authorization, "spender"), `${path}.spender`);
          check.uint256(readField(authorization, "amount"), `${path}.amount`);
          break;
        }
        case "erc2612Permit": {
          const typedData = readField(authorization, "typedData");
          if (!isRecord(typedData)) {
            errors.push(`${path}.typedData: must be an object`);
            break;
          }
          check.domain(
            readField(typedData, "domain"),
            `${path}.typedData.domain`,
          );
          if (readField(typedData, "primaryType") !== "Permit")
            errors.push(
              `${path}.typedData.primaryType: must be "Permit" (got ${String(readField(typedData, "primaryType"))})`,
            );
          const types = readField(typedData, "types");
          check.fields({
            actual: isRecord(types) ? readField(types, "Permit") : undefined,
            expected: ERC2612_PERMIT_FIELDS,
            path: `${path}.typedData.types.Permit`,
          });
          const message = readField(typedData, "message");
          if (!isRecord(message)) {
            errors.push(`${path}.typedData.message: must be an object`);
            break;
          }
          const messagePath = `${path}.typedData.message`;
          check.address(readField(message, "owner"), `${messagePath}.owner`);
          check.address(
            readField(message, "spender"),
            `${messagePath}.spender`,
          );
          check.uint256(readField(message, "value"), `${messagePath}.value`);
          check.uint256(readField(message, "nonce"), `${messagePath}.nonce`);
          check.uint256(
            readField(message, "deadline"),
            `${messagePath}.deadline`,
          );
          break;
        }
        case "permit2SignatureTransfer": {
          check.address(readField(authorization, "owner"), `${path}.owner`);
          const typedData = readField(authorization, "typedData");
          if (!isRecord(typedData)) {
            errors.push(`${path}.typedData: must be an object`);
            break;
          }
          check.domain(
            readField(typedData, "domain"),
            `${path}.typedData.domain`,
          );
          if (readField(typedData, "primaryType") !== "PermitTransferFrom")
            errors.push(
              `${path}.typedData.primaryType: must be "PermitTransferFrom" (got ${String(readField(typedData, "primaryType"))})`,
            );
          const types = readField(typedData, "types");
          check.fields({
            actual: isRecord(types)
              ? readField(types, "PermitTransferFrom")
              : undefined,
            expected: PERMIT2_TRANSFER_FIELDS,
            path: `${path}.typedData.types.PermitTransferFrom`,
          });
          check.fields({
            actual: isRecord(types)
              ? readField(types, "TokenPermissions")
              : undefined,
            expected: PERMIT2_TOKEN_PERMISSIONS_FIELDS,
            path: `${path}.typedData.types.TokenPermissions`,
          });
          const message = readField(typedData, "message");
          const permitted = isRecord(message)
            ? readField(message, "permitted")
            : undefined;
          if (!isRecord(message) || !isRecord(permitted)) {
            errors.push(
              `${path}.typedData.message: must carry permitted token and amount`,
            );
            break;
          }
          const messagePath = `${path}.typedData.message`;
          check.address(
            readField(permitted, "token"),
            `${messagePath}.permitted.token`,
          );
          check.uint256(
            readField(permitted, "amount"),
            `${messagePath}.permitted.amount`,
          );
          check.address(
            readField(message, "spender"),
            `${messagePath}.spender`,
          );
          check.uint256(readField(message, "nonce"), `${messagePath}.nonce`);
          check.uint256(
            readField(message, "deadline"),
            `${messagePath}.deadline`,
          );
          break;
        }
        case "blueAuthorization": {
          check.address(
            readField(authorization, "authorizer"),
            `${path}.authorizer`,
          );
          check.address(
            readField(authorization, "authorized"),
            `${path}.authorized`,
          );
          check.bool(
            readField(authorization, "isAuthorized"),
            `${path}.isAuthorized`,
          );
          break;
        }
        case "blueAuthorizationSignature": {
          const typedData = readField(authorization, "typedData");
          if (!isRecord(typedData)) {
            errors.push(`${path}.typedData: must be an object`);
            break;
          }
          check.domain(
            readField(typedData, "domain"),
            `${path}.typedData.domain`,
          );
          if (readField(typedData, "primaryType") !== "Authorization")
            errors.push(
              `${path}.typedData.primaryType: must be "Authorization" (got ${String(readField(typedData, "primaryType"))})`,
            );
          const types = readField(typedData, "types");
          check.fields({
            actual: isRecord(types)
              ? readField(types, "Authorization")
              : undefined,
            expected: BLUE_AUTHORIZATION_FIELDS,
            path: `${path}.typedData.types.Authorization`,
          });
          const message = readField(typedData, "message");
          if (!isRecord(message)) {
            errors.push(`${path}.typedData.message: must be an object`);
            break;
          }
          const messagePath = `${path}.typedData.message`;
          check.address(
            readField(message, "authorizer"),
            `${messagePath}.authorizer`,
          );
          check.address(
            readField(message, "authorized"),
            `${messagePath}.authorized`,
          );
          check.bool(
            readField(message, "isAuthorized"),
            `${messagePath}.isAuthorized`,
          );
          check.uint256(readField(message, "nonce"), `${messagePath}.nonce`);
          check.uint256(
            readField(message, "deadline"),
            `${messagePath}.deadline`,
          );
          break;
        }
        default: {
          errors.push(
            `${path}.type: unsupported authorization type "${String(type)}"`,
          );
          return undefined;
        }
      }
      return errors.length === errorsBefore
        ? (authorization as PendingAuthorization)
        : undefined;
    },

    operation: (operation, path) => {
      const type = isRecord(operation)
        ? readField(operation, "type")
        : undefined;
      if (
        !isRecord(operation) ||
        typeof type !== "string" ||
        !(type in OPERATION_SPECS)
      ) {
        errors.push(
          `${path}.type: unsupported operation type "${String(type)}"`,
        );
        return;
      }
      const spec = OPERATION_SPECS[type as OperationType];
      const requiredAddresses = new Set(
        REQUIRED_ADDRESSES[type as OperationType],
      );
      for (const field of spec.markets)
        check.marketId(readField(operation, field), `${path}.${field}`);
      for (const field of spec.addresses) {
        const value = readField(operation, field);
        if (value === undefined && !requiredAddresses.has(field)) continue;
        check.address(value, `${path}.${field}`);
      }
      for (const field of spec.uints) {
        const value = readField(operation, field);
        if (value === undefined) continue;
        check.uint256(value, `${path}.${field}`);
      }
      for (const field of spec.bools) {
        const value = readField(operation, field);
        if (value === undefined) continue;
        check.bool(value, `${path}.${field}`);
      }
      const transactionIndex = readField(operation, "transactionIndex");
      if (transactionIndex !== undefined)
        check.nonNegInt(transactionIndex, `${path}.transactionIndex`);
      for (const field of spec.marketIdArrays) {
        const value = readField(operation, field);
        if (value === undefined) continue;
        if (!Array.isArray(value)) {
          errors.push(`${path}.${field}: must be an array of market ids`);
          continue;
        }
        for (const [j, entry] of value.entries())
          check.marketId(entry, `${path}.${field}[${j}]`);
      }
      if (spec.deallocations) {
        const value = readField(operation, "expectedDeallocations");
        if (value !== undefined) {
          if (!Array.isArray(value)) {
            errors.push(`${path}.expectedDeallocations: must be an array`);
          } else {
            for (const [j, entry] of value.entries()) {
              const entryPath = `${path}.expectedDeallocations[${j}]`;
              if (!isRecord(entry)) {
                errors.push(`${entryPath}: must be an object`);
                continue;
              }
              check.address(
                readField(entry, "adapter"),
                `${entryPath}.adapter`,
              );
              if (readField(entry, "marketId") !== undefined)
                check.marketId(
                  readField(entry, "marketId"),
                  `${entryPath}.marketId`,
                );
              check.uint256(readField(entry, "assets"), `${entryPath}.assets`);
            }
          }
        }
      }
      if (spec.minSupplyByMarket) {
        const value = readField(operation, "minSupplyAssetsByMarket");
        if (value !== undefined) {
          if (!Array.isArray(value)) {
            errors.push(`${path}.minSupplyAssetsByMarket: must be an array`);
          } else {
            for (const [j, entry] of value.entries()) {
              const entryPath = `${path}.minSupplyAssetsByMarket[${j}]`;
              if (!isRecord(entry)) {
                errors.push(`${entryPath}: must be an object`);
                continue;
              }
              check.marketId(
                readField(entry, "marketId"),
                `${entryPath}.marketId`,
              );
              check.uint256(
                readField(entry, "minAssets"),
                `${entryPath}.minAssets`,
              );
            }
          }
        }
      }
    },
  };

  return check;
};

// ─── Limits ───────────────────────────────────────────────────────────────────

interface OperationSpec {
  /** Required 32-byte market ids. */
  readonly markets: readonly string[];
  /** Optional checksummed addresses. */
  readonly addresses: readonly string[];
  /** Optional uint256 fields. */
  readonly uints: readonly string[];
  /** Optional booleans. */
  readonly bools: readonly string[];
  /** Optional arrays of market ids. */
  readonly marketIdArrays: readonly string[];
  /** `expectedDeallocations` (VaultDeallocation[]). */
  readonly deallocations: boolean;
  /** `minSupplyAssetsByMarket` (MarketMinAssets[]). */
  readonly minSupplyByMarket: boolean;
}

const SPEC = (partial: Partial<OperationSpec>): OperationSpec => ({
  markets: [],
  addresses: [],
  uints: [],
  bools: [],
  marketIdArrays: [],
  deallocations: false,
  minSupplyByMarket: false,
  ...partial,
});

const OPERATION_SPECS: Readonly<Record<OperationType, OperationSpec>> = {
  blueSupply: SPEC({
    markets: ["marketId"],
    addresses: ["expectedOnBehalf"],
    uints: ["expectedAssets", "minSupplySharesMinted"],
  }),
  blueWithdraw: SPEC({
    markets: ["marketId"],
    addresses: ["expectedReceiver"],
    uints: ["minAssetsReceived", "maxSupplySharesBurned"],
    bools: ["expectedFullClose"],
  }),
  blueSupplyCollateral: SPEC({
    markets: ["marketId"],
    addresses: ["expectedOnBehalf"],
    uints: ["expectedAssets", "maxLtvAfterWad"],
  }),
  blueBorrow: SPEC({
    markets: ["marketId"],
    addresses: ["expectedReceiver"],
    uints: [
      "expectedAssets",
      "maxBorrowSharesMinted",
      "maxLtvAfterWad",
      "minHealthFactorAfterWad",
      "maxUtilizationAfterWad",
      "maxAfterBorrowApyWad",
      "maxReallocationPenaltyAssets",
    ],
  }),
  blueSupplyCollateralBorrow: SPEC({
    markets: ["marketId"],
    addresses: ["expectedOnBehalf", "expectedReceiver"],
    uints: [
      "expectedCollateralAssets",
      "expectedBorrowAssets",
      "maxBorrowSharesMinted",
      "maxLtvAfterWad",
      "minHealthFactorAfterWad",
      "maxUtilizationAfterWad",
      "maxAfterBorrowApyWad",
      "maxReallocationPenaltyAssets",
    ],
  }),
  blueRepay: SPEC({
    markets: ["marketId"],
    addresses: ["expectedOnBehalf"],
    uints: [
      "maxAssetsPaid",
      "minBorrowSharesBurned",
      "maxResidualBorrowShares",
      "minRefundAssets",
    ],
    bools: ["expectedFullClose"],
  }),
  blueWithdrawCollateral: SPEC({
    markets: ["marketId"],
    addresses: ["expectedReceiver"],
    uints: ["expectedAssets", "maxLtvAfterWad", "minHealthFactorAfterWad"],
  }),
  blueRepayWithdrawCollateral: SPEC({
    markets: ["marketId"],
    addresses: ["expectedOnBehalf", "expectedReceiver"],
    uints: [
      "expectedWithdrawAssets",
      "maxAssetsPaid",
      "minBorrowSharesBurned",
      "maxResidualBorrowShares",
      "minRefundAssets",
      "maxLtvAfterWad",
      "minHealthFactorAfterWad",
    ],
    bools: ["expectedFullClose"],
  }),
  blueRefinance: SPEC({
    markets: ["sourceMarketId", "targetMarketId"],
    uints: [
      "maxTargetBorrowAssets",
      "maxTargetBorrowSharesMinted",
      "maxSourceResidualBorrowShares",
      "maxTargetLtvAfterWad",
      "minTargetHealthFactorAfterWad",
      "maxLoanDustAssets",
      "maxReallocationPenaltyAssets",
    ],
  }),
  blueAuthorization: SPEC({
    addresses: ["authorized"],
    bools: ["expectedIsAuthorized"],
  }),
  vaultV1Deposit: SPEC({
    addresses: ["vault", "expectedReceiver"],
    uints: ["expectedAssets", "minSharesMinted"],
  }),
  vaultV2Deposit: SPEC({
    addresses: ["vault", "expectedReceiver"],
    uints: ["expectedAssets", "minSharesMinted"],
  }),
  vaultV1Withdraw: SPEC({
    addresses: ["vault", "expectedReceiver"],
    uints: ["expectedAssets", "maxSharesBurned"],
  }),
  vaultV2Withdraw: SPEC({
    addresses: ["vault", "expectedReceiver"],
    uints: ["expectedAssets", "maxSharesBurned"],
  }),
  vaultV1Redeem: SPEC({
    addresses: ["vault", "expectedReceiver"],
    uints: ["expectedShares", "minAssetsReceived"],
  }),
  vaultV2Redeem: SPEC({
    addresses: ["vault", "expectedReceiver"],
    uints: ["expectedShares", "minAssetsReceived"],
  }),
  vaultV2ForceWithdraw: SPEC({
    addresses: ["vault", "expectedAdapter"],
    uints: [
      "expectedExitAssets",
      "maxSharesBurned",
      "minAssetsReceived",
      "maxPenaltyAssets",
    ],
  }),
  vaultV2ForceRedeem: SPEC({
    addresses: ["vault", "expectedRecipient", "expectedOnBehalf"],
    uints: [
      "expectedShares",
      "minAssetsReceived",
      "maxPenaltyShares",
      "maxPenaltyAssets",
    ],
    deallocations: true,
  }),
  vaultV1InKindRedeem: SPEC({
    addresses: ["vault"],
    uints: [
      "expectedAssets",
      "maxSharesBurned",
      "minIdleAssetsReceived",
      "maxPenaltyAssets",
      "maxResidualShareAllowance",
    ],
    marketIdArrays: ["expectedMarketIds"],
    minSupplyByMarket: true,
  }),
  vaultV2InKindRedeem: SPEC({
    addresses: ["vault"],
    uints: [
      "expectedAssets",
      "maxSharesBurned",
      "minIdleAssetsReceived",
      "maxPenaltyAssets",
      "maxResidualShareAllowance",
    ],
    marketIdArrays: ["expectedMarketIds"],
    minSupplyByMarket: true,
  }),
  vaultV1MigrateToV2: SPEC({
    addresses: ["sourceVault", "targetVault", "expectedReceiver"],
    uints: ["expectedAssets", "expectedShares", "minTargetSharesMinted"],
  }),
};

// Required address/market fields are also declared above: a missing or invalid
// value reports the same way — the spec names the field, not optionality.
const REQUIRED_ADDRESSES: Readonly<Record<OperationType, readonly string[]>> = {
  blueSupply: [],
  blueWithdraw: [],
  blueSupplyCollateral: [],
  blueBorrow: [],
  blueSupplyCollateralBorrow: [],
  blueRepay: [],
  blueWithdrawCollateral: [],
  blueRepayWithdrawCollateral: [],
  blueRefinance: [],
  blueAuthorization: ["authorized"],
  vaultV1Deposit: ["vault"],
  vaultV2Deposit: ["vault"],
  vaultV1Withdraw: ["vault"],
  vaultV2Withdraw: ["vault"],
  vaultV1Redeem: ["vault"],
  vaultV2Redeem: ["vault"],
  vaultV2ForceWithdraw: ["vault"],
  vaultV2ForceRedeem: ["vault"],
  vaultV1InKindRedeem: ["vault"],
  vaultV2InKindRedeem: ["vault"],
  vaultV1MigrateToV2: ["sourceVault", "targetVault"],
};

/**
 * Parse and normalize raw `simulate` input into a {@link ParsedRequest}.
 *
 * The public types own the key shape; runtime validation checks values —
 * address and hex formats, uint256 ranges, typed-data field lists — and rejects
 * legacy `{type: "approval"}` / `{type: "signature"}` authorizations and Permit2
 * `PermitSingle` payloads rather than silently reinterpreting them. Cross-field
 * rules then pin a single owner: every transaction `from` and every
 * authorization owner must be the same checksummed address, typed-data domains
 * must bind to `chainId`, and `mode: "final"` rejects authorizations outright.
 *
 * @param input - Caller input (`VerifiedSimulateParams`-shaped).
 * @returns A deep-frozen, checksummed request: `mode` explicit (`"final"`
 *   default), `authorizations` always an array, `value` defaulted to `0n`.
 * @throws {SimulationValidationError} On any value or cross-field violation.
 * @internal
 */
export function parseRequest(input: VerifiedSimulateParams): ParsedRequest {
  const check = createChecks();
  const fieldErrors = check.errors;

  if (!isRecord(input)) {
    throw new SimulationValidationError("Invalid simulation input", [
      "input: must be a request object",
    ]);
  }

  // chainId
  const chainId = input.chainId;
  if (
    typeof chainId !== "number" ||
    !Number.isInteger(chainId) ||
    !Number.isSafeInteger(chainId) ||
    chainId <= 0
  ) {
    fieldErrors.push("chainId: must be a positive safe integer");
  }

  // transactions
  const rawTransactions = input.transactions;
  const transactions: ParsedTransaction[] = [];
  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    fieldErrors.push("transactions: must be a non-empty array");
  } else {
    for (const [i, tx] of rawTransactions.entries()) {
      const path = `transactions[${i}]`;
      if (!isRecord(tx)) {
        fieldErrors.push(`${path}: must be an object`);
        continue;
      }
      const from = check.address(readField(tx, "from"), `${path}.from`);
      const to = check.address(readField(tx, "to"), `${path}.to`);
      const data = check.hex(readField(tx, "data"), `${path}.data`);
      const rawValue = readField(tx, "value");
      const value =
        rawValue === undefined ? 0n : check.uint256(rawValue, `${path}.value`);
      if (from !== undefined && to !== undefined && data !== undefined) {
        transactions.push({ from, to, data, value: value ?? 0n });
      }
    }
  }

  // mode
  const rawMode = input.mode;
  let mode: SimulationMode = "final";
  if (rawMode !== undefined) {
    if (rawMode === "preview" || rawMode === "final") {
      mode = rawMode;
    } else {
      fieldErrors.push(
        `mode: must be "preview" or "final" (got ${String(rawMode)})`,
      );
    }
  }

  // blockNumber
  const rawBlockNumber = input.blockNumber;
  let blockNumber: bigint | BlockTag | undefined;
  if (rawBlockNumber !== undefined) {
    if (typeof rawBlockNumber === "bigint" && rawBlockNumber >= 0n) {
      blockNumber = rawBlockNumber;
    } else if (
      typeof rawBlockNumber === "string" &&
      (BLOCK_TAGS as readonly string[]).includes(rawBlockNumber)
    ) {
      blockNumber = rawBlockNumber as BlockTag;
    } else {
      fieldErrors.push(
        'blockNumber: must be a non-negative bigint or one of "latest", "earliest", "safe", "finalized"',
      );
    }
  }

  // authorizations
  const rawAuthorizations = input.authorizations;
  const authorizations: PendingAuthorization[] = [];
  if (rawAuthorizations !== undefined) {
    if (!Array.isArray(rawAuthorizations)) {
      fieldErrors.push("authorizations: must be an array");
    } else {
      if (mode === "final") {
        fieldErrors.push(
          "authorizations: are only accepted in preview mode; sign them and submit mode 'final' without authorizations",
        );
      }
      for (const [i, authorization] of rawAuthorizations.entries()) {
        const parsed = check.authorization(
          authorization,
          `authorizations[${i}]`,
        );
        if (parsed !== undefined) authorizations.push(parsed);
      }
    }
  }

  // limits
  const limits = input.limits;
  if (limits !== undefined) {
    if (!isRecord(limits)) {
      fieldErrors.push("limits: must be an object");
    } else {
      for (const field of [
        "maxSlippageWad",
        "minLltvBufferWad",
        "maxSignatureLifetimeSeconds",
      ] as const) {
        if (limits[field] !== undefined)
          check.uint256(limits[field], `limits.${field}`);
      }
      const operations = limits.operations;
      if (operations !== undefined) {
        if (!Array.isArray(operations)) {
          fieldErrors.push("limits.operations: must be an array");
        } else {
          for (const [i, operation] of operations.entries())
            check.operation(operation, `limits.operations[${i}]`);
        }
      }
    }
  }

  // ─── Cross-field rules ──────────────────────────────────────────────────

  const owner = transactions[0]?.from;
  if (owner !== undefined) {
    for (const [i, tx] of transactions.entries()) {
      if (!isAddressEqual(tx.from, owner)) {
        fieldErrors.push(
          `transactions[${i}].from: all transactions must share the same from address (expected ${owner}, got ${tx.from})`,
        );
      }
      if (isAddressEqual(tx.to, NATIVE_BALANCE_PROBE_ADDRESS)) {
        fieldErrors.push(
          `transactions[${i}].to: ${NATIVE_BALANCE_PROBE_ADDRESS} is reserved for the native-balance probe whose code is injected into the simulation; it cannot be a transaction target`,
        );
      }
    }
  }

  for (const [i, authorization] of authorizations.entries()) {
    const authorizationOwnerAddress =
      authorization.type === "erc20Approval"
        ? authorization.owner
        : authorization.type === "erc2612Permit"
          ? authorization.typedData.message.owner
          : authorization.type === "permit2SignatureTransfer"
            ? authorization.owner
            : authorization.type === "blueAuthorization"
              ? authorization.authorizer
              : authorization.typedData.message.authorizer;
    if (
      owner !== undefined &&
      !isAddressEqual(authorizationOwnerAddress, owner)
    ) {
      fieldErrors.push(
        `authorizations[${i}]: owner must equal the bundle sender ${owner} (got ${authorizationOwnerAddress})`,
      );
    }
    const domainChainId =
      authorization.type === "erc2612Permit" ||
      authorization.type === "permit2SignatureTransfer" ||
      authorization.type === "blueAuthorizationSignature"
        ? authorization.typedData.domain.chainId
        : undefined;
    if (
      domainChainId !== undefined &&
      typeof chainId === "number" &&
      BigInt(domainChainId) !== BigInt(chainId)
    ) {
      fieldErrors.push(
        `authorizations[${i}].typedData.domain.chainId: must equal the request chainId ${chainId} (got ${domainChainId})`,
      );
    }
  }

  if (isRecord(limits) && Array.isArray(limits.operations)) {
    for (const [i, operation] of limits.operations.entries()) {
      if (
        operation.transactionIndex !== undefined &&
        operation.transactionIndex >= rawTransactions.length
      ) {
        fieldErrors.push(
          `limits.operations[${i}].transactionIndex: ${operation.transactionIndex} is out of range for ${rawTransactions.length} transaction(s)`,
        );
      }
      if (
        operation.type === "vaultV1MigrateToV2" &&
        operation.expectedAssets !== undefined &&
        operation.expectedShares !== undefined
      ) {
        fieldErrors.push(
          `limits.operations[${i}]: set expectedAssets or expectedShares, not both`,
        );
      }
    }
  }

  try {
    // Validate tightening rules; the resolved value is carried by later stages.
    resolveEffectiveLimits(limits);
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

  return deepFreeze<ParsedRequest>({
    chainId: chainId as number,
    mode,
    transactions,
    authorizations: mode === "preview" ? authorizations : [],
    ...(blockNumber !== undefined ? { blockNumber } : {}),
    ...(isRecord(limits) ? { limits } : {}),
  });
}
