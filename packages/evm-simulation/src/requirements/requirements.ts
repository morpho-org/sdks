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
import type { Address } from "viem";
import type {
  BlueAuthorizationTypedData,
  Erc2612PermitTypedData,
  Permit2TransferTypedData,
  SimulationAuthorization,
} from "../authorizations.js";
import {
  AuthorizationRequestMismatchError,
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
}

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

const toErc2612Permit = (
  action: PermitAction,
  ctx: Ctx,
): SimulationAuthorization => {
  if (action.typedData == null) {
    mismatch(ctx)("Permit requirement carries no typedData payload");
  }
  return {
    type: "erc2612Permit",
    typedData: action.typedData as Erc2612PermitTypedData,
  };
};

const toPermit2SignatureTransfer = (
  action: Permit2SignatureTransferAction,
  ctx: Ctx,
): SimulationAuthorization => {
  if (action.typedData == null) {
    mismatch(ctx)("Permit2 requirement carries no typedData payload");
  }
  return {
    type: "permit2SignatureTransfer",
    owner: ctx.owner,
    typedData: action.typedData as Permit2TransferTypedData,
  };
};

const toBlueAuthorizationSignature = (
  action: AuthorizationAction,
  ctx: Ctx,
): SimulationAuthorization => {
  if (action.typedData == null) {
    mismatch(ctx)("Authorization requirement carries no typedData payload");
  }
  return {
    type: "blueAuthorizationSignature",
    typedData: action.typedData as BlueAuthorizationTypedData,
  };
};

const toErc20Approval = (
  requirement: Readonly<Transaction<ERC20ApprovalAction>>,
  ctx: Ctx,
): SimulationAuthorization => ({
  type: "erc20Approval",
  token: requirement.to,
  owner: ctx.owner,
  spender: requirement.action.args.spender,
  amount: requirement.action.args.amount,
});

const toBlueAuthorization = (
  requirement: Readonly<Transaction<BlueAuthorizationAction>>,
  ctx: Ctx,
): SimulationAuthorization => ({
  type: "blueAuthorization",
  authorizer: ctx.owner,
  authorized: requirement.action.args.authorized,
  isAuthorized: requirement.action.args.isAuthorized,
});

/**
 * Maps morpho-sdk action requirements, in order, onto simulation authorization descriptors.
 *
 * The adapter is a pure mapper — nothing is decoded or validated; `simulate()`'s request parser
 * validates each authorization's shape and semantics when the request is parsed. Call requirements
 * (`erc20Approval`, `blueAuthorization`) are mapped straight from `action.args` (the approval
 * token is the requirement's `to`). Signature requirements (`permit`,
 * `permit2SignatureTransfer`, `authorization`) carry their EIP-712 payload through unchanged; a
 * missing payload throws {@link AuthorizationRequestMismatchError}. Any other requirement type
 * throws {@link UnsupportedOperationError}.
 *
 * The function is pure and synchronous: no RPC reads, no clock, no signing.
 *
 * @param params - Mapping parameters.
 * @param params.chainId - The chain the requirements were resolved on; carried into error contexts.
 * @param params.mode - Simulation mode carried into error contexts (`"preview"` or `"final"`).
 * @param params.blockNumber - Pinned block the simulation is verified against; carried into error contexts.
 * @param params.owner - The account the requirements were resolved for (transaction sender).
 * @param params.requirements - Requirements returned by `ActionOutput.getRequirements()`.
 * @returns One {@link SimulationAuthorization} per input requirement, in the same order.
 * @throws {AuthorizationRequestMismatchError} when a signature requirement carries no `typedData`.
 * @throws {UnsupportedOperationError} when a requirement's action type is not a supported
 *   authorization.
 * @example
 * ```ts
 * import { toSimulationAuthorizations } from "@morpho-org/evm-simulation";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 * import { vaults } from "@morpho-org/morpho-test";
 * import { createPublicClient, http, type Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * async function prepare(userAddress: Address, blockNumber: bigint) {
 *   const client = createPublicClient({ chain: mainnet, transport: http() })
 *     .extend(morphoViemExtension());
 *   const vault = client.morpho.vaultV1(
 *     vaults[mainnet.id].steakUsdc.address,
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
}): readonly SimulationAuthorization[] {
  const { chainId, mode, blockNumber, owner, requirements } = params;

  return requirements.map((requirement, index) => {
    const ctx: Ctx = { chainId, mode, blockNumber, owner, index };

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
