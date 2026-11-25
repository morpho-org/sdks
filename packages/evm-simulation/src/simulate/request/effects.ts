import { type Address, getAddress, isAddress, isHex, maxUint256 } from "viem";
import { SimulationValidationError } from "../../errors.js";
import type { SimulationEffect } from "../../limits.js";

const invalid = (path: string): never => {
  throw new SimulationValidationError(
    `Invalid ${path}. Supply a valid transaction-bound control effect.`,
    [path],
  );
};

/** Validate exact control effects and caller-transaction indices. @internal */
export function parseEffects(
  value: unknown,
  transactionCount: number,
): readonly SimulationEffect[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return invalid("limits.effects: must be an array");
  }
  return Array.from(value, (raw: unknown, index) =>
    parseEffect(raw, { path: `limits.effects[${index}]`, transactionCount }),
  );
}

function parseEffect(
  raw: unknown,
  {
    path,
    transactionCount,
  }: { readonly path: string; readonly transactionCount: number },
): SimulationEffect {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return invalid(path);
  }
  const field = (key: string): unknown => Reflect.get(raw, key);
  const address = (key: string): Address => {
    const value = field(key);
    if (typeof value !== "string" || !isAddress(value)) {
      return invalid(`${path}.${key}`);
    }
    return getAddress(value);
  };
  const boolean = (): boolean => {
    const value = field("isAuthorized");
    return typeof value === "boolean" ? value : invalid(`${path}.isAuthorized`);
  };
  const txIdx = field("txIdx");
  if (
    txIdx !== undefined &&
    (typeof txIdx !== "number" ||
      !Number.isSafeInteger(txIdx) ||
      txIdx < 0 ||
      txIdx >= transactionCount)
  ) {
    return invalid(`${path}.txIdx: must index a caller transaction`);
  }
  const binding = txIdx === undefined ? {} : { txIdx: txIdx as number };
  const type = field("type");
  const keys = (allowed: readonly string[]) => {
    if (
      Object.keys(raw).some(
        (key) => !["type", "txIdx", ...allowed].includes(key),
      )
    ) {
      invalid(`${path}: unknown field`);
    }
  };
  switch (type) {
    case "erc20Approval": {
      keys(["token", "owner", "spender", "amount"]);
      const amount = field("amount");
      if (typeof amount !== "bigint" || amount < 0n || amount > maxUint256) {
        return invalid(`${path}.amount`);
      }
      return {
        ...binding,
        type,
        token: address("token"),
        owner: address("owner"),
        spender: address("spender"),
        amount,
      };
    }
    case "blueAuthorization":
      keys(["authorizer", "authorized", "isAuthorized"]);
      return {
        ...binding,
        type,
        authorizer: address("authorizer"),
        authorized: address("authorized"),
        isAuthorized: boolean(),
      };
    case "midnightAuthorization":
      keys(["onBehalf", "authorized", "isAuthorized"]);
      return {
        ...binding,
        type,
        onBehalf: address("onBehalf"),
        authorized: address("authorized"),
        isAuthorized: boolean(),
      };
    case "midnightCancelOffers": {
      keys(["onBehalf", "groups"]);
      const groups = field("groups");
      if (!Array.isArray(groups) || groups.length === 0) {
        return invalid(`${path}.groups: must be non-empty`);
      }
      const parsed = Array.from(groups, (group: unknown) => {
        if (
          typeof group !== "string" ||
          !isHex(group, { strict: true }) ||
          group.length !== 66
        ) {
          return invalid(`${path}.groups: must contain bytes32 groups`);
        }
        return group.toLowerCase() as `0x${string}`;
      });
      if (new Set(parsed).size !== parsed.length) {
        return invalid(`${path}.groups: duplicate group`);
      }
      return {
        ...binding,
        type,
        onBehalf: address("onBehalf"),
        groups: parsed,
      };
    }
    default:
      return invalid(`${path}.type`);
  }
}
