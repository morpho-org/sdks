import { UnsupportedChainIdError } from "@morpho-org/blue-sdk";
import type {
  ActionRequirement,
  AuthorizationAction,
  BlueAuthorizationAction,
  ERC20ApprovalAction,
  Permit2SignatureTransferAction,
  PermitAction,
  Transaction,
} from "@morpho-org/morpho-sdk";
import {
  isRequirementApproval,
  isRequirementBlueAuthorization,
  isRequirementSignature,
} from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try, isDefined } from "@morpho-org/morpho-ts";
import {
  type Address,
  type DecodeFunctionDataReturnType,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  isHex,
} from "viem";
import type {
  BlueAuthorizationTypedData,
  Eip712Domain,
  Erc2612PermitTypedData,
  PendingAuthorization,
  Permit2TransferTypedData,
} from "../authorizations.js";
import {
  AuthorizationRequestMismatchError,
  type SimulationErrorContext,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "../errors.js";
import type { SimulationMode } from "../params.js";
import type { PreLiquidationBinding } from "./operations.js";

type Fail = (message: string, options?: ErrorOptions) => never;

interface Ctx {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly blockNumber: bigint;
  readonly owner: Address;
  readonly index: number;
  readonly addresses: ReturnType<typeof getChainAddresses>;
  readonly preLiquidations: readonly PreLiquidationBinding[];
}

/**
 * Registered bundles contracts an approval or token permit may name as spender.
 * Canonical Permit2 is added for `approve` calldata (the Permit2 prerequisite
 * allowance), not for signed transfers — the signed transfer's spender is the
 * bundles contract itself.
 */
const bundlesSpenders = (ctx: Ctx): readonly Address[] =>
  [
    ctx.addresses.bundles?.blueBundlesV1,
    ctx.addresses.bundles?.vaultBundlesV1,
    ctx.addresses.bundles?.vaultExitBundlesV1,
  ].filter(isDefined);

/**
 * Spenders a Permit2 `PermitTransferFrom` may name: Blue and Vault bundles.
 * VaultExitBundlesV1 takes share permits, not Permit2 transfers.
 */
const permit2Spenders = (ctx: Ctx): readonly Address[] =>
  [
    ctx.addresses.bundles?.blueBundlesV1,
    ctx.addresses.bundles?.vaultBundlesV1,
  ].filter(isDefined);

const failUnlessRegistered = (spec: {
  readonly fail: Fail;
  readonly field: string;
  readonly observed: Address;
  readonly allowed: readonly Address[];
}) => {
  if (!spec.allowed.some((allowed) => isAddressEqual(allowed, spec.observed))) {
    spec.fail(
      `${spec.field} expected one of "${spec.allowed.join('", "')}", got "${spec.observed}". Rebuild the requirement against the chain registry`,
    );
  }
};

/** Whether the address names a Midnight deployment; Midnight requirements are unsupported. */
const isMidnight = (ctx: Ctx, address: Address): boolean =>
  [ctx.addresses.midnight, ctx.addresses.midnightBundles]
    .filter(isDefined)
    .some((midnight) => isAddressEqual(midnight, address));

/**
 * Operators a Morpho authorization may bind: the registered BlueBundlesV1 or a
 * bound pre-liquidation contract, mirroring `decodeOperations`' morpho route.
 */
const authorizationOperators = (ctx: Ctx): readonly Address[] => [
  ...(isDefined(ctx.addresses.bundles?.blueBundlesV1)
    ? [ctx.addresses.bundles.blueBundlesV1]
    : []),
  ...ctx.preLiquidations.map((binding) => binding.address),
];

const authorizationContext = (ctx: Ctx): SimulationErrorContext => ({
  stage: "preparation",
  chainId: ctx.chainId,
  mode: ctx.mode,
  blockNumber: ctx.blockNumber,
  authorizationIndex: ctx.index,
});

const mismatch =
  (ctx: Ctx): Fail =>
  (message, options) => {
    throw new AuthorizationRequestMismatchError(
      `${message}. Rebuild the wallet request from getRequirements()`,
      { context: authorizationContext(ctx), ...options },
    );
  };

const unsupported =
  (ctx: Ctx): Fail =>
  (message, options) => {
    throw new UnsupportedOperationError(message, {
      context: authorizationContext(ctx),
      ...options,
    });
  };

const describeValue = (value: unknown): string =>
  typeof value === "bigint"
    ? `"${value}"`
    : typeof value === "string"
      ? `"${value}"`
      : typeof value === "object" && value !== null
        ? "an object"
        : typeof value;

/** Runtime validators for loosely typed EIP-712 payloads, all failing through `fail`. */
const validators = (fail: Fail) => ({
  record(value: unknown, field: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      fail(
        `Typed data ${field} expected an object, got ${describeValue(value)}`,
      );
    }
    return value as Record<string, unknown>;
  },
  address(value: unknown, field: string): Address {
    if (typeof value !== "string" || !isAddress(value)) {
      fail(
        `Typed data ${field} expected an address, got ${describeValue(value)}`,
      );
    }
    return getAddress(value);
  },
  bigint(value: unknown, field: string): bigint {
    if (typeof value !== "bigint") {
      fail(
        `Typed data ${field} expected a bigint, got ${describeValue(value)}`,
      );
    }
    return value;
  },
  boolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
      fail(
        `Typed data ${field} expected a boolean, got ${describeValue(value)}`,
      );
    }
    return value;
  },
  optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      fail(
        `Typed data ${field} expected a string, got ${describeValue(value)}`,
      );
    }
    return value;
  },
  typesTuple(
    value: unknown,
    spec: {
      readonly field: string;
      readonly expected: readonly {
        readonly name: string;
        readonly type: string;
      }[];
    },
  ): void {
    const { field, expected } = spec;
    if (!Array.isArray(value)) {
      fail(
        `Typed data ${field} expected an array, got ${describeValue(value)}`,
      );
    }
    if (value.length !== expected.length) {
      fail(
        `Typed data ${field} expected "${expected.length}" fields, got "${value.length}"`,
      );
    }
    for (const [index, field_] of expected.entries()) {
      const entry = this.record(value[index], `${field}[${index}]`);
      if (entry.name !== field_.name || entry.type !== field_.type) {
        fail(
          `Typed data ${field}[${index}] expected "${field_.name} ${field_.type}", got "${describeValue(entry.name)} ${describeValue(entry.type)}"`,
        );
      }
    }
  },
  equalAddress(
    actual: Address,
    spec: { readonly expected: Address; readonly field: string },
  ): void {
    if (!isAddressEqual(actual, spec.expected)) {
      fail(
        `Authorization ${spec.field} expected "${spec.expected}", got "${actual}"`,
      );
    }
  },
  equalBigint(
    actual: bigint,
    spec: { readonly expected: bigint; readonly field: string },
  ): void {
    if (actual !== spec.expected) {
      fail(
        `Authorization ${spec.field} expected "${spec.expected}", got "${actual}"`,
      );
    }
  },
  equalBoolean(
    actual: boolean,
    spec: { readonly expected: boolean; readonly field: string },
  ): void {
    if (actual !== spec.expected) {
      fail(
        `Authorization ${spec.field} expected "${spec.expected}", got "${actual}"`,
      );
    }
  },
  exactTypes(
    types: Record<string, unknown>,
    expected: readonly string[],
  ): void {
    const keys = Object.keys(types);
    if (
      keys.length !== expected.length ||
      !expected.every((name) => keys.includes(name))
    ) {
      fail(
        `Typed data types expected exactly "${expected.join('", "')}", got "${keys.join('", "')}"`,
      );
    }
  },
  domainChainId(actual: number | bigint, expected: number): void {
    if (Number(actual) !== expected) {
      fail(`Typed data domain.chainId expected "${expected}", got "${actual}"`);
    }
  },
  primaryType(actual: unknown, expected: string): void {
    if (actual !== expected) {
      fail(
        `Typed data primaryType expected "${expected}", got ${describeValue(actual)}`,
      );
    }
  },
});

