import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
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
import { _try, isDefined } from "@morpho-org/morpho-ts";
import {
  AbiFunctionSignatureNotFoundError,
  type Address,
  type DecodeFunctionDataReturnType,
  decodeFunctionData,
  erc20Abi,
  isAddressEqual,
} from "viem";
import type {
  BlueAuthorizationTypedData,
  Erc2612PermitTypedData,
  Permit2TransferTypedData,
  SimulationAuthorization,
} from "../authorizations.js";
import {
  AuthorizationRequestMismatchError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "../errors.js";
import type { SimulationMode } from "../params.js";

type Fail = (message: string, options?: ErrorOptions) => never;

interface Ctx {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly blockNumber: bigint;
  readonly owner: Address;
  readonly index: number;
  readonly addresses: ReturnType<typeof getChainAddresses>;
  readonly preLiquidations: readonly Address[];
}

const failUnlessRegistered = (spec: {
  readonly fail: Fail;
  readonly field: string;
  readonly observed: Address;
  readonly allowed: readonly Address[];
}) => {
  if (!spec.allowed.some((allowed) => isAddressEqual(allowed, spec.observed))) {
    spec.fail(
      `${spec.field} expected one of "${spec.allowed.join('", "')}", got "${spec.observed}"`,
    );
  }
};

/** Whether the address names a Midnight deployment; Midnight requirements are unsupported. */
const isMidnight = (ctx: Ctx, address: Address): boolean =>
  [ctx.addresses.midnight, ctx.addresses.midnightBundles]
    .filter(isDefined)
    .some((midnight) => isAddressEqual(midnight, address));

const mismatch =
  (ctx: Ctx): Fail =>
  (message, options) => {
    throw new AuthorizationRequestMismatchError(
      `${message}. Rebuild the wallet request from getRequirements()`,
      {
        context: {
          stage: "preparation",
          chainId: ctx.chainId,
          mode: ctx.mode,
          blockNumber: ctx.blockNumber,
          authorizationIndex: ctx.index,
        },
        ...options,
      },
    );
  };

const unsupported =
  (ctx: Ctx): Fail =>
  (message, options) => {
    throw new UnsupportedOperationError(message, {
      context: {
        stage: "preparation",
        chainId: ctx.chainId,
        mode: ctx.mode,
        blockNumber: ctx.blockNumber,
        authorizationIndex: ctx.index,
      },
      ...options,
    });
  };

const comparators = (fail: Fail) => ({
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
  domainChainId(actual: number | bigint, expected: number): void {
    if (Number(actual) !== expected) {
      fail(`Typed data domain.chainId expected "${expected}", got "${actual}"`);
    }
  },
});

const toErc2612Permit = (
  action: PermitAction,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner } = ctx;
  const fail = mismatch(ctx);
  const v = comparators(fail);

  if (action.typedData == null) {
    fail("Permit requirement carries no typedData payload");
  }
  const typedData = action.typedData as Erc2612PermitTypedData;
  const { domain, message } = typedData;

  v.domainChainId(domain.chainId, ctx.chainId);
  v.equalAddress(message.owner, {
    expected: owner,
    field: "message.owner",
  });
  v.equalAddress(message.spender, {
    expected: action.args.spender,
    field: "message.spender",
  });
  if (isMidnight(ctx, message.spender)) {
    return unsupported(ctx)(
      `Permit spender "${message.spender}" is a Midnight contract. Midnight requirements are not supported`,
    );
  }
  failUnlessRegistered({
    fail,
    field: "message.spender",
    observed: message.spender,
    // ERC-2612 permits name the bundles contract that pulls the token.
    allowed: [
      ctx.addresses.bundles?.blueBundlesV1,
      ctx.addresses.bundles?.vaultBundlesV1,
      ctx.addresses.bundles?.vaultExitBundlesV1,
    ].filter(isDefined),
  });
  v.equalBigint(message.value, {
    expected: action.args.amount,
    field: "message.value",
  });
  v.equalBigint(message.deadline, {
    expected: action.args.deadline,
    field: "message.deadline",
  });
  if (action.args.nonce != null) {
    v.equalBigint(message.nonce, {
      expected: action.args.nonce,
      field: "message.nonce",
    });
  }

  return { type: "erc2612Permit", typedData };
};

