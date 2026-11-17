import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import type { Erc2612RequirementSignature } from "../types/index.js";
import {
  IncompleteTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import type { Action, SignatureRequest } from "./types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "./validation.js";

/** @internal Validates the stored ERC-2612 request shape without verifying its signature. */
export function validatePermitPlanRequest(
  request: Record<string, unknown>,
  path: string,
): void {
  const args = getPlanObject(request.args, `${path}.args`);
  validatePlanFields(args, {
    path: `${path}.args`,
    fields: {
      spender: "address",
      amount: "uint256 bigint",
      nonce: "uint256 bigint",
      deadline: "uint256 bigint",
    },
  });
  const typedData = getPlanObject(request.typedData, `${path}.typedData`);
  validatePlanField(typedData.primaryType, {
    path: `${path}.typedData.primaryType`,
    type: "string",
  });
  const domain = getPlanObject(typedData.domain, `${path}.typedData.domain`);
  validatePlanFields(domain, {
    path: `${path}.typedData.domain`,
    fields: { chainId: "positive safe integer", verifyingContract: "address" },
  });
  for (const field of ["name", "version"])
    if (domain[field] !== undefined)
      validatePlanField(domain[field], {
        path: `${path}.typedData.domain.${field}`,
        type: "string",
      });
  if (domain.salt !== undefined)
    validatePlanField(domain.salt, {
      path: `${path}.typedData.domain.salt`,
      type: "hex",
    });
  const types = getPlanObject(typedData.types, `${path}.typedData.types`);
  validatePlanField(types[typedData.primaryType as string], {
    path: `${path}.typedData.types.${typedData.primaryType}`,
    type: "array",
  });
  for (const [name, fields] of Object.entries(types)) {
    const typePath = `${path}.typedData.types.${name}`;
    validatePlanField(fields, { path: typePath, type: "array" });
    for (const [index, field] of (fields as unknown[]).entries()) {
      const entry = getPlanObject(field, `${typePath}[${index}]`);
      validatePlanFields(entry, {
        path: `${typePath}[${index}]`,
        fields: { name: "string", type: "string" },
      });
    }
  }
  const message = getPlanObject(typedData.message, `${path}.typedData.message`);
  validatePlanFields(message, {
    path: `${path}.typedData.message`,
    fields: {
      owner: "address",
      spender: "address",
      value: "uint256 bigint",
      nonce: "uint256 bigint",
      deadline: "uint256 bigint",
    },
  });
  if (request.signature !== undefined)
    validatePlanField(request.signature, {
      path: `${path}.signature`,
      type: "hex",
    });
}

/** @internal Checks a permit's signing payload against its referencing action and encoding arguments. */
export function validateSignatureRequest(
  request: SignatureRequest,
  action: Action,
): void {
  if (
    action.type === "erc20Approval" ||
    action.signatureRequestIds.tokenPermit !== request.id
  )
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  const { chainId, account } = action.inputs;
  const { domain, message, primaryType } = request.typedData;
  const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
  const asset =
    action.type === "vaultV2Deposit"
      ? action.inputs.asset
      : action.inputs.vault;
  const checks: readonly (readonly [string, boolean])[] = [
    ["domain.chainId", domain?.chainId === chainId],
    [
      "domain.verifyingContract",
      typeof domain?.verifyingContract === "string" &&
        domain.verifyingContract.toLowerCase() === asset.toLowerCase(),
    ],
    [
      "message.owner",
      typeof message?.owner === "string" &&
        message.owner.toLowerCase() === account.toLowerCase(),
    ],
    [
      "message.spender",
      typeof message?.spender === "string" &&
        message.spender.toLowerCase() === spender.toLowerCase(),
    ],
    [
      "args.spender",
      typeof request.args.spender === "string" &&
        request.args.spender.toLowerCase() === spender.toLowerCase(),
    ],
    ["message.value", message?.value === request.args.amount],
    [
      "value",
      action.type === "vaultV2Deposit"
        ? request.args.amount === action.inputs.amount
        : request.args.amount >= action.inputs.requiredShareAllowance,
    ],
    ["message.nonce", message?.nonce === request.args.nonce],
    ["message.deadline", message?.deadline === request.args.deadline],
    ["primaryType", primaryType === "Permit"],
  ];
  const mismatch = checks.find(([, matches]) => !matches);
  if (mismatch)
    throw new TransactionPlanSignatureMismatchError(request.id, mismatch[0]);
}

/** @internal Rebuilds a token permit from the action's account/asset and its resolved signature requests. */
export function getVaultPermit(
  requests: readonly SignatureRequest[],
  {
    id,
    asset,
    owner,
  }: {
    readonly id: string | undefined;
    readonly asset: Address;
    readonly owner: Address;
  },
): Erc2612RequirementSignature | undefined {
  if (id === undefined) return undefined;
  const request = requests.find((candidate) => candidate.id === id);
  if (request?.signature === undefined)
    throw new IncompleteTransactionPlanError(id);
  return {
    action: {
      type: request.kind,
      args: request.args,
      typedData: request.typedData,
    },
    args: {
      owner,
      asset,
      amount: request.args.amount,
      nonce: request.args.nonce,
      deadline: request.args.deadline,
      signature: request.signature,
    },
  };
}
