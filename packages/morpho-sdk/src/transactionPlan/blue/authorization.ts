import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi, getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import type {
  BlueAuthorizationAction,
  Transaction,
} from "../../types/index.js";
import {
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import type { Action, SignatureRequest } from "../types.js";
import {
  getPlanObject,
  matchesAddress,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";

type AuthorizationRequest = Extract<
  SignatureRequest,
  { kind: "morphoAuthorization" }
>;

interface AuthorizationBinding {
  readonly chainId: number;
  readonly account: Address;
  readonly nonce: bigint;
  readonly deadline: bigint;
}

/** @internal Binds the canonical Morpho grant to the prepared action and registered BlueBundlesV1. */
export function validateMorphoAuthorizationRequest(
  request: AuthorizationRequest,
  { chainId, account, nonce, deadline }: AuthorizationBinding,
): void {
  const authorized = getChainAddress(chainId, "bundles.blueBundlesV1");
  const expected = getAuthorizationTypedData(
    { authorizer: account, authorized, isAuthorized: true, nonce, deadline },
    chainId,
  );
  const { domain, message, types, primaryType } = request.typedData;
  const fields = types?.Authorization;
  const checks: readonly (readonly [string, boolean])[] = [
    ["domain.chainId", domain?.chainId === chainId],
    [
      "domain.verifyingContract",
      matchesAddress(
        domain?.verifyingContract,
        getChainAddresses(chainId).blue,
      ),
    ],
    [
      "domain",
      domain?.name === undefined &&
        domain?.version === undefined &&
        domain?.salt === undefined,
    ],
    ["primaryType", primaryType === expected.primaryType],
    [
      "types",
      Array.isArray(fields) &&
        Object.keys(types).length === 1 &&
        fields.length === expected.types.Authorization.length &&
        expected.types.Authorization.every(
          (field, index) =>
            field.name === fields[index]?.name &&
            field.type === fields[index]?.type,
        ),
    ],
    ["message.authorizer", matchesAddress(message?.authorizer, account)],
    ["args.owner", matchesAddress(request.args.owner, account)],
    ["message.authorized", matchesAddress(message?.authorized, authorized)],
    ["args.authorized", matchesAddress(request.args.authorized, authorized)],
    ["message.isAuthorized", message?.isAuthorized === true],
    ["message.nonce", message?.nonce === nonce],
    ["args.nonce", request.args.nonce === nonce],
    ["message.deadline", message?.deadline === deadline],
    ["args.deadline", request.args.deadline === deadline],
  ];
  const mismatch = checks.find(([, matches]) => !matches);
  if (mismatch) {
    throw new TransactionPlanSignatureMismatchError(request.id, mismatch[0]);
  }
}

/** @internal Encodes the standalone authorization prerequisite. */
export function buildMorphoAuthorization(
  action: Extract<Action, { type: "morphoAuthorization" }>,
): Transaction<BlueAuthorizationAction> {
  const { chainId } = action.inputs;
  const to = getChainAddresses(chainId).blue;
  const authorized = getChainAddress(chainId, "bundles.blueBundlesV1");
  const args = { authorized, isAuthorized: true };
  const data = encodeFunctionData({
    abi: blueAbi,
    functionName: "setAuthorization",
    args: [authorized, true],
  });
  return { to, value: 0n, data, action: { type: "blueAuthorization", args } };
}

/** @internal Rejects signature references on the standalone authorization step. */
export function validateMorphoAuthorizationPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  if (action.signatureRequestIds !== undefined) {
    throw new InvalidTransactionPlanError({
      path: `${path}.signatureRequestIds`,
      reason: "standalone Morpho authorization does not consume signatures",
    });
  }
}

/** @internal Validates the stored authorization request shape without verifying its signature. */
export function validateMorphoAuthorizationPlanRequest(
  request: Record<string, unknown>,
  path: string,
): void {
  const args = getPlanObject(request.args, `${path}.args`);
  validatePlanFields(args, {
    path: `${path}.args`,
    fields: {
      owner: "address",
      authorized: "address",
      nonce: "uint256 bigint",
      deadline: "uint256 bigint",
    },
  });
  const typedData = getPlanObject(request.typedData, `${path}.typedData`);
  if (typedData.primaryType !== "Authorization") {
    throw new InvalidTransactionPlanError({
      path: `${path}.typedData.primaryType`,
      reason: "expected Authorization",
    });
  }
  const types = getPlanObject(typedData.types, `${path}.typedData.types`);
  validatePlanField(types.Authorization, {
    path: `${path}.typedData.types.Authorization`,
    type: "array",
  });
  const domain = getPlanObject(typedData.domain, `${path}.typedData.domain`);
  validatePlanFields(domain, {
    path: `${path}.typedData.domain`,
    fields: { chainId: "positive safe integer", verifyingContract: "address" },
  });
  const message = getPlanObject(typedData.message, `${path}.typedData.message`);
  if (message.isAuthorized !== true) {
    throw new InvalidTransactionPlanError({
      path: `${path}.typedData.message.isAuthorized`,
      reason: "expected true",
    });
  }
  validatePlanFields(message, {
    path: `${path}.typedData.message`,
    fields: {
      authorizer: "address",
      authorized: "address",
      nonce: "uint256 bigint",
      deadline: "uint256 bigint",
    },
  });
  if (request.signature !== undefined) {
    validatePlanField(request.signature, {
      path: `${path}.signature`,
      type: "hex",
    });
  }
}