const toPermit2SignatureTransfer = (
  action: Permit2SignatureTransferAction,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner } = ctx;
  const fail = mismatch(ctx);
  const v = comparators(fail);

  if (action.typedData == null) {
    fail("Permit2 requirement carries no typedData payload");
  }
  const typedData = action.typedData as Permit2TransferTypedData;
  const { domain, message } = typedData;

  v.domainChainId(domain.chainId, ctx.chainId);
  const permit2 = ctx.addresses.permit2;
  if (permit2 == null || !isAddressEqual(domain.verifyingContract, permit2)) {
    fail(
      `Typed data domain.verifyingContract expected the chain's canonical Permit2 "${permit2 ?? "unregistered"}", got "${domain.verifyingContract}"`,
    );
  }
  v.equalAddress(message.spender, {
    expected: action.args.spender,
    field: "message.spender",
  });
  failUnlessRegistered({
    fail,
    field: "message.spender",
    observed: message.spender,
    // VaultExitBundlesV1 takes share permits, not Permit2 transfers.
    allowed: [
      ctx.addresses.bundles?.blueBundlesV1,
      ctx.addresses.bundles?.vaultBundlesV1,
    ].filter(isDefined),
  });
  v.equalBigint(message.permitted.amount, {
    expected: action.args.amount,
    field: "message.permitted.amount",
  });
  v.equalBigint(message.nonce, {
    expected: action.args.nonce,
    field: "message.nonce",
  });
  v.equalBigint(message.deadline, {
    expected: action.args.deadline,
    field: "message.deadline",
  });

  return { type: "permit2SignatureTransfer", owner, typedData };
};

const toBlueAuthorizationSignature = (
  action: AuthorizationAction,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner } = ctx;
  const fail = mismatch(ctx);
  const v = comparators(fail);

  if (action.typedData == null) {
    fail("Authorization requirement carries no typedData payload");
  }
  const typedData = action.typedData as BlueAuthorizationTypedData;
  const { domain, message } = typedData;

  v.domainChainId(domain.chainId, ctx.chainId);
  v.equalAddress(domain.verifyingContract, {
    expected: ctx.addresses.blue,
    field: "domain.verifyingContract",
  });
  v.equalAddress(message.authorizer, {
    expected: owner,
    field: "message.authorizer",
  });
  v.equalAddress(message.authorized, {
    expected: action.args.authorized,
    field: "message.authorized",
  });
  if (isMidnight(ctx, message.authorized)) {
    return unsupported(ctx)(
      `Authorization operator "${message.authorized}" is a Midnight contract. Midnight requirements are not supported`,
    );
  }
  const blueBundles = ctx.addresses.bundles?.blueBundlesV1;
  if (blueBundles == null || !isAddressEqual(message.authorized, blueBundles)) {
    fail(
      `Authorization message.authorized expected BlueBundlesV1 "${blueBundles ?? "unregistered"}", got "${message.authorized}". Only BlueBundlesV1 authorizations are signed`,
    );
  }
  if (message.isAuthorized !== action.args.isAuthorized) {
    fail(
      `Authorization message.isAuthorized expected "${action.args.isAuthorized}", got "${message.isAuthorized}"`,
    );
  }
  v.equalBigint(message.deadline, {
    expected: action.args.deadline,
    field: "message.deadline",
  });

  return { type: "blueAuthorizationSignature", typedData };
};

const toErc20Approval = (
  requirement: Readonly<Transaction<ERC20ApprovalAction>>,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner } = ctx;
  const { to, data, value, action } = requirement;
  const fail = mismatch(ctx);
  const v = comparators(fail);

  if (value !== 0n) {
    fail(
      `Approval transaction value expected "0", got "${value}". Approvals must not carry native value`,
    );
  }

  let decodedApprove: DecodeFunctionDataReturnType<typeof erc20Abi>;
  try {
    decodedApprove = decodeFunctionData({ abi: erc20Abi, data });
  } catch (cause) {
    if (cause instanceof AbiFunctionSignatureNotFoundError) {
      return unsupported(ctx)(
        "Approval transaction data does not decode as an ERC-20 call. Only approve prerequisites are supported",
        { cause },
      );
    }
    return fail(
      "Approval transaction data does not decode as an ERC-20 call. Only approve prerequisites are supported",
      { cause },
    );
  }
  if (decodedApprove.functionName !== "approve") {
    return unsupported(ctx)(
      `Approval transaction decoded to "${decodedApprove.functionName}", expected "approve". Only ERC-20 approve prerequisites are supported`,
    );
  }
  const [spender, amount] = decodedApprove.args;
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
    // Approvals may also target canonical Permit2 (the Permit2 prerequisite).
    allowed: [
      ctx.addresses.bundles?.blueBundlesV1,
      ctx.addresses.bundles?.vaultBundlesV1,
      ctx.addresses.bundles?.vaultExitBundlesV1,
      ctx.addresses.permit2,
    ].filter(isDefined),
  });

  return { type: "erc20Approval", token: to, owner, spender, amount };
};

