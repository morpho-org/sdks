import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
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
  zeroAddress,
} from "viem";
import type {
  Eip712Domain,
  Eip712Field,
  SimulationAuthorization,
} from "../../authorizations.js";
import { SimulationValidationError } from "../../errors.js";
import type {
  OperationLimit,
  OperationType,
  SimulationLimits,
  SlippageQuote,
} from "../../limits.js";
import {
  SIMULATION_MODES,
  type SimulateParams,
  type SimulationMode,
} from "../../params.js";

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
  readonly authorizations: readonly SimulationAuthorization[];
  readonly blockNumber?: bigint | Exclude<BlockTag, "pending">;
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
  keys(
    value: unknown,
    args: { readonly allow: readonly string[]; readonly path: string },
  ): void;
  domain(value: unknown, path: string): Eip712Domain | undefined;
  fields(args: {
    readonly actual: unknown;
    readonly expected: readonly {
      readonly name: string;
      readonly type: string;
    }[];
    readonly path: string;
  }): readonly Eip712Field[] | undefined;
  authorization(
    value: unknown,
    path: string,
  ): SimulationAuthorization | undefined;
  operation(value: unknown, path: string): OperationLimit | undefined;
}

const DOMAIN_KEYS = [
  "name",
  "version",
  "chainId",
  "verifyingContract",
  "salt",
] as const;
const TYPED_DATA_KEYS = ["domain", "primaryType", "types", "message"] as const;
const ERC2612_MESSAGE_KEYS = ERC2612_PERMIT_FIELDS.map((field) => field.name);
const PERMIT2_MESSAGE_KEYS = PERMIT2_TRANSFER_FIELDS.map((field) => field.name);
const PERMIT2_PERMITTED_KEYS = ["token", "amount"] as const;
const BLUE_AUTHORIZATION_MESSAGE_KEYS = BLUE_AUTHORIZATION_FIELDS.map(
  (field) => field.name,
);
const TRANSACTION_KEYS = ["from", "to", "data", "value"] as const;
const LIMITS_KEYS = ["operations"] as const;
const AUTHORIZATION_KEYS: Readonly<Record<string, readonly string[]>> = {
  erc20Approval: ["type", "token", "owner", "spender", "amount"],
  erc2612Permit: ["type", "typedData"],
  permit2SignatureTransfer: ["type", "owner", "typedData"],
  blueAuthorization: ["type", "authorizer", "authorized", "isAuthorized"],
  blueAuthorizationSignature: ["type", "typedData"],
};

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

    marketId: (value, path) => {
      const id = check.bytes32(value, path);
      return id === undefined ? undefined : (id as MarketId);
    },

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

    keys: (value, { allow, path }) => {
      if (!isRecord(value)) return;
      for (const key of Object.keys(value)) {
        if (!allow.includes(key)) errors.push(`${path}.${key}: unknown field`);
      }
    },

    domain: (domain, path) => {
      if (!isRecord(domain)) {
        errors.push(`${path}: must be an object`);
        return undefined;
      }
      check.keys(domain, {
        allow: DOMAIN_KEYS,
        path,
      });
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
      const verifyingContract = check.address(
        readField(domain, "verifyingContract"),
        `${path}.verifyingContract`,
      );
      const rawSalt = readField(domain, "salt");
      const salt =
        rawSalt !== undefined
          ? check.bytes32(rawSalt, `${path}.salt`)
          : undefined;
      if (!validChainId || verifyingContract === undefined) return undefined;
      return {
        ...(typeof name === "string" ? { name } : {}),
        ...(typeof version === "string" ? { version } : {}),
        chainId: chainId as number | bigint,
        verifyingContract,
        ...(salt !== undefined ? { salt } : {}),
      };
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
      if (!equal) {
        errors.push(
          `${path}: must list exactly ${expected.map((f) => `${f.name}: ${f.type}`).join(", ")}`,
        );
        return undefined;
      }
      return fields;
    },

    authorization: (authorization, path) => {
      const type = isRecord(authorization)
        ? readField(authorization, "type")
        : undefined;
      if (!isRecord(authorization) || typeof type !== "string") {
        errors.push(`${path}.type: must name an authorization type`);
        return undefined;
      }
      if (!Object.hasOwn(AUTHORIZATION_KEYS, type)) {
        errors.push(`${path}.type: unsupported authorization type "${type}"`);
        return undefined;
      }
      check.keys(authorization, { allow: AUTHORIZATION_KEYS[type]!, path });
      const errorsBefore = errors.length;
      switch (type) {
        case "erc20Approval": {
          const token = check.address(
            readField(authorization, "token"),
            `${path}.token`,
          );
          const owner = check.address(
            readField(authorization, "owner"),
            `${path}.owner`,
          );
          const spender = check.address(
            readField(authorization, "spender"),
            `${path}.spender`,
          );
          const amount = check.uint256(
            readField(authorization, "amount"),
            `${path}.amount`,
          );
          if (
            token === undefined ||
            owner === undefined ||
            spender === undefined ||
            amount === undefined
          )
            return undefined;
          return { type: "erc20Approval", token, owner, spender, amount };
        }
        case "erc2612Permit": {
          const envelope = typedDataEnvelope({
            value: readField(authorization, "typedData"),
            path,
            primaryType: "Permit",
            fields: ERC2612_PERMIT_FIELDS,
          });
          if (envelope === undefined) return undefined;
          const { domain, message, fields: permitFields } = envelope;
          const messagePath = `${path}.typedData.message`;
          check.keys(message, {
            allow: ERC2612_MESSAGE_KEYS,
            path: messagePath,
          });
          const owner = check.address(
            readField(message, "owner"),
            `${messagePath}.owner`,
          );
          const spender = check.address(
            readField(message, "spender"),
            `${messagePath}.spender`,
          );
          const value = check.uint256(
            readField(message, "value"),
            `${messagePath}.value`,
          );
          const nonce = check.uint256(
            readField(message, "nonce"),
            `${messagePath}.nonce`,
          );
          const deadline = check.uint256(
            readField(message, "deadline"),
            `${messagePath}.deadline`,
          );
          if (
            errors.length !== errorsBefore ||
            domain === undefined ||
            owner === undefined ||
            spender === undefined ||
            value === undefined ||
            nonce === undefined ||
            deadline === undefined ||
            permitFields === undefined
          )
            return undefined;
          return {
            type: "erc2612Permit",
            typedData: {
              domain,
              primaryType: "Permit",
              types: {
                Permit: copyFields(permitFields),
              },
              message: { owner, spender, value, nonce, deadline },
            },
          };
        }
        case "permit2SignatureTransfer": {
          const owner = check.address(
            readField(authorization, "owner"),
            `${path}.owner`,
          );
          const envelope = typedDataEnvelope({
            value: readField(authorization, "typedData"),
            path,
            primaryType: "PermitTransferFrom",
            fields: PERMIT2_TRANSFER_FIELDS,
            messageError: "must carry permitted token and amount",
          });
          if (envelope === undefined) return undefined;
          const { domain, message, fields: transferFields } = envelope;
          const rawTypedData = readField(authorization, "typedData");
          const types = isRecord(rawTypedData)
            ? readField(rawTypedData, "types")
            : undefined;
          const permissionFields = isRecord(types)
            ? readField(types, "TokenPermissions")
            : undefined;
          const checkedPermissionFields = check.fields({
            actual: permissionFields,
            expected: PERMIT2_TOKEN_PERMISSIONS_FIELDS,
            path: `${path}.typedData.types.TokenPermissions`,
          });
          const permitted = readField(message, "permitted");
          if (!isRecord(permitted)) {
            errors.push(
              `${path}.typedData.message: must carry permitted token and amount`,
            );
            return undefined;
          }
          const messagePath = `${path}.typedData.message`;
          check.keys(message, {
            allow: PERMIT2_MESSAGE_KEYS,
            path: messagePath,
          });
          check.keys(permitted, {
            allow: PERMIT2_PERMITTED_KEYS,
            path: `${messagePath}.permitted`,
          });
          const permittedToken = check.address(
            readField(permitted, "token"),
            `${messagePath}.permitted.token`,
          );
          const permittedAmount = check.uint256(
            readField(permitted, "amount"),
            `${messagePath}.permitted.amount`,
          );
          const spender = check.address(
            readField(message, "spender"),
            `${messagePath}.spender`,
          );
          const nonce = check.uint256(
            readField(message, "nonce"),
            `${messagePath}.nonce`,
          );
          const deadline = check.uint256(
            readField(message, "deadline"),
            `${messagePath}.deadline`,
          );
          if (
            errors.length !== errorsBefore ||
            domain === undefined ||
            owner === undefined ||
            permittedToken === undefined ||
            permittedAmount === undefined ||
            spender === undefined ||
            nonce === undefined ||
            deadline === undefined ||
            transferFields === undefined ||
            checkedPermissionFields === undefined
          )
            return undefined;
          return {
            type: "permit2SignatureTransfer",
            owner,
            typedData: {
              domain,
              primaryType: "PermitTransferFrom",
              types: {
                PermitTransferFrom: copyFields(transferFields),
                TokenPermissions: copyFields(checkedPermissionFields),
              },
              message: {
                permitted: {
                  token: permittedToken,
                  amount: permittedAmount,
                },
                spender,
                nonce,
                deadline,
              },
            },
          };
        }
        case "blueAuthorization": {
          const authorizer = check.address(
            readField(authorization, "authorizer"),
            `${path}.authorizer`,
          );
          const authorized = check.address(
            readField(authorization, "authorized"),
            `${path}.authorized`,
          );
          const isAuthorized = check.bool(
            readField(authorization, "isAuthorized"),
            `${path}.isAuthorized`,
          );
          if (
            authorizer === undefined ||
            authorized === undefined ||
            isAuthorized === undefined
          )
            return undefined;
          return {
            type: "blueAuthorization",
            authorizer,
            authorized,
            isAuthorized,
          };
        }
        case "blueAuthorizationSignature": {
          const envelope = typedDataEnvelope({
            value: readField(authorization, "typedData"),
            path,
            primaryType: "Authorization",
            fields: BLUE_AUTHORIZATION_FIELDS,
          });
          if (envelope === undefined) return undefined;
          const { domain, message, fields: authorizationFields } = envelope;
          const messagePath = `${path}.typedData.message`;
          check.keys(message, {
            allow: BLUE_AUTHORIZATION_MESSAGE_KEYS,
            path: messagePath,
          });
          const authorizer = check.address(
            readField(message, "authorizer"),
            `${messagePath}.authorizer`,
          );
          const authorized = check.address(
            readField(message, "authorized"),
            `${messagePath}.authorized`,
          );
          const isAuthorized = check.bool(
            readField(message, "isAuthorized"),
            `${messagePath}.isAuthorized`,
          );
          const nonce = check.uint256(
            readField(message, "nonce"),
            `${messagePath}.nonce`,
          );
          const deadline = check.uint256(
            readField(message, "deadline"),
            `${messagePath}.deadline`,
          );
          if (
            errors.length !== errorsBefore ||
            domain === undefined ||
            authorizer === undefined ||
            authorized === undefined ||
            isAuthorized === undefined ||
            nonce === undefined ||
            deadline === undefined ||
            authorizationFields === undefined
          )
            return undefined;
          return {
            type: "blueAuthorizationSignature",
            typedData: {
              domain,
              primaryType: "Authorization",
              types: {
                Authorization: copyFields(authorizationFields),
              },
              message: {
                authorizer,
                authorized,
                isAuthorized,
                nonce,
                deadline,
              },
            },
          };
        }
        default:
          errors.push(`${path}.type: unsupported authorization type "${type}"`);
          return undefined;
      }
    },

    operation: (operation, path) => {
      const type = isRecord(operation)
        ? readField(operation, "type")
        : undefined;
      if (
        !isRecord(operation) ||
        typeof type !== "string" ||
        !Object.hasOwn(OPERATION_SPECS, type)
      ) {
        errors.push(
          `${path}.type: unsupported operation type "${String(type)}"`,
        );
        return undefined;
      }
      const spec = OPERATION_SPECS[type as OperationType];
      const requiredAddresses = new Set(spec.requiredAddresses);
      check.keys(operation, {
        allow: [
          "type",
          ...spec.markets,
          ...spec.addresses,
          "quote",
          "slippageTolerance",
        ],
        path,
      });
      const errorsBefore = errors.length;
      const out = { type } as OperationLimit;
      for (const field of spec.markets) {
        const value = check.marketId(
          readField(operation, field),
          `${path}.${field}`,
        );
        if (value !== undefined) Reflect.set(out, field, value);
      }
      for (const field of spec.addresses) {
        const raw = readField(operation, field);
        if (raw === undefined && !requiredAddresses.has(field)) continue;
        const value = check.address(raw, `${path}.${field}`);
        if (value !== undefined) Reflect.set(out, field, value);
      }
      const tolerance = check.uint256(
        readField(operation, "slippageTolerance"),
        `${path}.slippageTolerance`,
      );
      if (tolerance !== undefined) {
        if (tolerance > MathLib.WAD)
          errors.push(`${path}.slippageTolerance: must not exceed 100% (1e18)`);
        Reflect.set(out, "slippageTolerance", tolerance);
      }
      const quote = readField(operation, "quote");
      if (!isRecord(quote)) {
        errors.push(
          `${path}.quote: must be an object containing at least one quoted amount`,
        );
      } else {
        check.keys(quote, { allow: QUOTE_FIELDS, path: `${path}.quote` });
        const normalizedQuote: Record<string, bigint> = {};
        for (const field of QUOTE_FIELDS) {
          const raw = readField(quote, field);
          if (raw === undefined) continue;
          const value = check.uint256(raw, `${path}.quote.${field}`);
          if (value !== undefined) normalizedQuote[field] = value;
        }
        if (Object.keys(normalizedQuote).length === 0)
          errors.push(`${path}.quote: supply at least one quoted amount`);
        if (
          type === "blueSupplyCollateral" ||
          type === "blueWithdrawCollateral"
        ) {
          for (const field of ["sharesMinted", "sharesBurned"] as const) {
            if (normalizedQuote[field] !== undefined)
              errors.push(
                `${path}.quote.${field}: cannot be measured for "${type}"`,
              );
          }
        }
        Reflect.set(out, "quote", normalizedQuote);
      }
      return errors.length === errorsBefore ? out : undefined;
    },
  };
  const copyFields = (fields: readonly Eip712Field[]): Eip712Field[] =>
    fields.map(({ name, type: fieldType }) => ({ name, type: fieldType }));

  /** Shared typed-data envelope guard: domain, primaryType, primary field list
   * and message record; message-specific checks stay in each branch. */
  const typedDataEnvelope = (options: {
    value: unknown;
    path: string;
    primaryType: string;
    fields: readonly Eip712Field[];
    messageError?: string;
  }):
    | {
        domain: Eip712Domain | undefined;
        message: object;
        fields: readonly Eip712Field[] | undefined;
      }
    | undefined => {
    const typedDataPath = `${options.path}.typedData`;
    const value = options.value;
    if (!isRecord(value)) {
      errors.push(`${typedDataPath}: must be an object`);
      return undefined;
    }
    check.keys(value, { allow: TYPED_DATA_KEYS, path: typedDataPath });
    const domain = check.domain(
      readField(value, "domain"),
      `${typedDataPath}.domain`,
    );
    if (readField(value, "primaryType") !== options.primaryType)
      errors.push(
        `${typedDataPath}.primaryType: must be "${options.primaryType}" (got ${String(readField(value, "primaryType"))})`,
      );
    const types = readField(value, "types");
    const fields = isRecord(types)
      ? readField(types, options.primaryType)
      : undefined;
    const checkedFields = check.fields({
      actual: fields,
      expected: options.fields,
      path: `${typedDataPath}.types.${options.primaryType}`,
    });
    const message = readField(value, "message");
    if (!isRecord(message)) {
      errors.push(
        `${typedDataPath}.message: ${options.messageError ?? "must be an object"}`,
      );
      return undefined;
    }
    return { domain, message, fields: checkedFields };
  };

  return check;
};

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Union of every field name carried by any {@link OperationLimit} variant. */
type LimitKey<L = OperationLimit> = L extends unknown ? keyof L : never;

