import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { MetaMorphoErrors } from "../../errors.js";
import type { MetaMorphoOperations } from "../../operations.js";
import { handleBlueOperation } from "../blue/index.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
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

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);
  const vault = data.getVault(address);

  if (shares === 0n) {
    if (sender === generalAdapter1) {
      // Simulate the bundler's behavior on deposits only with MaxUint256.
      if (assets === MathLib.MAX_UINT_256)
        assets = data.getHolding(sender, vault.asset).balance;

      if (assets === 0n) throw new MetaMorphoErrors.ZeroAssets();
    }

    shares = vault.toShares(
      MathLib.wDivDown(assets, MathLib.WAD + slippage),
      "Down",
    );
  } else {
    // Simulate the bundler's behavior on withdrawals.
    if (sender === generalAdapter1 && shares === 0n)
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
      address: vault.asset,
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
    const { cap } = data.getVaultMarketConfig(address, id);
    if (cap === 0n) continue;

    handleBlueOperation(
      {
        type: "Blue_AccrueInterest",
        sender: address,
        args: { id },
      },
      data,
    );

    const { supplyAssets } = data.getAccrualPosition(address, id, false);

    const suppliable = MathLib.zeroFloorSub(cap, supplyAssets);
    if (suppliable === 0n) continue;

    const toSupplyInMarket = MathLib.min(toSupply, suppliable);

    handleBlueOperation(
      {
        type: "Blue_Supply",
        sender: address,
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
        from: ZERO_ADDRESS,
        to: owner,
      },
    },
    data,
  );
};
