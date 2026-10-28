import { MathLib } from "@morpho-org/blue-sdk";
import { maxUint256 } from "viem";
import {
  FEELESS_INPUT_TYPES,
  type OperationInputs,
  type OperationType,
  REALLOCATION_PENALTY_TYPES,
  type ScalarQuoteField,
} from "../../limits.js";

/** Required read/derivation fields, independent of transactions. @internal */
export const INPUT_FIELDS = {
  vaultV1MigrateToV2: ["sharesBurned", "sharesMinted"],
  vaultV1Deposit: ["assetsPaid", "sharesMinted"],
  vaultV2Deposit: ["assetsPaid", "sharesMinted"],
  vaultV1Withdraw: ["assetsReceived", "sharesBurned"],
  vaultV2Withdraw: ["assetsReceived", "sharesBurned"],
  vaultV1Redeem: ["assetsReceived", "sharesBurned"],
  vaultV2Redeem: ["assetsReceived", "sharesBurned"],
  blueSupply: ["assetsPaid", "sharesMinted"],
  blueWithdraw: ["assetsReceived", "sharesBurned"],
  blueBorrow: ["assetsReceived", "sharesMinted"],
  blueRepay: ["assetsPaid", "sharesBurned"],
  blueSupplyCollateral: ["assetsPaid", "collateralSupplied"],
  blueWithdrawCollateral: ["assetsReceived", "collateralWithdrawn"],
  blueSupplyCollateralBorrow: [
    "assetsPaid",
    "collateralSupplied",
    "assetsReceived",
    "sharesMinted",
  ],
  blueRepayWithdrawCollateral: [
    "assetsPaid",
    "sharesMinted",
    "sharesBurned",
    "assetsReceived",
    "collateralWithdrawn",
  ],
} as const satisfies Record<keyof OperationInputs, readonly ScalarQuoteField[]>;

/** Validate strict user amounts without consulting a transaction. @internal */
export function validateOperationInputs({
  type,
  inputs,
  fee,
  penalty,
  errors,
  path,
}: {
  readonly type: OperationType;
  readonly inputs: unknown;
  readonly fee: unknown;
  readonly penalty?: unknown;
  readonly errors: string[];
  readonly path: string;
}): void {
  if (!Object.hasOwn(INPUT_FIELDS, type)) {
    errors.push(
      `${path}.inputs: derivation is unavailable for "${type}"; supply a quote`,
    );
    return;
  }
  const amount = (value: unknown, name: string) => {
    if (typeof value !== "bigint" || value <= 0n || value > maxUint256)
      errors.push(`${name}: must be a positive uint256 bigint`);
  };
  const repay = (
    value: unknown,
    {
      name,
      allowFull = true,
    }: { readonly name: string; readonly allowFull?: boolean },
  ) => {
    if (allowFull && value === "full") return;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(
        `${name}: supply exactly one of assets or shares${allowFull ? ', or "full"' : ""}`,
      );
      return;
    }
    const keys = Object.keys(value).filter(
      (key) =>
        Reflect.get(value, key) !== undefined ||
        (key !== "assets" && key !== "shares"),
    );
    if (keys.length !== 1 || (keys[0] !== "assets" && keys[0] !== "shares"))
      errors.push(`${name}: supply exactly one of assets or shares`);
    for (const key of keys) amount(Reflect.get(value, key), `${name}.${key}`);
  };
  if (type === "blueRepay") repay(inputs, { name: `${path}.inputs` });
  else if (type === "blueWithdraw" || type === "vaultV1MigrateToV2") {
    if (inputs === "full")
      errors.push(`${path}.inputs: full is only valid for repayment`);
    else repay(inputs, { name: `${path}.inputs`, allowFull: false });
  } else if (
    typeof inputs !== "object" ||
    inputs === null ||
    Array.isArray(inputs)
  )
    errors.push(`${path}.inputs: must be an object`);
  else {
    const allowed =
      type === "blueSupplyCollateralBorrow"
        ? ["collateralAssets", "borrowAssets"]
        : type === "blueRepayWithdrawCollateral"
          ? ["repay", "collateralAssets"]
          : type.endsWith("Redeem")
            ? ["shares"]
            : ["assets"];
    const keys = Object.keys(inputs).filter(
      (key) => Reflect.get(inputs, key) !== undefined || !allowed.includes(key),
    );
    if (keys.length === 0)
      errors.push(`${path}.inputs: supply at least one amount`);
    for (const key of keys) {
      if (!allowed.includes(key))
        errors.push(`${path}.inputs.${key}: unknown field`);
      if (key === "repay")
        repay(Reflect.get(inputs, key), { name: `${path}.inputs.repay` });
      else amount(Reflect.get(inputs, key), `${path}.inputs.${key}`);
    }
  }
  if (fee !== undefined) {
    if (typeof fee !== "bigint" || fee < 0n || fee >= MathLib.WAD)
      errors.push(
        `${path}.referralFee: must be a WAD-scaled bigint in [0, 1e18)`,
      );
    if (FEELESS_INPUT_TYPES.some((candidate) => candidate === type))
      errors.push(`${path}.referralFee: this operation has no fee-bearing leg`);
  }
  if (penalty !== undefined) {
    if (typeof penalty !== "bigint" || penalty < 0n || penalty > maxUint256)
      errors.push(`${path}.reallocationPenalty: must be a uint256 bigint`);
    if (!REALLOCATION_PENALTY_TYPES.some((candidate) => candidate === type))
      errors.push(
        `${path}.reallocationPenalty: this operation has no reallocation route`,
      );
    if (
      type === "blueSupplyCollateralBorrow" &&
      (typeof inputs !== "object" ||
        inputs === null ||
        Reflect.get(inputs, "borrowAssets") === undefined)
    )
      errors.push(`${path}.reallocationPenalty: requires an active borrow leg`);
  }
}
