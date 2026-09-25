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
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  isHex,
} from "viem";
import type {
  AuthorizationDomain,
  BlueAuthorizationTypedData,
  Erc2612TypedData,
  Permit2SignatureTransferTypedData,
  SimulationAuthorization,
} from "../domain/authorizations.js";
import type {
  SimulationErrorContext,
  SimulationSubject,
} from "../domain/diagnostics.js";
import {
  AuthorizationRequestMismatchError,
  UnsupportedOperationError,
} from "../errors.js";

type Fail = (message: string) => never;

interface Ctx {
  readonly owner: Address;
  readonly index: number;
}

const authorizationContext = (
  index: number,
  subject?: SimulationSubject,
): SimulationErrorContext => ({
  stage: "authorization",
  location: { type: "authorization", authorizationIndex: index },
  subject,
});

const mismatch =
  (index: number, subject?: SimulationSubject): Fail =>
  (message) => {
    throw new AuthorizationRequestMismatchError(
      `${message}. Rebuild the wallet request from getRequirements()`,
      authorizationContext(index, subject),
    );
  };

const unsupported =
  (index: number, subject?: SimulationSubject): Fail =>
  (message) => {
    throw new UnsupportedOperationError(
      message,
      authorizationContext(index, subject),
    );
  };

const describe = (value: unknown): string =>
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
      fail(`Typed data ${field} expected an object, got ${describe(value)}`);
    }
    return value as Record<string, unknown>;
  },
  address(value: unknown, field: string): Address {
    if (typeof value !== "string" || !isAddress(value)) {
      fail(`Typed data ${field} expected an address, got ${describe(value)}`);
    }
    return getAddress(value);
  },
  bigint(value: unknown, field: string): bigint {
    if (typeof value !== "bigint") {
      fail(`Typed data ${field} expected a bigint, got ${describe(value)}`);
    }
    return value;
  },
  boolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
      fail(`Typed data ${field} expected a boolean, got ${describe(value)}`);
    }
    return value;
  },
  optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      fail(`Typed data ${field} expected a string, got ${describe(value)}`);
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
      fail(`Typed data ${field} expected an array, got ${describe(value)}`);
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
          `Typed data ${field}[${index}] expected "${field_.name} ${field_.type}", got "${describe(entry.name)} ${describe(entry.type)}"`,
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
  primaryType(actual: unknown, expected: string): void {
    if (actual !== expected) {
      fail(
        `Typed data primaryType expected "${expected}", got ${describe(actual)}`,
      );
    }
  },
});