const parseDomain = (value: unknown, fail: Fail): Eip712Domain => {
  const v = validators(fail);
  const domain = v.record(value, "domain");

  const chainId = domain.chainId;
  if (typeof chainId !== "number" && typeof chainId !== "bigint") {
    fail(
      `Typed data domain.chainId expected a number or bigint, got ${describeValue(chainId)}`,
    );
  }

  const salt = domain.salt;
  if (salt !== undefined && (typeof salt !== "string" || !isHex(salt))) {
    fail(
      `Typed data domain.salt expected a hex string, got ${describeValue(salt)}`,
    );
  }

  const name = v.optionalString(domain.name, "domain.name");
  const version = v.optionalString(domain.version, "domain.version");

  return {
    ...(name === undefined ? {} : { name }),
    ...(version === undefined ? {} : { version }),
    chainId,
    verifyingContract: v.address(
      domain.verifyingContract,
      "domain.verifyingContract",
    ),
    ...(salt === undefined ? {} : { salt }),
  };
};

const ERC2612_PERMIT_FIELDS = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

const PERMIT2_TRANSFER_FROM_FIELDS = [
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

const toErc2612Permit = (
  action: PermitAction,
  ctx: Ctx,
): PendingAuthorization => {
  const { owner } = ctx;
  const domain = parseDomain(action.typedData?.domain, mismatch(ctx));
  const fail = mismatch(ctx);
  const v = validators(fail);
  v.domainChainId(domain.chainId, ctx.chainId);

  const typedData = action.typedData;
  v.primaryType(typedData?.primaryType, "Permit");
  const types = v.record(typedData?.types, "types");
  v.exactTypes(types, ["Permit"]);
  v.typesTuple(types.Permit, {
    field: "types.Permit",
    expected: ERC2612_PERMIT_FIELDS,
  });
  const message = v.record(typedData?.message, "message");

  const messageOwner = v.address(message.owner, "message.owner");
  const spender = v.address(message.spender, "message.spender");
  const value = v.bigint(message.value, "message.value");
  const nonce = v.bigint(message.nonce, "message.nonce");
  const deadline = v.bigint(message.deadline, "message.deadline");

  v.equalAddress(messageOwner, { expected: owner, field: "message.owner" });
  v.equalAddress(spender, {
    expected: action.args.spender,
    field: "message.spender",
  });
  failUnlessRegistered({
    fail,
    field: "message.spender",
    observed: spender,
    allowed: bundlesSpenders(ctx),
  });
  v.equalBigint(value, {
    expected: action.args.amount,
    field: "message.value",
  });
  v.equalBigint(deadline, {
    expected: action.args.deadline,
    field: "message.deadline",
  });
  if (action.args.nonce != null) {
    v.equalBigint(nonce, {
      expected: action.args.nonce,
      field: "message.nonce",
    });
  }

  const parsed: Erc2612PermitTypedData = {
    domain,
    primaryType: "Permit",
    types: { Permit: ERC2612_PERMIT_FIELDS },
    message: {
      owner: messageOwner,
      spender,
      value,
      nonce,
      deadline,
    },
  };
  return { type: "erc2612Permit", typedData: parsed };
};

const toPermit2SignatureTransfer = (
  action: Permit2SignatureTransferAction,
  ctx: Ctx,
): PendingAuthorization => {
  const { owner } = ctx;
  const fail = mismatch(ctx);
  const v = validators(fail);
  const typedData = action.typedData;
  v.primaryType(typedData?.primaryType, "PermitTransferFrom");
  const types = v.record(typedData?.types, "types");
  v.exactTypes(types, ["PermitTransferFrom", "TokenPermissions"]);
  v.typesTuple(types.PermitTransferFrom, {
    field: "types.PermitTransferFrom",
    expected: PERMIT2_TRANSFER_FROM_FIELDS,
  });
  v.typesTuple(types.TokenPermissions, {
    field: "types.TokenPermissions",
    expected: PERMIT2_TOKEN_PERMISSIONS_FIELDS,
  });
  const domain = parseDomain(typedData?.domain, fail);
  v.domainChainId(domain.chainId, ctx.chainId);
  const permit2 = ctx.addresses.permit2;
  if (permit2 == null || !isAddressEqual(domain.verifyingContract, permit2)) {
    fail(
      `Typed data domain.verifyingContract expected the chain's canonical Permit2 "${permit2 ?? "unregistered"}", got "${domain.verifyingContract}"`,
    );
  }
  const message = v.record(typedData?.message, "message");
  const permitted = v.record(message.permitted, "message.permitted");
  const token = v.address(permitted.token, "message.permitted.token");

  const amount = v.bigint(permitted.amount, "message.permitted.amount");
  const spender = v.address(message.spender, "message.spender");
  const nonce = v.bigint(message.nonce, "message.nonce");
  const deadline = v.bigint(message.deadline, "message.deadline");

  v.equalAddress(spender, {
    expected: action.args.spender,
    field: "message.spender",
  });
  failUnlessRegistered({
    fail,
    field: "message.spender",
    observed: spender,
    allowed: permit2Spenders(ctx),
  });
  v.equalBigint(amount, {
    expected: action.args.amount,
    field: "message.permitted.amount",
  });
  v.equalBigint(nonce, { expected: action.args.nonce, field: "message.nonce" });
  v.equalBigint(deadline, {
    expected: action.args.deadline,
    field: "message.deadline",
  });

  const parsed: Permit2TransferTypedData = {
    domain,
    primaryType: "PermitTransferFrom",
    types: {
      PermitTransferFrom: PERMIT2_TRANSFER_FROM_FIELDS,
      TokenPermissions: PERMIT2_TOKEN_PERMISSIONS_FIELDS,
    },
    message: {
      permitted: { token, amount },
      spender,
      nonce,
      deadline,
    },
  };
  return { type: "permit2SignatureTransfer", owner, typedData: parsed };
};

const toBlueAuthorizationSignature = (
  action: AuthorizationAction,
  ctx: Ctx,
): PendingAuthorization => {
  const { owner } = ctx;
  const fail = mismatch(ctx);
  const v = validators(fail);

  const typedData = action.typedData;
  v.primaryType(typedData?.primaryType, "Authorization");
  const types = v.record(typedData?.types, "types");
  v.exactTypes(types, ["Authorization"]);
  v.typesTuple(types.Authorization, {
    field: "types.Authorization",
    expected: BLUE_AUTHORIZATION_FIELDS,
  });
  const domain = parseDomain(typedData?.domain, fail);
  v.domainChainId(domain.chainId, ctx.chainId);
  v.equalAddress(domain.verifyingContract, {
    expected: ctx.addresses.blue,
    field: "domain.verifyingContract",
  });
  const message = v.record(typedData?.message, "message");

  const authorizer = v.address(message.authorizer, "message.authorizer");
  const authorized = v.address(message.authorized, "message.authorized");
  const isAuthorized = v.boolean(message.isAuthorized, "message.isAuthorized");
  const nonce = v.bigint(message.nonce, "message.nonce");
  const deadline = v.bigint(message.deadline, "message.deadline");

  v.equalAddress(authorizer, { expected: owner, field: "message.authorizer" });
  v.equalAddress(authorized, {
    expected: action.args.authorized,
    field: "message.authorized",
  });
  if (isMidnight(ctx, authorized)) {
    return unsupported(ctx)(
      `Authorization operator "${authorized}" is a Midnight contract. Midnight requirements are not supported`,
    );
  }
  const blueBundles = ctx.addresses.bundles?.blueBundlesV1;
  if (blueBundles == null || !isAddressEqual(authorized, blueBundles)) {
    fail(
      `Authorization message.authorized expected BlueBundlesV1 "${blueBundles ?? "unregistered"}", got "${authorized}". Only BlueBundlesV1 authorizations are signed`,
    );
  }
  v.equalBoolean(isAuthorized, {
    expected: action.args.isAuthorized,
    field: "message.isAuthorized",
  });
  v.equalBigint(deadline, {
    expected: action.args.deadline,
    field: "message.deadline",
  });

  const parsed: BlueAuthorizationTypedData = {
    domain,
    primaryType: "Authorization",
    types: { Authorization: BLUE_AUTHORIZATION_FIELDS },
    message: { authorizer, authorized, isAuthorized, nonce, deadline },
  };
  return { type: "blueAuthorizationSignature", typedData: parsed };
};

const decodeErc20Approve = (data: `0x${string}`, failUnsupported: Fail) => {
  let decoded: DecodeFunctionDataReturnType<typeof erc20Abi>;
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data });
  } catch (cause) {
    return failUnsupported(
      "Approval transaction data does not decode as an ERC-20 call. Only approve prerequisites are supported",
      { cause },
    );
  }
  if (decoded.functionName !== "approve") {
    return failUnsupported(
      `Approval transaction decoded to "${decoded.functionName}", expected "approve". Only ERC-20 approve prerequisites are supported`,
    );
  }
  return decoded.args;
};

