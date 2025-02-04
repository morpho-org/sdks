import { type Address, type ChainId, MathLib } from "@morpho-org/blue-sdk";
import { midasConfigs } from "../addresses";

const ONE_HUNDRED_PERCENT = 100n * 100n;

// TODO : redemptionAsset -> redemptionAssets = list
// get the list with the getPaymentTokens() function of the encoder
// if marketParams.loanAsset in redemptionAssets, we chose it, otherwise we chose the first one

export type MidasConfig = {
  instantRedemptionVault: Address;
  redemptionAsset: Address;
};

export namespace Midas {
  export type TokenConfig = {
    dataFeed: `0x${string}`;
    fee: bigint;
    allowance: bigint;
    stable: boolean;
  };

  export type PreviewRedeemInstantParams = {
    amountMTokenIn: bigint;
    tokenOutConfig: TokenConfig;
    tokenOutDecimals: bigint;
    dailyLimits: bigint;
    mTokenRate: bigint;
    tokenOutRate: bigint;
    minAmount: bigint;
    instantFee: bigint;
    instantDailyLimit: bigint;
    STABLECOIN_RATE: bigint;
    waivedFeeRestriction: boolean;
  };

  export function isMidasToken(token: Address, chainId: ChainId) {
    return Object.keys(midasConfigs[chainId]).some(
      (tokenAddress) => tokenAddress === token,
    );
  }

  export function postRedeemToken(token: Address, chainId: ChainId) {
    return midasConfigs[chainId][token]!.redemptionAsset;
  }

  export function redemptionVault(token: Address, chainId: ChainId) {
    return midasConfigs[chainId][token]!.instantRedemptionVault;
  }

  export function previewRedeemInstant(params: PreviewRedeemInstantParams) {
    const feeData = _calcAndValidateRedeem(params);
    if (!feeData) return undefined;

    if (!_requireAndUpdateLimit(params, feeData.amountMTokenWithoutFee))
      return undefined;

    const usdData = _convertMTokenToUsd(params, feeData.amountMTokenWithoutFee);

    if (!usdData) return undefined;

    const tokenData = _convertUsdToToken(params, usdData.amountUsd);

    if (!tokenData) return undefined;

    return {
      amountTokenOutWithoutFee: _truncate(
        (feeData.amountMTokenWithoutFee * usdData.mTokenRate) /
          tokenData.tokenRate,
        params.tokenOutDecimals,
      ),
      feeAmount: feeData.feeAmount,
    };
  }

  function _calcAndValidateRedeem(params: PreviewRedeemInstantParams) {
    if (params.minAmount > params.amountMTokenIn) return undefined;

    const feeAmount = _getFeeAmount(params);

    return params.amountMTokenIn > feeAmount
      ? { feeAmount, amountMTokenWithoutFee: params.amountMTokenIn - feeAmount }
      : undefined;
  }

  function _getFeeAmount(params: PreviewRedeemInstantParams) {
    if (params.waivedFeeRestriction) return 0n;

    const feePercent = MathLib.min(
      params.tokenOutConfig.fee + params.instantFee,
      ONE_HUNDRED_PERCENT,
    );

    return (params.amountMTokenIn * feePercent) / ONE_HUNDRED_PERCENT;
  }

  function _requireAndUpdateLimit(
    params: PreviewRedeemInstantParams,
    amount: bigint,
  ) {
    return params.dailyLimits + amount <= params.instantDailyLimit;
  }

  function _convertMTokenToUsd(
    params: PreviewRedeemInstantParams,
    amount: bigint,
  ) {
    if (amount === 0n || params.mTokenRate === 0n) return undefined;

    return {
      amountUsd: (amount * params.mTokenRate) / 10n ** 18n,
      mTokenRate: params.mTokenRate,
    };
  }

  function _convertUsdToToken(
    params: PreviewRedeemInstantParams,
    amountUsd: bigint,
  ) {
    if (amountUsd === 0n) return undefined;

    const tokenRate = params.tokenOutConfig.stable
      ? params.STABLECOIN_RATE
      : params.tokenOutRate;

    if (tokenRate === 0n) return undefined;

    return {
      amountToken: (amountUsd * 10n ** 18n) / tokenRate,
      tokenRate,
    };
  }

  function _truncate(value: bigint, decimals: bigint) {
    return convertToBase18(convertFromBase18(value, decimals), decimals);
  }

  export function convertFromBase18(
    originalAmount: bigint,
    decidedDecimals: bigint,
  ) {
    return convert(originalAmount, 18n, decidedDecimals);
  }

  function convertToBase18(originalAmount: bigint, originalDecimals: bigint) {
    return convert(originalAmount, originalDecimals, 18n);
  }

  function convert(
    originalAmount: bigint,
    originalDecimals: bigint,
    decidedDecimals: bigint,
  ) {
    if (originalAmount === 0n) return 0n;
    if (originalDecimals === decidedDecimals) return originalAmount;

    let adjustedAmount = 0n;

    if (originalDecimals > decidedDecimals) {
      adjustedAmount =
        originalAmount / 10n ** (originalDecimals - decidedDecimals);
    } else {
      adjustedAmount =
        originalAmount * 10n ** (decidedDecimals - originalDecimals);
    }

    return adjustedAmount;
  }
}