const parseDomain = (value: unknown, fail: Fail): AuthorizationDomain => {
  const v = validators(fail);
  const domain = v.record(value, "domain");

  const chainId = domain.chainId;
  if (typeof chainId !== "number" && typeof chainId !== "bigint") {
    fail(
      `Typed data domain.chainId expected a number or bigint, got ${describe(chainId)}`,
    );
  }

  const salt = domain.salt;
  if (salt !== undefined && (typeof salt !== "string" || !isHex(salt))) {
    fail(`Typed data domain.salt expected a hex string, got ${describe(salt)}`);
  }

  return {
    name: v.optionalString(domain.name, "domain.name"),
    version: v.optionalString(domain.version, "domain.version"),
    chainId,
    verifyingContract: v.address(
      domain.verifyingContract,
      "domain.verifyingContract",
    ),
    salt,
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
): SimulationAuthorization => {
  const { owner, index } = ctx;
  const domain = parseDomain(action.typedData?.domain, mismatch(index));
  const fail = mismatch(index, {
    type: "permission",
    owner,
    token: domain.verifyingContract,
    spender: action.args.spender,
  });
  const v = validators(fail);

  const typedData = action.typedData;
  v.primaryType(typedData?.primaryType, "Permit");
  const types = v.record(typedData?.types, "types");
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

  const parsed: Erc2612TypedData = {
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
): SimulationAuthorization => {
  const { owner, index } = ctx;
  const shapeFail = mismatch(index);
  const shape = validators(shapeFail);
  const typedData = action.typedData;
  shape.primaryType(typedData?.primaryType, "PermitTransferFrom");
  const types = shape.record(typedData?.types, "types");
  shape.typesTuple(types.PermitTransferFrom, {
    field: "types.PermitTransferFrom",
    expected: PERMIT2_TRANSFER_FROM_FIELDS,
  });
  shape.typesTuple(types.TokenPermissions, {
    field: "types.TokenPermissions",
    expected: PERMIT2_TOKEN_PERMISSIONS_FIELDS,
  });
  const domain = parseDomain(typedData?.domain, shapeFail);
  const message = shape.record(typedData?.message, "message");
  const permitted = shape.record(message.permitted, "message.permitted");
  const token = shape.address(permitted.token, "message.permitted.token");

  const fail = mismatch(index, {
    type: "permission",
    owner,
    token,
    spender: action.args.spender,
  });
  const v = validators(fail);

  const amount = v.bigint(permitted.amount, "message.permitted.amount");
  const spender = v.address(message.spender, "message.spender");
  const nonce = v.bigint(message.nonce, "message.nonce");
  const deadline = v.bigint(message.deadline, "message.deadline");

  v.equalAddress(spender, {
    expected: action.args.spender,
    field: "message.spender",
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

  const parsed: Permit2SignatureTransferTypedData = {
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
): SimulationAuthorization => {
  const { owner, index } = ctx;
  const fail = mismatch(index, {
    type: "operator",
    authorizer: owner,
    authorized: action.args.authorized,
  });
  const v = validators(fail);

  const typedData = action.typedData;
  v.primaryType(typedData?.primaryType, "Authorization");
  const types = v.record(typedData?.types, "types");
  v.typesTuple(types.Authorization, {
    field: "types.Authorization",
    expected: BLUE_AUTHORIZATION_FIELDS,
  });
  const domain = parseDomain(typedData?.domain, fail);
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

const decodeErc20Approve = (
  data: `0x${string}`,
  failUnsupported: Fail,
): readonly unknown[] => {
  let functionName: string;
  let args: readonly unknown[];
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    functionName = decoded.functionName;
    args = decoded.args;
  } catch {
    return failUnsupported(
      "Approval transaction data does not decode as an ERC-20 call. Only approve prerequisites are supported",
    );
  }
  if (functionName !== "approve") {
    return failUnsupported(
      `Approval transaction decoded to "${functionName}", expected "approve". Only ERC-20 approve prerequisites are supported`,
    );
  }
  return args;
};

const decodeSetAuthorization = (
  data: `0x${string}`,
  failUnsupported: Fail,
): readonly unknown[] => {
  let functionName: string;
  let args: readonly unknown[];
  try {
    const decoded = decodeFunctionData({ abi: blueAbi, data });
    functionName = decoded.functionName;
    args = decoded.args;
  } catch {
    return failUnsupported(
      "Blue authorization transaction data does not decode as a Morpho call. Only setAuthorization prerequisites are supported",
    );
  }
  if (functionName !== "setAuthorization") {
    return failUnsupported(
      `Blue authorization transaction decoded to "${functionName}", expected "setAuthorization". Only setAuthorization prerequisites are supported`,
    );
  }
  return args;
};

const toErc20Approval = (
  requirement: Readonly<Transaction<ERC20ApprovalAction>>,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner, index } = ctx;
  const { to, data, value, action } = requirement;
  const subject: SimulationSubject = {
    type: "permission",
    owner,
    token: to,
    spender: action.args.spender,
  };
  const fail = mismatch(index, subject);

  if (value !== 0n) {
    fail(
      `Approval transaction value expected "0", got "${value}". Approvals must not carry native value`,
    );
  }

  const decodedArgs = decodeErc20Approve(data, unsupported(index, subject));
  const v = validators(fail);
  const spender = v.address(decodedArgs[0], "calldata spender");
  const amount = v.bigint(decodedArgs[1], "calldata amount");
  v.equalAddress(spender, {
    expected: action.args.spender,
    field: "calldata spender",
  });
  v.equalBigint(amount, {
    expected: action.args.amount,
    field: "calldata amount",
  });

  return { type: "erc20Approval", token: to, owner, spender, amount };
};

const toBlueAuthorization = (
  requirement: Readonly<Transaction<BlueAuthorizationAction>>,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner, index } = ctx;
  const { data, value, action } = requirement;
  const subject: SimulationSubject = {
    type: "operator",
    authorizer: owner,
    authorized: action.args.authorized,
  };
  const fail = mismatch(index, subject);

  if (value !== 0n) {
    fail(
      `Blue authorization transaction value expected "0", got "${value}". Authorization calls must not carry native value`,
    );
  }

  const decodedArgs = decodeSetAuthorization(data, unsupported(index, subject));
  const v = validators(fail);
  const authorized = v.address(decodedArgs[0], "calldata authorized");
  const isAuthorized = v.boolean(decodedArgs[1], "calldata newIsAuthorized");
  v.equalAddress(authorized, {
    expected: action.args.authorized,
    field: "calldata authorized",
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
 * @param params.owner - The account the requirements were resolved for (transaction sender).
 * @param params.requirements - Requirements returned by `ActionOutput.getRequirements()`.
 * @returns One {@link SimulationAuthorization} per input requirement, in the same order.
 * @throws {AuthorizationRequestMismatchError} when decoded calldata or typed data disagrees with the
 *   requirement's action metadata, or when the payload is malformed.
 * @throws {UnsupportedOperationError} when a requirement targets an operation the simulator does not
 *   support (Midnight calls, Midnight offer-root signatures, unknown action types, or call data that
 *   does not decode to the expected function).
 */
export function toSimulationAuthorizations(params: {
  readonly owner: Address;
  readonly requirements: readonly ActionRequirement[];
}): readonly SimulationAuthorization[] {
  const { owner, requirements } = params;

  return requirements.map((requirement, index) => {
    const ctx: Ctx = { owner, index };

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
          return unsupported(index)(
            `Signature requirement action type "${action.type}" is not supported. Only permit, permit2SignatureTransfer, and authorization signatures are supported`,
          );
      }
    }

    return unsupported(index)(
      `Requirement action type "${requirement.action.type}" is not supported. Only erc20Approval, blueAuthorization, permit, permit2SignatureTransfer, and authorization requirements are supported`,
    );
  });
}