const decodeSetAuthorization = (data: `0x${string}`, failUnsupported: Fail) => {
  let decoded: DecodeFunctionDataReturnType<typeof blueAbi>;
  try {
    decoded = decodeFunctionData({ abi: blueAbi, data });
  } catch (cause) {
    return failUnsupported(
      "Blue authorization transaction data does not decode as a Morpho call. Only setAuthorization prerequisites are supported",
      { cause },
    );
  }
  if (decoded.functionName !== "setAuthorization") {
    return failUnsupported(
      `Blue authorization transaction decoded to "${decoded.functionName}", expected "setAuthorization". Only setAuthorization prerequisites are supported`,
    );
  }
  return decoded.args;
};

const toErc20Approval = (
  requirement: Readonly<Transaction<ERC20ApprovalAction>>,
  ctx: Ctx,
): PendingAuthorization => {
  const { owner } = ctx;
  const { to, data, value, action } = requirement;
  const fail = mismatch(ctx);

  if (value !== 0n) {
    fail(
      `Approval transaction value expected "0", got "${value}". Approvals must not carry native value`,
    );
  }

  const [spender, amount] = decodeErc20Approve(data, unsupported(ctx));
  const v = validators(fail);
  v.equalAddress(spender, {
    expected: action.args.spender,
    field: "calldata spender",
  });
  v.equalBigint(amount, {
    expected: action.args.amount,
    field: "calldata amount",
  });
  if (isMidnight(ctx, spender)) {
    return unsupported(ctx)(
      `Approval spender "${spender}" is a Midnight contract. Midnight requirements are not supported`,
    );
  }
  failUnlessRegistered({
    fail,
    field: "calldata spender",
    observed: spender,
    allowed: [
      ...bundlesSpenders(ctx),
      ...(isDefined(ctx.addresses.permit2) ? [ctx.addresses.permit2] : []),
    ],
  });

  return { type: "erc20Approval", token: to, owner, spender, amount };
};

