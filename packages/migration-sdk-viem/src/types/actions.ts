import type { Address, Hex, TransactionRequest } from "viem";

export interface MigrationTransactionRequirementArgs {
  /* Morpho Aave V3 */
  aaveV3OptimizerApproveManager: [Address, boolean];

  /* Compound V3 */
  compoundV3ApproveManager: [Address, boolean];

  /* ERC20 */
  erc20Approve: [asset: Address, recipient: Address, amount: bigint];

  /* Morpho */
  morphoSetAuthorization: [authorized: Address, isAuthorized: boolean];
}

export type MigrationTransactionRequirementType =
  keyof MigrationTransactionRequirementArgs;

export type Requirements = {
  [T in MigrationTransactionRequirementType]: {
    type: T;
    args: MigrationTransactionRequirementArgs[T];
    tx: TransactionRequest & { to: Address; data: Hex };
  };
};

export type MigrationTransactionRequirement =
  Requirements[MigrationTransactionRequirementType];
