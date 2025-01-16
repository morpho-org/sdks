import {
  type ChainId,
  MathLib,
  UnsupportedChainIdError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

import MIGRATION_ADDRESSES from "../../config.js";
import type { MigrationTransactionRequirement } from "../../types/actions.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

import type {
  Action,
  SignatureRequirement,
} from "@morpho-org/bundler-sdk-viem";
import BundlerAction from "@morpho-org/bundler-sdk-viem/src/BundlerAction.js";
import { baseBundlerAbi } from "@morpho-org/bundler-sdk-viem/src/abis.js";
import {
  type Account,
  type Client,
  encodeFunctionData,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { morphoAaveV3Abi } from "../../abis/aaveV3Optimizer.js";
import { getMorphoAaveV3ManagerApprovalTypedData } from "../helpers/signatures.js";
import {
  type IMigratableSupplyPosition,
  MigratableSupplyPosition,
} from "./index.js";

interface IMigratableSupplyPosition_AaveV3Optimizer
  extends Omit<IMigratableSupplyPosition, "protocol"> {
  nonce: bigint;
  isBundlerManaging: boolean;
}

export class MigratableSupplyPosition_AaveV3Optimizer
  extends MigratableSupplyPosition
  implements IMigratableSupplyPosition_AaveV3Optimizer
{
  public readonly isBundlerManaging: boolean;
  private _nonce: bigint;

  constructor(config: IMigratableSupplyPosition_AaveV3Optimizer) {
    super({ ...config, protocol: MigratableProtocol.aaveV3Optimizer });
    this.isBundlerManaging = config.isBundlerManaging;
    this._nonce = config.nonce;
  }

  get nonce() {
    return this._nonce;
  }

  getMigrationTx(
    { amount, minShares, vault }: MigratableSupplyPosition.Args,
    chainId: ChainId,
    supportsSignature = true,
  ) {
    const signRequirements: SignatureRequirement[] = [];
    const txRequirements: MigrationTransactionRequirement[] = [];
    const actions: Action[] = [];

    const user = this.user;
    const bundler = getChainAddresses(chainId).aaveV3OptimizerBundler;
    if (!bundler) throw new Error("missing aaveV3OptimizerBundler address");

    const migrationAddresses =
      MIGRATION_ADDRESSES[chainId][MigratableProtocol.aaveV3Optimizer];

    if (!migrationAddresses) throw new UnsupportedChainIdError(chainId);

    if (!this.isBundlerManaging) {
      if (supportsSignature) {
        const deadline = Time.timestamp() + Time.s.from.d(1n);
        const nonce = this._nonce;

        const managerApprovalAction: Action = {
          type: "aaveV3OptimizerApproveManagerWithSig",
          args: [true, nonce, deadline, null],
        };

        actions.push(managerApprovalAction);
        signRequirements.push({
          action: managerApprovalAction,
          async sign(client: Client, account: Account = client.account!) {
            if (managerApprovalAction.args[3] != null)
              return managerApprovalAction.args[3]; // action is already signed

            const typedData = getMorphoAaveV3ManagerApprovalTypedData(
              {
                delegator: user,
                manager: bundler,
                nonce,
                deadline,
                isAllowed: true,
              },
              chainId,
            );
            const signature = await signTypedData(client, {
              ...typedData,
              account,
            });

            await verifyTypedData({
              ...typedData,
              address: user, // Verify against the permit's owner.
              signature,
            });

            return (managerApprovalAction.args[3] = signature);
          },
        });
      } else {
        txRequirements.push({
          type: "aaveV3OptimizerApproveManager",
          args: [bundler, true],
          tx: {
            to: migrationAddresses.morpho.address,
            data: encodeFunctionData({
              abi: morphoAaveV3Abi,
              functionName: "approveManager",
              args: [bundler, true],
            }),
          },
        });
      }
    }

    let migratedAmount = amount;

    /*
    When we want to move the whole position of the user, we use MaxUint as an amount because:
      - for `aaveV3OptimizerWithdraw`, aaveV3Optimizer is taking the min between the amount and the user's balance (on pool + in p2p).
      - for `erc4626Deposit`, the bundler is taking the  min between the amount and his balance
     */
    if (
      this.max.limiter === SupplyMigrationLimiter.position &&
      this.max.value <= amount
    ) {
      migratedAmount = MathLib.MAX_UINT_160;
    }

    actions.push(
      {
        type: "aaveV3OptimizerWithdraw",
        args: [this.loanToken, migratedAmount, 4n],
      },
      {
        type: "erc4626Deposit",
        args: [vault, MathLib.MAX_UINT_128, minShares, user],
      },
    );

    return {
      actions,
      requirements: {
        signatures: signRequirements,
        txs: txRequirements,
      },
      tx: () => ({
        to: bundler,
        value: 0n,
        data: encodeFunctionData({
          abi: baseBundlerAbi,
          functionName: "multicall",
          args: [actions.map(BundlerAction.encode)],
        }),
      }),
    };
  }
}