const toBlueAuthorization = (
  requirement: Readonly<Transaction<BlueAuthorizationAction>>,
  ctx: Ctx,
): PendingAuthorization => {
  const { owner } = ctx;
  const { to, data, value, action } = requirement;
  const fail = mismatch(ctx);

  if (!isAddressEqual(to, ctx.addresses.blue)) {
    fail(
      `Blue authorization transaction target expected Morpho "${ctx.addresses.blue}", got "${to}". Rebuild the request against the chain registry`,
    );
  }
  if (value !== 0n) {
    fail(
      `Blue authorization transaction value expected "0", got "${value}". Authorization calls must not carry native value`,
    );
  }

  const [authorized, isAuthorized] = decodeSetAuthorization(
    data,
    unsupported(ctx),
  );
  const v = validators(fail);
  v.equalAddress(authorized, {
    expected: action.args.authorized,
    field: "calldata authorized",
  });
  if (isMidnight(ctx, authorized)) {
    return unsupported(ctx)(
      `Authorization operator "${authorized}" is a Midnight contract. Midnight requirements are not supported`,
    );
  }
  failUnlessRegistered({
    fail,
    field: "calldata authorized",
    observed: authorized,
    allowed: authorizationOperators(ctx),
  });
  v.equalBoolean(isAuthorized, {
    expected: action.args.isAuthorized,
    field: "calldata newIsAuthorized",
  });

  return {
    type: "blueAuthorization",
    authorizer: owner,
    authorized,
    isAuthorized,
  };
};

