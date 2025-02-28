import {
  type ChainId,
  type ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { migrationAddresses } from "../../config.js";
import type {
  MigrationBundle,
  MigrationTransactionRequirement,
} from "../../types/actions.js";
import {
  MigratableProtocol,
  SupplyMigrationLimiter,
} from "../../types/index.js";

import type { Action } from "@morpho-org/bundler-sdk-viem";
import BundlerAction from "@morpho-org/bundler-sdk-viem/src/BundlerAction.js";
import { encodeFunctionData, maxUint256 } from "viem";
import { cErc20Abi } from "../../abis/compoundV2.js";
import {
  type IMigratableSupplyPosition,
  MigratableSupplyPosition,
} from "./index.js";

interface IMigratableSupplyPosition_CompoundV2
  extends Omit<IMigratableSupplyPosition, "protocol"> {
  bundlerAllowance: bigint;
  cToken: ExchangeRateWrappedToken;
  cTokenBalance: bigint;
}

export class MigratableSupplyPosition_CompoundV2
  extends MigratableSupplyPosition
  implements IMigratableSupplyPosition_CompoundV2
{
  readonly bundlerAllowance;
  readonly cToken;
  readonly cTokenBalance;

  constructor(config: IMigratableSupplyPosition_CompoundV2) {
    super({ ...config, protocol: MigratableProtocol.compoundV2 });

    this.bundlerAllowance = config.bundlerAllowance;
    this.cToken = config.cToken;
    this.cTokenBalance = config.cTokenBalance;
  }

  getMigrationTx(
    { amount, maxSharePrice, vault }: MigratableSupplyPosition.Args,
    chainId: ChainId,
  ): MigrationBundle {
    const txRequirements: MigrationTransactionRequirement[] = [];
    const actions: Action[] = [];

    const user = this.user;
    const cToken = this.cToken;

    const {
      bundler3: { generalAdapter1, compoundV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV2MigrationAdapter == null)
      throw new Error("missing compoundV2MigrationAdapter address");

    const migrateMax =
      this.max.limiter === SupplyMigrationLimiter.position &&
      this.max.value === amount;

    const transferredAmount = migrateMax
      ? this.cTokenBalance
      : this.cToken.toUnwrappedExactAmountOut(amount);

    // TODO use allowance + test
    txRequirements.push({
      type: "erc20Approve",
      args: [cToken.address, generalAdapter1, transferredAmount],
      tx: {
        to: cToken.address,
        data: encodeFunctionData({
          abi: cErc20Abi,
          functionName: "approve",
          args: [generalAdapter1, transferredAmount],
        }),
      },
    });

    actions.push({
      type: "erc20TransferFrom",
      args: [cToken.address, transferredAmount, compoundV2MigrationAdapter],
    });

    const isEth = this.cToken.underlying === NATIVE_ADDRESS;

    actions.push({
      type: "compoundV2Redeem",
      args: [cToken.address, maxUint256, isEth, generalAdapter1],
    });

    if (
      isEth ||
      this.cToken.address ===
        migrationAddresses[this.chainId]?.[MigratableProtocol.compoundV2]?.mWeth
          ?.address // Moonwell mWeth automatically unwraps weth on redeem
    )
      actions.push({
        type: "wrapNative",
        args: [maxUint256],
      });

    actions.push({
      type: "erc4626Deposit",
      args: [vault, maxUint256, maxSharePrice, user],
    });

    return {
      actions,
      requirements: {
        signatures: [],
        txs: txRequirements,
      },
      tx: () => BundlerAction.encodeBundle(chainId, actions),
    };
  }
}