const QUOTE_FIELDS = [
  "assetsReceived",
  "sharesMinted",
  "assetsPaid",
  "sharesBurned",
] as const satisfies readonly (keyof SlippageQuote)[];
const MARKET_SUBJECT = {
  markets: ["marketId"],
  addresses: ["account", "receiver", "assetPaid", "assetReceived"],
  requiredAddresses: [],
} as const satisfies {
  readonly markets: readonly LimitKey[];
  readonly addresses: readonly LimitKey[];
  readonly requiredAddresses: readonly LimitKey[];
};
const VAULT_SUBJECT = {
  markets: [],
  addresses: ["vault", "account", "receiver", "assetPaid", "assetReceived"],
  requiredAddresses: ["vault"],
} as const satisfies {
  readonly markets: readonly LimitKey[];
  readonly addresses: readonly LimitKey[];
  readonly requiredAddresses: readonly LimitKey[];
};
const OPERATION_SPECS: Record<
  OperationType,
  {
    readonly markets: readonly LimitKey[];
    readonly addresses: readonly LimitKey[];
    readonly requiredAddresses: readonly LimitKey[];
  }
> = {
  blueSupply: MARKET_SUBJECT,
  blueWithdraw: MARKET_SUBJECT,
  blueSupplyCollateral: MARKET_SUBJECT,
  blueBorrow: MARKET_SUBJECT,
  blueSupplyCollateralBorrow: MARKET_SUBJECT,
  blueRepay: MARKET_SUBJECT,
  blueWithdrawCollateral: MARKET_SUBJECT,
  blueRepayWithdrawCollateral: MARKET_SUBJECT,
  blueRefinance: {
    ...MARKET_SUBJECT,
    markets: ["sourceMarketId", "targetMarketId"],
  },
  vaultV1Deposit: VAULT_SUBJECT,
  vaultV2Deposit: VAULT_SUBJECT,
  vaultV1Withdraw: VAULT_SUBJECT,
  vaultV2Withdraw: VAULT_SUBJECT,
  vaultV1Redeem: VAULT_SUBJECT,
  vaultV2Redeem: VAULT_SUBJECT,
  vaultV2ForceWithdraw: VAULT_SUBJECT,
  vaultV2ForceRedeem: VAULT_SUBJECT,
  vaultV1InKindRedeem: VAULT_SUBJECT,
  vaultV2InKindRedeem: VAULT_SUBJECT,
  vaultV1MigrateToV2: {
    markets: [],
    addresses: [
      "sourceVault",
      "targetVault",
      "account",
      "receiver",
      "assetPaid",
      "assetReceived",
    ],
    requiredAddresses: ["sourceVault", "targetVault"],
  },
};

