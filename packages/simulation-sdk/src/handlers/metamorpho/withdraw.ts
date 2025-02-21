import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { MetaMorphoErrors } from "../../errors.js";
import type { MetaMorphoOperations } from "../../operations.js";
import { handleBlueOperation } from "../blue/index.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { handleMetaMorphoAccrueInterestOperation } from "./accrueInterest.js";

export const handleMetaMorphoWithdrawOperation: OperationHandler<
  MetaMorphoOperations["MetaMorpho_Withdraw"]
> = (
  {
    args: { assets = 0n, shares = 0n, owner, receiver, slippage = 0n },
    sender,
    address,
  },
  data,
) => {
  handleMetaMorphoAccrueInterestOperation(
    {
      type: "MetaMorpho_AccrueInterest",
      sender: address,
      address,
      args: {},
    },
    data,
  );

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);
  const vault = data.getVault(address);

  if (shares === 0n) {
    // Simulate the bundler's behavior on withdrawals.
    if (sender === generalAdapter1 && assets === 0n)
      throw new MetaMorphoErrors.ZeroAssets();

    shares = MathLib.wMulUp(vault.toShares(assets), MathLib.WAD + slippage);
  } else {
    if (sender === generalAdapter1) {
      // Simulate the bundler's behavior on withdrawals only with MaxUint256.
      if (shares === MathLib.MAX_UINT_256)
        shares = data.getHolding(owner, address).balance;

      if (shares === 0n) throw new MetaMorphoErrors.ZeroShares();
    }

    assets = vault.toAssets(MathLib.wDivDown(shares, MathLib.WAD + slippage));
  }

  // Burn owner shares.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender, // Check approval in case of Morpho or Bundler.
      address,
      args: {
        amount: shares,
        from: owner,
        to: ZERO_ADDRESS,
      },
    },
    data,
  );

  let toWithdraw = assets;
  for (const id of vault.withdrawQueue) {
    const {
      withdrawCapacityLimit: { value: withdrawable },
    } = data.getAccrualPosition(address, id);

    handleBlueOperation(
      {
        type: "Blue_AccrueInterest",
        sender: address,
        args: { id },
      },
      data,
    );

    if (withdrawable === 0n) continue;

    const toWithdrawInMarket = MathLib.min(toWithdraw, withdrawable);

    handleBlueOperation(
      {
        type: "Blue_Withdraw",
        sender: address,
        args: {
          id,
          assets: toWithdrawInMarket,
          onBehalf: address,
          receiver: address,
        },
      },
      data,
    );

    toWithdraw -= toWithdrawInMarket;

    if (toWithdraw <= 0n) break;
  }

  if (toWithdraw !== 0n)
    throw new MetaMorphoErrors.NotEnoughLiquidity(address, toWithdraw);

  vault.totalAssets -= assets;
  vault.lastTotalAssets = vault.totalAssets;
  vault.totalSupply -= shares;

  // Transfer assets.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: vault.asset,
      args: {
        amount: assets,
        from: address,
        to: receiver,
      },
    },
    data,
  );
};
