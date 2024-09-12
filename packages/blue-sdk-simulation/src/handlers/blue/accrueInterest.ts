import { BlueOperations } from "../../operations";
import { OperationHandler } from "../types";

export const handleBlueAccrueInterestOperation: OperationHandler<
  BlueOperations["Blue_AccrueInterest"]
> = ({ args: { id } }, data) => {
  const marketData = data.getMarket(id);
  const newMarketData = marketData.accrueInterest(data.timestamp);

  data.blue.marketsData[id] = newMarketData;

  const feeRecipientMarketData =
    data.blue.positionByMarketByUser[data.blue.globalData.feeRecipient]?.[id];

  if (feeRecipientMarketData != null)
    feeRecipientMarketData.supplyShares +=
      newMarketData.totalSupplyShares - marketData.totalSupplyShares;
};