/**
 * Parse and normalize raw `simulate` input into a {@link ParsedRequest}.
 *
 * The public types own the key shape; runtime validation rejects unknown keys
 * (`<path>.<key>: unknown field`), checks values — address and hex formats,
 * uint256 ranges, typed-data field lists — and rejects legacy `{type: "approval"}` / `{type: "signature"}` authorizations and Permit2
 * `PermitSingle` payloads rather than silently reinterpreting them. Cross-field
 * rules then pin a single owner: every transaction `from` and every
 * authorization owner must be the same checksummed address, typed-data domains
 * must bind to `chainId`, and `mode: "final"` rejects authorizations outright.
 *
 * @param input - Caller input (`SimulateParams`-shaped).
 * @returns A deep-frozen, checksummed request: `mode` explicit (`"final"`
 *   default), `authorizations` always an array, `value` defaulted to `0n`.
 * @throws {SimulationValidationError} On any unknown key, value or cross-field
 *   violation.
 * @internal
 */
export function parseRequest(input: SimulateParams): ParsedRequest {
  const check = createChecks();
  const fieldErrors = check.errors;

  if (!isRecord(input)) {
    throw new SimulationValidationError("Invalid simulation input", [
      "input: must be a request object",
    ]);
  }
  check.keys(input, {
    allow: [
      "chainId",
      "transactions",
      "blockNumber",
      "mode",
      "authorizations",
      "limits",
    ],
    path: "input",
  });

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
  // Raw index of each accepted transaction, so cross-field errors name the
  // caller's index rather than the filtered position.
  const transactionIndices: number[] = [];
  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    fieldErrors.push("transactions: must be a non-empty array");
  } else {
    for (const [i, tx] of rawTransactions.entries()) {
      const path = `transactions[${i}]`;
      if (!isRecord(tx)) {
        fieldErrors.push(`${path}: must be an object`);
        continue;
      }
      check.keys(tx, {
        allow: TRANSACTION_KEYS,
        path,
      });
      const from = check.address(readField(tx, "from"), `${path}.from`);
      const to = check.address(readField(tx, "to"), `${path}.to`);
      if (from !== undefined && isAddressEqual(from, zeroAddress)) {
        fieldErrors.push(`${path}.from: must be a non-zero address`);
      }
      if (to !== undefined && isAddressEqual(to, zeroAddress)) {
        fieldErrors.push(`${path}.to: must be a non-zero address`);
      }
      const data = check.hex(readField(tx, "data"), `${path}.data`);
      const rawValue = readField(tx, "value");
      const value =
        rawValue === undefined ? 0n : check.uint256(rawValue, `${path}.value`);
      if (from !== undefined && to !== undefined && data !== undefined) {
        transactions.push({ from, to, data, value: value ?? 0n });
        transactionIndices.push(i);
      }
    }
  }

  // mode
  const rawMode = input.mode;
  let mode: SimulationMode = "final";
  if (rawMode !== undefined) {
    const found = SIMULATION_MODES.find((m) => m === rawMode);
    if (found !== undefined) {
      mode = found;
    } else {
      fieldErrors.push(
        `mode: must be one of ${SIMULATION_MODES.map((m) => `"${m}"`).join(", ")} (got ${String(rawMode)})`,
      );
    }
  }

  // blockNumber
  const rawBlockNumber = input.blockNumber;
  let blockNumber: bigint | Exclude<BlockTag, "pending"> | undefined;
  if (rawBlockNumber !== undefined) {
    if (typeof rawBlockNumber === "bigint" && rawBlockNumber >= 0n) {
      blockNumber = rawBlockNumber;
    } else {
      const tag =
        typeof rawBlockNumber === "string"
          ? BLOCK_TAGS.find((t) => t === rawBlockNumber)
          : undefined;
      if (tag !== undefined) {
        blockNumber = tag;
      } else {
        fieldErrors.push(
          `blockNumber: must be a non-negative bigint or one of ${BLOCK_TAGS.map((t) => `"${t}"`).join(", ")}`,
        );
      }
    }
  }

  // authorizations
  const rawAuthorizations = input.authorizations;
  const authorizations: SimulationAuthorization[] = [];
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
  const operations: OperationLimit[] = [];
  let normalizedLimits: SimulationLimits | undefined;
  if (limits !== undefined) {
    if (!isRecord(limits)) {
      fieldErrors.push("limits: must be an object");
    } else {
      check.keys(limits, { allow: LIMITS_KEYS, path: "limits" });
      const rawOperations = readField(limits, "operations");
      if (rawOperations !== undefined) {
        if (!Array.isArray(rawOperations)) {
          fieldErrors.push("limits.operations: must be an array");
        } else {
          for (const [i, operation] of rawOperations.entries()) {
            const parsedOperation = check.operation(
              operation,
              `limits.operations[${i}]`,
            );
            if (parsedOperation !== undefined) operations.push(parsedOperation);
          }
        }
      }
      normalizedLimits = {
        ...(Array.isArray(rawOperations) ? { operations } : {}),
      };
    }
  }

  // ─── Cross-field rules ──────────────────────────────────────────────────

  const owner = transactions[0]?.from;
  if (owner !== undefined) {
    for (const [i, tx] of transactions.entries()) {
      if (!isAddressEqual(tx.from, owner)) {
        fieldErrors.push(
          `transactions[${transactionIndices[i]}].from: all transactions must share the same from address (expected ${owner}, got ${tx.from})`,
        );
      }
    }
  }

  for (const [i, authorization] of authorizations.entries()) {
    const { owner: authorizationOwnerAddress, domainChainId } = (() => {
      switch (authorization.type) {
        case "erc20Approval":
          return { owner: authorization.owner, domainChainId: undefined };
        case "permit2SignatureTransfer":
          return {
            owner: authorization.owner,
            domainChainId: authorization.typedData.domain.chainId,
          };
        case "erc2612Permit":
          return {
            owner: authorization.typedData.message.owner,
            domainChainId: authorization.typedData.domain.chainId,
          };
        case "blueAuthorization":
          return { owner: authorization.authorizer, domainChainId: undefined };
        case "blueAuthorizationSignature":
          return {
            owner: authorization.typedData.message.authorizer,
            domainChainId: authorization.typedData.domain.chainId,
          };
        default: {
          const _exhaustive: never = authorization;
          return _exhaustive;
        }
      }
    })();
    if (
      owner !== undefined &&
      !isAddressEqual(authorizationOwnerAddress, owner)
    ) {
      fieldErrors.push(
        `authorizations[${i}]: owner must equal the bundle sender ${owner} (got ${authorizationOwnerAddress})`,
      );
    }
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
    ...(normalizedLimits !== undefined ? { limits: normalizedLimits } : {}),
  });
}
