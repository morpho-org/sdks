import { maxUint256, zeroAddress } from "viem";

import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { MetaMorphoErrors } from "../../errors.js";
import type { MetaMorphoOperations } from "../../operations.js";
import { handleBlueOperation } from "../blue/index.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { handleMetaMorphoAccrueInterestOperation } from "./accrueInterest.js";

export const handleMetaMorphoDepositOperation: OperationHandler<
  MetaMorphoOperations["MetaMorpho_Deposit"]
> = (
  { args: { assets = 0n, shares = 0n, owner, slippage = 0n }, sender, address },
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

  const { bundler } = getChainAddresses(data.chainId);
  const vault = data.getVault(address);

  if (shares === 0n) {
    if (sender === bundler) {
      // Simulate the bundler's behavior on deposits only with MaxUint256.
      if (assets === maxUint256)
        assets = MathLib.min(
          assets,
          data.getHolding(bundler, vault.asset).balance,
        );

      if (assets === 0n) throw new MetaMorphoErrors.ZeroAssets();
    }

    shares = vault.toShares(
      MathLib.wDivDown(assets, MathLib.WAD + slippage),
      "Down",
    );
  } else {
    // Simulate the bundler's behavior on withdrawals.
    if (sender === bundler && shares === 0n)
      throw new MetaMorphoErrors.ZeroShares();

    assets = MathLib.wMulUp(
      vault.toAssets(shares, "Up"),
      MathLib.WAD + slippage,
    );
  }

  // Transfer assets.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address: vault.config.asset,
      args: {
        amount: assets,
        from: sender,
        to: address,
      },
    },
    data,
  );

  let toSupply = assets;
  for (const id of vault.supplyQueue) {
    const { supplyAssets } = data
      .getAccrualPosition(address, id)
      .accrueInterest(data.block.timestamp);
    const { cap } = data.getVaultMarketConfig(address, id);

    const suppliable = MathLib.zeroFloorSub(cap, supplyAssets);
    if (suppliable === 0n) continue;

    const toSupplyInMarket = MathLib.min(toSupply, suppliable);

    handleBlueOperation(
      {
        type: "Blue_Supply",
        sender: zeroAddress, // Bypass the vault balance check.
        args: {
          id,
          assets: toSupplyInMarket,
          onBehalf: address,
        },
      },
      data,
    );

    toSupply -= toSupplyInMarket;

    if (toSupply <= 0n) break;
  }

  if (toSupply !== 0n)
    throw new MetaMorphoErrors.AllCapsReached(address, toSupply);

  vault.totalAssets += assets;
  vault.lastTotalAssets = vault.totalAssets;
  vault.totalSupply += shares;

  // Mint owner shares.
  handleErc20Operation(
    {
      type: "Erc20_Transfer",
      sender: address,
      address,
      args: {
        amount: shares,
        from: zeroAddress,
        to: owner,
      },
    },
    data,
  );
};
