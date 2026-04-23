import {
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { blueAbi, getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import { type Action, ActionBundle } from "@morpho-org/bundler-sdk-viem";
import { Time, format } from "@morpho-org/morpho-ts";
import {
  type Account,
  type Address,
  type Client,
  encodeFunctionData,
  maxUint256,
  parseUnits,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { cometExtAbi } from "../../abis/compoundV3.js";
import {
  BorrowMigrationLimiter,
  MigratableProtocol,
  type MigrationTransactionRequirement,
} from "../../types/index.js";
import { getCompoundV3ManagerApprovalMessage } from "../signature/compoundV3.js";
import {
  type IMigratableBorrowPosition,
  MigratableBorrowPosition,
} from "./index.js";

interface IMigratableBorrowPosition_CompoundV3
  extends Omit<IMigratableBorrowPosition, "protocol"> {
  nonce: bigint;
  collateralPriceUsd: bigint;
  loanPriceUsd: bigint;
  /** Minimum borrow position */
  baseBorrowMin: bigint;
  cometAddress: Address;
  cometName: string;
}

export class MigratableBorrowPosition_CompoundV3
  extends MigratableBorrowPosition
  implements IMigratableBorrowPosition_CompoundV3
{
  private _nonce;
  public readonly collateralPriceUsd;
  public readonly loanPriceUsd;
  public readonly baseBorrowMin;
  public readonly cometAddress;
  public readonly cometName;

  constructor(config: IMigratableBorrowPosition_CompoundV3) {
    super({ ...config, protocol: MigratableProtocol.compoundV3 });
    this._nonce = config.nonce;
    this.collateralPriceUsd = config.collateralPriceUsd;
    this.loanPriceUsd = config.loanPriceUsd;
    this.baseBorrowMin = config.baseBorrowMin;
    this.cometAddress = config.cometAddress;
    this.cometName = config.cometName;
  }

  getLtv({
    withdrawn = 0n,
    repaid = 0n,
  }: { withdrawn?: bigint; repaid?: bigint } = {}): bigint | null {
    const totalCollateralUsd =
      ((this.collateral - withdrawn) * this.collateralPriceUsd) /
      parseUnits("1", this.collateralToken.decimals);

    const totalBorrowUsd =
      ((this.borrow - repaid) * this.loanPriceUsd) /
      parseUnits("1", this.loanToken.decimals);

    if (totalBorrowUsd <= 0n) return null;
    if (totalCollateralUsd <= 0n) return maxUint256;

    return MathLib.wDivUp(totalBorrowUsd, totalCollateralUsd);
  }

  get nonce() {
    return this._nonce;
  }

  _getMigrationTx(
    {
      collateralAmount,
      borrowAmount,
      marketTo,
      slippageFrom = DEFAULT_SLIPPAGE_TOLERANCE,
      minSharePrice,
    }: MigratableBorrowPosition.Args,
    supportsSignature = true,
  ) {
    const user = this.user;
    const chainId = this.chainId;

    const migrationBundle = new ActionBundle<MigrationTransactionRequirement>(
      chainId,
    );

    const {
      morpho,
      bundler3: { generalAdapter1, compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV3MigrationAdapter == null)
      throw new Error("missing compoundV3MigrationAdapter address");

    const cometAddress = this.cometAddress;
    const cometName = this.cometName;

    let migratedBorrow = borrowAmount;

    const migrateMaxBorrow =
      this.maxRepay.limiter === BorrowMigrationLimiter.position &&
      this.maxRepay.value === migratedBorrow;
    if (migrateMaxBorrow) {
      migratedBorrow = maxUint256;
    }

    if (!migrateMaxBorrow && this.borrow - borrowAmount < this.baseBorrowMin)
      throw new Error(
        `Cannot have remaining position smaller than ${format.commas.unit(this.loanToken.symbol).of(this.baseBorrowMin, this.loanToken.decimals)}`,
      );

    if (supportsSignature) {
      const deadline = Time.timestamp() + Time.s.from.d(1n);
      const nonce = this._nonce;

      if (migratedBorrow > 0n && !this.isBundlerManaging) {
        const authorization = {
          authorizer: user,
          authorized: generalAdapter1,
          isAuthorized: true,
          deadline,
          nonce: this.morphoNonce,
        };

        const authorizeAction: Action = {
          type: "morphoSetAuthorizationWithSig",
          args: [authorization, null],
        };

        migrationBundle.actions.push(authorizeAction);

        migrationBundle.requirements.signatures.push({
          action: authorizeAction,
          async sign(client: Client, account: Account = client.account!) {
            let signature = authorizeAction.args[1];
            if (signature != null) return signature;

            const typedData = getAuthorizationTypedData(authorization, chainId);
            signature = await signTypedData(client, {
              ...typedData,
              account,
            });

            await verifyTypedData({
              ...typedData,
              address: user, // Verify against the authorization's owner.
              signature,
            });

            return (authorizeAction.args[1] = signature);
          },
        });
      }

      if (collateralAmount > 0n) {
        const allowAction: Action = {
          type: "compoundV3AllowBySig",
          args: [cometAddress, user, true, nonce, deadline, null],
        };

        migrationBundle.actions.push(allowAction);

        migrationBundle.requirements.signatures.push({
          action: allowAction,
          async sign(client: Client, account: Account = client.account!) {
            let signature = allowAction.args[5];
            if (signature != null) return signature; // action is already signed

            const typedData = getCompoundV3ManagerApprovalMessage(
              {
                name: cometName,
                instance: cometAddress,
                owner: user,
                manager: compoundV3MigrationAdapter,
                isAllowed: true,
                nonce,
                expiry: deadline,
              },
              chainId,
            );
            signature = await signTypedData(client, {
              ...typedData,
              account,
            });

            await verifyTypedData({
              ...typedData,
              address: user, // Verify against the permit's owner.
              signature,
            });

            return (allowAction.args[5] = signature);
          },
        });
      }
    } else {
      if (migratedBorrow > 0n && !this.isBundlerManaging) {
        migrationBundle.requirements.txs.push({
          type: "morphoSetAuthorization",
          args: [generalAdapter1, true],
          tx: {
            to: morpho,
            data: encodeFunctionData({
              abi: blueAbi,
              functionName: "setAuthorization",
              args: [generalAdapter1, true],
            }),
          },
        });
      }

      if (collateralAmount > 0n)
        migrationBundle.requirements.txs.push({
          type: "compoundV3ApproveManager",
          args: [compoundV3MigrationAdapter, true],
          tx: {
            to: cometAddress,
            data: encodeFunctionData({
              abi: cometExtAbi,
              functionName: "allow",
              args: [compoundV3MigrationAdapter, true],
            }),
          },
        });
    }

    const borrowActions: Action[] =
      migratedBorrow > 0n
        ? [
            {
              type: "morphoBorrow",
              args: [
                marketTo,
                // Overborrow by `slippageFrom` on both the max-borrow and the
                // partial-borrow paths. The overborrow is what gives the
                // post-source-repay sweep below something non-zero to
                // consume, which is what lets us keep the cleanup flow
                // strictly `skipRevert: false`.
                migrateMaxBorrow
                  ? MathLib.wMulUp(this.borrow, MathLib.WAD + slippageFrom)
                  : MathLib.wMulUp(migratedBorrow, MathLib.WAD + slippageFrom),
                0n,
                minSharePrice,
                compoundV3MigrationAdapter,
              ],
            },
            {
              type: "compoundV3Repay",
              // For the partial-borrow path, cap the source repay at the
              // user-quoted `migratedBorrow`. The CompoundV3MigrationAdapter
              // itself caps the amount at `min(adapter_balance,
              // ICompoundV3.borrowBalanceOf(onBehalf))`, so this effectively
              // does `min(migratedBorrow, live_source_debt)` and never
              // creates a supply position on the Comet. The cap guarantees
              // the migration adapter keeps at least `migratedBorrow *
              // slippageFrom` of residual destination loan tokens after
              // this action — without the cap, a partial migration where
              // `live_source_debt >= migratedBorrow * (1 + slippageFrom)`
              // would drain the adapter to zero and trip CoreAdapter's
              // `ZeroAmount` guard on the subsequent sweep (see
              // bundler3/src/adapters/migration/CompoundV3MigrationAdapter.sol).
              //
              // On the max-borrow path we keep `maxUint256` so a debt
              // that accrued more interest than `slippageFrom` is still
              // cleared to the maximum extent the borrowed amount allows.
              args: [
                cometAddress,
                migrateMaxBorrow ? maxUint256 : migratedBorrow,
                user,
              ],
            },
          ]
        : [];

    // Always route any residual destination loan tokens on the migration
    // adapter through `generalAdapter1` and apply them back to the
    // destination market as a cleanup repay on behalf of the user, so the
    // public migration adapter never retains destination loan tokens after
    // the source repay leg finishes. See SDK-155 / MORP2-4.
    //
    // We only append the pair when `slippageFrom > 0n`, because that is the
    // only regime where the overborrow above guarantees a non-zero residual
    // on the migration adapter (and therefore a non-zero balance on
    // `generalAdapter1` after the sweep). When `slippageFrom == 0n`, the
    // caller has explicitly opted out of slippage protection and we preserve
    // the pre-fix behaviour instead of injecting a cleanup that could revert
    // the whole bundle with `CoreAdapter.ZeroAmount` on the happy path.
    if (slippageFrom > 0n)
      borrowActions.push(
        {
          type: "erc20Transfer",
          args: [
            marketTo.loanToken,
            generalAdapter1,
            maxUint256,
            compoundV3MigrationAdapter,
          ],
        },
        {
          type: "morphoRepay",
          args: [marketTo, maxUint256, 0n, maxUint256, user, []],
        },
      );

    if (collateralAmount > 0n) {
      const callbackActions = borrowActions.concat({
        type: "compoundV3WithdrawFrom",
        args: [
          cometAddress,
          this.collateralToken.address,
          collateralAmount,
          generalAdapter1,
        ],
      });
      migrationBundle.actions.push({
        type: "morphoSupplyCollateral",
        args: [marketTo, collateralAmount, user, callbackActions],
      });
    } else {
      migrationBundle.actions.push(...borrowActions);
    }

    return migrationBundle;
  }
}
