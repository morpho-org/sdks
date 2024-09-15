import { BlueOperations } from "../../operations.js";
import { OperationHandler } from "../types.js";

export const handleBlueAccrueInterestOperation: OperationHandler<
  BlueOperations["Blue_AccrueInterest"]
> = ({ args: { id } }, data) => {
  const marketData = data.getMarket(id);
  const newMarketData = marketData.accrueInterest(data.timestamp);

  data.markets[id] = newMarketData;

  const feeRecipientMarketData = data.positions[data.global.feeRecipient]?.[id];

  if (feeRecipientMarketData != null)
    feeRecipientMarketData.supplyShares +=
      newMarketData.totalSupplyShares - marketData.totalSupplyShares;
};