const toBlueAuthorization = (
  requirement: Readonly<Transaction<BlueAuthorizationAction>>,
  ctx: Ctx,
): SimulationAuthorization => {
  const { owner } = ctx;
  const { to, data, value, action } = requirement;
  const fail = mismatch(ctx);
  const v = comparators(fail);

  if (!isAddressEqual(to, ctx.addresses.blue)) {
    fail(
      `Blue authorization transaction target expected Morpho "${ctx.addresses.blue}", got "${to}"`,
    );
  }
  if (value !== 0n) {
    fail(
      `Blue authorization transaction value expected "0", got "${value}". Authorization calls must not carry native value`,
    );
  }

  let decodedSetAuthorization: DecodeFunctionDataReturnType<typeof blueAbi>;
  try {
    decodedSetAuthorization = decodeFunctionData({ abi: blueAbi, data });
  } catch (cause) {
    if (cause instanceof AbiFunctionSignatureNotFoundError) {
      return unsupported(ctx)(
        "Blue authorization transaction data does not decode as a Morpho call. Only setAuthorization prerequisites are supported",
        { cause },
      );
    }
    return fail(
      "Blue authorization transaction data does not decode as a Morpho call. Only setAuthorization prerequisites are supported",
      { cause },
    );
  }
  if (decodedSetAuthorization.functionName !== "setAuthorization") {
    return unsupported(ctx)(
      `Blue authorization transaction decoded to "${decodedSetAuthorization.functionName}", expected "setAuthorization". Only setAuthorization prerequisites are supported`,
    );
  }
  const [authorized, isAuthorized] = decodedSetAuthorization.args;
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
    // Operators a Morpho authorization may bind: BlueBundlesV1 or a
    // caller-supplied pre-liquidation contract.
    allowed: [
      ctx.addresses.bundles?.blueBundlesV1,
      ...ctx.preLiquidations,
    ].filter(isDefined),
  });
  if (isAuthorized !== action.args.isAuthorized) {
    fail(
      `Authorization calldata newIsAuthorized expected "${action.args.isAuthorized}", got "${isAuthorized}"`,
    );
  }

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
 * `permit2SignatureTransfer`, `authorization`) pass their EIP-712 payload through unchanged — the
 * envelope shape is validated by `simulate()`'s request parser — while the adapter cross-checks it
 * against the action metadata, the owner, and the chain registry. Disagreements throw
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
 * @param params.preLiquidations - Pre-liquidation contract addresses a `blueAuthorization`
 *   requirement may authorize.
 * @returns One {@link SimulationAuthorization} per input requirement, in the same order.
 * @throws {UnsupportedChainError} when `chainId` is absent from the address registry.
 * @throws {AuthorizationRequestMismatchError} when decoded calldata or typed data disagrees with the
 *   requirement's action metadata, or when a signature requirement carries no `typedData`.
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
 *   return authorizations; // readonly SimulationAuthorization[], one entry per requirement
 * }
 * ```
 */
export function toSimulationAuthorizations(params: {
  readonly chainId: number;
  readonly mode: SimulationMode;
  readonly blockNumber: bigint;
  readonly owner: Address;
  readonly requirements: readonly ActionRequirement[];
  readonly preLiquidations?: readonly Address[];
}): readonly SimulationAuthorization[] {
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
    throw new UnsupportedChainError(chainId, {
      stage: "validation",
      chainId,
      mode,
      blockNumber,
    });
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
