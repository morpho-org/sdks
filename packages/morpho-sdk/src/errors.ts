export {
  BlueErrors,
  IncompleteChainRegistryError,
  InvalidMarketParamsError as InvalidBlueMarketParamsError,
  UnknownAddressError,
  UnknownDataError as UnknownBlueDataError,
  UnknownFactory as UnknownBlueFactory,
  UnknownMarketAllocationError as UnknownBlueMarketAllocationError,
  UnknownMarketParamsError as UnknownBlueMarketParamsError,
  UnknownOfFactory as UnknownBlueOfFactory,
  UnknownTokenError as UnknownBlueTokenError,
  UnknownTokenPriceError as UnknownBlueTokenPriceError,
  UnknownVaultConfigError as UnknownBlueVaultConfigError,
  UnsupportedChainIdError,
  UnsupportedMarketIrmError as UnsupportedBlueMarketIrmError,
  /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
  UnsupportedPreLiquidationParamsError as UnsupportedBluePreLiquidationParamsError,
  UnsupportedVaultV2AdapterError as UnsupportedBlueVaultV2AdapterError,
  VaultV2Errors,
} from "@morpho-org/blue-sdk";
export {
  getUnsupportedVaultV2Adapter as getBlueUnsupportedVaultV2Adapter,
  InvalidNumberError,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  isUnknownOfFactoryError as isBlueUnknownOfFactoryError,
  UnsupportedPermitDomainExtensionsError,
} from "@morpho-org/blue-sdk-viem";
export {
  ChainIdMismatchError as MidnightChainIdMismatchError,
  InvalidEcrecoverSignatureVError as InvalidMidnightEcrecoverSignatureVError,
  InvalidMarketParameterError as InvalidMidnightMarketParameterError,
  InvalidMidnightApiQuoteTargetError,
  InvalidMidnightApiResponseError,
  InvalidOfferGroupError as InvalidMidnightOfferGroupError,
  InvalidOfferParameterError as InvalidMidnightOfferParameterError,
  InvalidPositionAccrualStateError as InvalidMidnightPositionAccrualStateError,
  InvalidPositionAccrualTimestampError as InvalidMidnightPositionAccrualTimestampError,
  InvalidPositionLossFactorError as InvalidMidnightPositionLossFactorError,
  /** @deprecated Use InvalidMidnightPositionLossFactorError or the raw protocol subpath. */
  InvalidPositionLossFactorError,
  InvalidRateRatifierV1RateError as InvalidMidnightRateRatifierV1RateError,
  /** @deprecated Use InvalidMidnightRateRatifierV1RateError or the raw protocol subpath. */
  InvalidRateRatifierV1RateError,
  InvalidTickSpacingError as InvalidMidnightTickSpacingError,
  InvalidTreeError as InvalidMidnightTreeError,
  InvalidTreeHeightError as InvalidMidnightTreeHeightError,
  InvalidTypedDataSignatureError as InvalidMidnightTypedDataSignatureError,
  MidnightApiError,
  MidnightMempoolValidationError,
  PayloadDecodeError as MidnightPayloadDecodeError,
  PriceGreaterThanOneError as MidnightPriceGreaterThanOneError,
  /** @deprecated Use MidnightPriceGreaterThanOneError or the raw protocol subpath. */
  PriceGreaterThanOneError,
  RatifierV1TakerNotAllowedError as MidnightRatifierV1TakerNotAllowedError,
  /** @deprecated Use MidnightRatifierV1TakerNotAllowedError or the raw protocol subpath. */
  RatifierV1TakerNotAllowedError,
  SettlementFeeExceedsPriceError as MidnightSettlementFeeExceedsPriceError,
  TickOutOfRangeError as MidnightTickOutOfRangeError,
  UnknownCollateralIndexError as UnknownMidnightCollateralIndexError,
} from "@morpho-org/midnight-sdk";
export type { ErrorClass } from "@morpho-org/morpho-ts";
export {
  _try,
  DivisionByZeroError,
  InvalidBitLengthError,
  NegativeValueError,
  RegistryValueAlreadyRegisteredError,
} from "@morpho-org/morpho-ts";