/**
 * Converts morpho-sdk action requirements, in order, into simulation authorization descriptors.
 *
 * Call requirements (`erc20Approval`, `blueAuthorization`) are verified by decoding their calldata
 * and cross-checking it against the action metadata. Signature requirements (`permit`,
 * `permit2SignatureTransfer`, `authorization`) are parsed field-by-field into the exact typed-data
 * shapes the simulator expects; malformed payloads or values that disagree with `action.args` throw
 * {@link AuthorizationRequestMismatchError}. Any other requirement type throws
 * {@link UnsupportedOperationError}.
 *
 * The function is pure and synchronous: no RPC reads, no clock, no signing.
 *
 * @param params - Conversion parameters.
 * @param params.chainId - The chain the requirements were resolved on; binds `blueAuthorization`
 *   targets and every typed-data domain to the chain registry.
 * @param params.mode - Simulation mode carried into error contexts (`"preview"` or `"final"`).
 * @param params.blockNumber - Pinned block the simulation is verified against; carried into error contexts.
 * @param params.owner - The account the requirements were resolved for (transaction sender).
 * @param params.requirements - Requirements returned by `ActionOutput.getRequirements()`.
 * @param params.preLiquidations - Bound pre-liquidation contracts a `blueAuthorization`
 *   requirement may authorize, mirroring {@link decodeOperations}.
 * @returns One {@link PendingAuthorization} per input requirement, in the same order.
 * @throws {UnsupportedChainError} when `chainId` is absent from the address registry.
 * @throws {AuthorizationRequestMismatchError} when decoded calldata or typed data disagrees with the
 *   requirement's action metadata, or when the payload is malformed.
 * @throws {UnsupportedOperationError} when a requirement targets an operation the simulator does not
 *   support (Midnight calls, Midnight offer-root signatures, unknown action types, or call data that
 *   does not decode to the expected function).
 * @example
 * ```ts
 * import { toSimulationAuthorizations } from "@morpho-org/evm-simulation";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 * import { createPublicClient, http, type Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * async function prepare(userAddress: Address, blockNumber: bigint) {
 *   const client = createPublicClient({ chain: mainnet, transport: http() })
 *     .extend(morphoViemExtension());
 *   const vault = client.morpho.vaultV1(
 *     "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
 *     mainnet.id,
 *   );
 *   const vaultData = await vault.getData();
 *   const requirements = await vault
 *     .deposit({ amount: 1_000_000n, userAddress, vaultData })
 *     .getRequirements();
 *   const authorizations = toSimulationAuthorizations({
 *     chainId: mainnet.id,
 *     mode: "final",
 *     blockNumber,
 *     owner: userAddress,
 *     requirements,
 *   });
 *   return authorizations; // readonly PendingAuthorization[], one entry per requirement
 * }
 * ```
 */
