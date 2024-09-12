import { MaxUint256, ZeroAddress } from "ethers";

import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { MetaMorphoErrors } from "../../errors";
import { MetaMorphoOperations } from "../../operations";
import { handleBlueOperation } from "../blue";
import { handleErc20Operation } from "../erc20";
import { OperationHandler } from "../types";

import { handleMetaMorphoAccrueInterestOperation } from "./accrueInterest";

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
      if (assets === MaxUint256)
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
      .accrueInterest(data.timestamp);
    const { cap } = data.getVaultMarketConfig(address, id);

    const suppliable = MathLib.zeroFloorSub(cap, supplyAssets);
    if (suppliable === 0n) continue;

    const toSupplyInMarket = MathLib.min(toSupply, suppliable);

    handleBlueOperation(
      {
        type: "Blue_Supply",
        sender: ZeroAddress, // Bypass the vault balance check.
        address: ZeroAddress, // Replaced with Blue address inside `handleBlueOperation`.
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
        from: ZeroAddress,
        to: owner,
      },
    },
    data,
  );
};
