import { Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
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
  matchesAddress,
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
export function validateVaultPermitRequest(
  request: SignatureRequest,
  action: Action,
): void {
  if (request.kind !== "permit") {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  let spenderKey: "bundles.vaultBundlesV1" | "bundles.vaultExitBundlesV1";
  let asset: Address;
  let amount: bigint | undefined;
  let exact = false;
  switch (action.type) {
    case "vaultV2Deposit":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.asset;
      amount = action.inputs.assets;
      exact = true;
      break;
    case "vaultV1Deposit":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.asset;
      amount = action.inputs.assets;
      exact = true;
      break;
    case "vaultV1Withdraw":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amount = action.inputs.requiredShareAllowance;
      break;
    case "vaultV2Withdraw":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amount = action.inputs.requiredShareAllowance;
      break;
    case "vaultV2Redeem":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amount = action.inputs.shares;
      break;
    case "vaultV1Redeem":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.vault;
      amount = action.inputs.shares;
      break;
    case "vaultV2ForceWithdraw":
      spenderKey = "bundles.vaultExitBundlesV1";
      asset = action.inputs.vault;
      amount = maxUint256;
      exact = true;
      break;
    case "vaultV1MigrateToV2":
      spenderKey = "bundles.vaultBundlesV1";
      asset = action.inputs.sourceVault;
      amount = action.inputs.requiredShareAllowance;
      break;
    case "vaultV2InKindRedeem":
      spenderKey = "bundles.vaultExitBundlesV1";
      asset = action.inputs.vault;
      amount = maxUint256;
      exact = true;
      break;
    case "vaultV1InKindRedeem":
      spenderKey = "bundles.vaultExitBundlesV1";
      asset = action.inputs.vault;
      amount = maxUint256;
      exact = true;
      break;
    default:
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  if (action.signatureRequestIds.tokenPermit !== request.id) {
    throw new TransactionPlanSignatureMismatchError(request.id, "reference");
  }
  validateTokenPermitRequest(request, {
    chainId: action.inputs.chainId,
    account: action.inputs.account,
    deadline: action.inputs.deadline,
    bundler: spenderKey,
    asset,
    amount,
    exact,
  });
}

/** @internal Binds the signing payload and encoding arguments to a registered bundle's token pull. */
export function validateTokenPermitRequest(
  request: Extract<SignatureRequest, { kind: "permit" }>,
  pull: {
    readonly chainId: number;
    readonly account: Address;
    readonly deadline: bigint | undefined;
    readonly bundler:
      | "bundles.vaultBundlesV1"
      | "bundles.vaultExitBundlesV1"
      | "bundles.blueBundlesV1";
    readonly asset: Address;
    readonly amount: bigint | undefined;
    readonly exact: boolean;
  },
): void {
  const { chainId, account, asset, amount, exact } = pull;
  const { domain, message, types, primaryType } = request.typedData;
  const spender = getChainAddress(chainId, pull.bundler);
  const checks: readonly (readonly [string, boolean])[] = [
    ["domain.chainId", domain?.chainId === chainId],
    [
      "domain.verifyingContract",
      matchesAddress(domain?.verifyingContract, asset),
    ],
    ["message.owner", matchesAddress(message?.owner, account)],
    ["message.spender", matchesAddress(message?.spender, spender)],
    ["args.spender", matchesAddress(request.args.spender, spender)],
    ["message.value", message?.value === request.args.amount],
    [
      "value",
      exact
        ? request.args.amount === amount
        : amount !== undefined && request.args.amount >= amount,
    ],
    ["message.nonce", message?.nonce === request.args.nonce],
    ["message.deadline", message?.deadline === request.args.deadline],
    ["primaryType", primaryType === "Permit"],
    [
      "args.deadline",
      pull.deadline === undefined || request.args.deadline === pull.deadline,
    ],
  ];
  const mismatch = checks.find(([, matches]) => !matches);
  if (mismatch) {
    throw new TransactionPlanSignatureMismatchError(request.id, mismatch[0]);
  }
  const expected = getPermitTypedData(
    {
      erc20: new Token({ address: asset, name: domain?.name ?? "" }),
      owner: account,
      spender,
      allowance: request.args.amount,
      nonce: request.args.nonce,
      deadline: request.args.deadline,
    },
    chainId,
  ).types.Permit;
  const fields = types?.Permit;
  if (
    !Array.isArray(fields) ||
    Object.keys(types).length !== 1 ||
    fields.length !== expected.length ||
    !expected.every(
      ({ name, type }, index) =>
        fields[index]?.name === name &&
        fields[index]?.type === type &&
        Object.keys(fields[index]).length === 2,
    )
  ) {
    throw new TransactionPlanSignatureMismatchError(request.id, "types");
  }
}

/** @internal Rebuilds a token permit from the action's account/asset and its resolved signature requests. */
export function getSignedTokenPermit(
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
  if (request.kind !== "permit") {
    throw new TransactionPlanSignatureMismatchError(id, "reference");
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

/** @internal Alias for existing Vault V2 plan builders. */
export { getSignedTokenPermit as getVaultPermit };
