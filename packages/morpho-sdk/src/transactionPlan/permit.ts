import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
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
  for (const field of ["name", "version"]) {
    if (domain[field] !== undefined) {
      validatePlanField(domain[field], {
        path: `${path}.typedData.domain.${field}`,
        type: "string",
      });
    }
  }
  if (domain.salt !== undefined) {
    validatePlanField(domain.salt, {
      path: `${path}.typedData.domain.salt`,
      type: "hex",
    });
  }
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
  if (request.signature !== undefined) {
    validatePlanField(request.signature, {
      path: `${path}.signature`,
      type: "hex",
    });
  }
}

/** @internal Checks a permit's signing payload against its referencing action and encoding arguments. */
export function validateSignatureRequest(
  request: SignatureRequest,
  action: Action,
): void {
  const { chainId, account } = action.inputs;
  const { domain, message, primaryType } = request.typedData;
  let spenderKey: "bundles.vaultBundlesV1" | "bundles.vaultExitBundlesV1";
  let asset: Address;
  let amountMatches: boolean;
  switch (action.type) {
    case "vaultV2ForceRedeem":
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
    case "erc20Approval":
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
    case "vaultV2Deposit":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.asset;
      amountMatches = request.args.amount === action.inputs.assets;
      break;
    case "vaultV1Deposit":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.asset;
      amountMatches = request.args.amount === action.inputs.assets;
      break;
    case "vaultV1Withdraw":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amountMatches =
        request.args.amount >= action.inputs.requiredShareAllowance;
      break;
    case "vaultV2Withdraw":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amountMatches =
        request.args.amount >= action.inputs.requiredShareAllowance;
      break;
    case "vaultV2Redeem":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amountMatches = request.args.amount >= action.inputs.shares;
      break;
    case "vaultV1Redeem":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amountMatches = request.args.amount >= action.inputs.shares;
      break;
    case "vaultV2ForceWithdraw":
      spenderKey = "bundles.vaultExitBundlesV1";
      asset = action.inputs.vault;
      amountMatches = request.args.amount === maxUint256;
      break;
    case "vaultV1MigrateToV2":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.sourceVault;
      amountMatches =
        request.args.amount >= action.inputs.requiredShareAllowance;
      break;
    case "vaultV2InKindRedeem":
      spenderKey = "bundles.vaultExitBundlesV1";
      asset = action.inputs.vault;
      amountMatches = request.args.amount === maxUint256;
      break;
    case "vaultV1InKindRedeem":
      spenderKey = "bundles.vaultExitBundlesV1";
      asset = action.inputs.vault;
      amountMatches = request.args.amount === maxUint256;
      break;
    default: {
      const _exhaustive: never = action;
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
    }
  }
  if (action.signatureRequestIds.tokenPermit !== request.id) {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  const spender = getChainAddress(chainId, spenderKey);
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
    ["value", amountMatches],
    ["message.nonce", message?.nonce === request.args.nonce],
    ["message.deadline", message?.deadline === request.args.deadline],
    ["primaryType", primaryType === "Permit"],
  ];
  const mismatch = checks.find(([, matches]) => !matches);
  if (mismatch) {
    throw new TransactionPlanSignatureMismatchError(request.id, mismatch[0]);
  }
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
  if (id === undefined) {
    return undefined;
  }
  const request = requests.find((candidate) => candidate.id === id);
  if (request?.signature === undefined) {
    throw new IncompleteTransactionPlanError(id);
  }
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
