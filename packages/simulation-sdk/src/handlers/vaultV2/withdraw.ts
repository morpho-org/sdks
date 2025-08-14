import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";
import type { VaultV2Operations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import { handleVaultV2AccrueInterestOperation } from "./accrueInterest.js";

export const handleVaultV2WithdrawOperation: OperationHandler<
  VaultV2Operations["VaultV2_Withdraw"]
> = (
  {
    args: { assets = 0n, shares = 0n, onBehalf, receiver, slippage = 0n },
    sender,
    address,
  },
  data,
) => {
  handleVaultV2AccrueInterestOperation(
    {
      type: "VaultV2_AccrueInterest",
      sender: address,
      address,
      args: {},
    },
    data,
  );

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);
  const vaultV2 = data.getVaultV2(address);

  if (shares === 0n) {
    shares = vaultV2.toUnwrappedExactAmountOut(assets, slippage);
  } else {
    if (sender === generalAdapter1) {
      // Simulate the bundler's behavior on withdrawals only with MaxUint256.
      if (shares === MathLib.MAX_UINT_256)
        shares = data.getHolding(onBehalf, address).balance;
    }

    assets = vaultV2.toUnwrappedExactAmountIn(shares, slippage);
  }

  // Burn owner shares.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender, // Check approval in case of Morpho or Bundler.
      address,
      args: {
        amount: shares,
        from: onBehalf,
        to: ZERO_ADDRESS,
      },
    },
    data,
  );

  vaultV2.totalSupply -= shares;
  vaultV2.totalAssets -= assets;

  const idleAssets = data.getHolding(vaultV2.address, vaultV2.asset).balance;
  if (assets > idleAssets && vaultV2.liquidityAdapter !== zeroAddress) {
    //TODO handle deallocate, we mint for now
    handleErc20Operation(
      {
        type: "Erc20_Transfer",
        sender: address,
        address: vaultV2.asset,
        args: {
          amount: assets - idleAssets,
          from: zeroAddress,
          to: vaultV2.address,
        },
      },
      data,
    );
  }

  // Transfer assets.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: vaultV2.asset,
      args: {
        amount: assets,
        from: address,
        to: receiver,
      },
    },
    data,
  );
};
