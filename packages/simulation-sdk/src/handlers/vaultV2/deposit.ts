import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import type { VaultV2Operations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import { handleVaultV2AccrueInterestOperation } from "./accrueInterest.js";

export const handleVaultV2DepositOperation: OperationHandler<
  VaultV2Operations["VaultV2_Deposit"]
> = (
  {
    args: { assets = 0n, shares = 0n, onBehalf, slippage = 0n },
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
    if (sender === generalAdapter1) {
      // Simulate the bundler's behavior on deposits only with MaxUint256.
      if (assets === MathLib.MAX_UINT_256)
        assets = data.getHolding(sender, vaultV2.asset).balance;
    }

    shares = vaultV2.toWrappedExactAmountIn(assets, slippage);
  } else {
    assets = vaultV2.toWrappedExactAmountOut(shares, slippage);
  }

  if (assets === 0n) return;

  // Transfer assets.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: vaultV2.asset,
      args: {
        amount: assets,
        from: sender,
        to: address,
      },
    },
    data,
  );

  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address,
      args: {
        amount: shares,
        from: ZERO_ADDRESS,
        to: onBehalf,
      },
    },
    data,
  );

  vaultV2.totalSupply += shares;
  vaultV2.totalAssets += assets;

  if (vaultV2.liquidityAdapter !== zeroAddress) {
    handleErc20Operation(
      {
        type: "Erc20_Transfer",
        sender: address,
        address: vaultV2.asset,
        args: {
          amount: assets,
          from: address,
          to: vaultV2.liquidityAdapter,
        },
      },
      data,
    );
    //TODO handle allocate
    //TODO check caps
  }
};