export function toSimulationAuthorizations(params: {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly blockNumber: bigint;
  readonly owner: Address;
  readonly requirements: readonly ActionRequirement[];
  readonly preLiquidations?: readonly PreLiquidationBinding[];
}): readonly PendingAuthorization[] {
  const {
    chainId,
    mode,
    blockNumber,
    owner,
    requirements,
    preLiquidations = [],
  } = params;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) {
    throw new UnsupportedChainError(chainId);
  }

  return requirements.map((requirement, index) => {
    const ctx: Ctx = {
      chainId,
      mode,
      blockNumber,
      owner,
      index,
      addresses,
      preLiquidations,
    };

    if (isRequirementApproval(requirement)) {
      return toErc20Approval(requirement, ctx);
    }

    if (isRequirementBlueAuthorization(requirement)) {
      return toBlueAuthorization(requirement, ctx);
    }

    if (isRequirementSignature(requirement)) {
      const { action } = requirement;
      switch (action.type) {
        case "permit":
          return toErc2612Permit(action, ctx);
        case "permit2SignatureTransfer":
          return toPermit2SignatureTransfer(action, ctx);
        case "authorization":
          return toBlueAuthorizationSignature(action, ctx);
        default:
          return unsupported(ctx)(
            `Signature requirement action type "${action.type}" is not supported. Only permit, permit2SignatureTransfer, and authorization signatures are supported`,
          );
      }
    }

    return unsupported(ctx)(
      `Requirement action type "${requirement.action.type}" is not supported. Only erc20Approval, blueAuthorization, permit, permit2SignatureTransfer, and authorization requirements are supported`,
    );
  });
}
