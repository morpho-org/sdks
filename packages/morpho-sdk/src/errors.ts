export {
  BlueErrors,
  IncompleteChainRegistryError,
  InvalidMarketParamsError as InvalidBlueMarketParamsError,
  /** @deprecated Use InvalidBlueMarketParamsError or the raw protocol subpath. */
  InvalidMarketParamsError,
  UnknownAddressError,
  UnknownDataError,
  UnknownFactory,
  UnknownMarketAllocationError,
  UnknownMarketParamsError as UnknownBlueMarketParamsError,
  /** @deprecated Use UnknownBlueMarketParamsError or the raw protocol subpath. */
  UnknownMarketParamsError,
  UnknownOfFactory,
  UnknownTokenError,
  UnknownTokenPriceError,
  UnknownVaultConfigError,
  UnsupportedChainIdError,
  UnsupportedPreLiquidationParamsError as UnsupportedBluePreLiquidationParamsError,
  /** @deprecated Use UnsupportedBluePreLiquidationParamsError or the raw protocol subpath. */
  UnsupportedPreLiquidationParamsError,
  UnsupportedVaultV2AdapterError,
  VaultV2Errors,
} from "@morpho-org/blue-sdk";
export {
  getUnsupportedVaultV2Adapter as getBlueUnsupportedVaultV2Adapter,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  isUnknownOfFactoryError as isBlueUnknownOfFactoryError,
  UnsupportedPermitDomainExtensionsError,
} from "@morpho-org/blue-sdk-viem";
export {
  ChainIdMismatchError as MidnightChainIdMismatchError,
  InvalidEcrecoverSignatureVError as InvalidMidnightEcrecoverSignatureVError,
  InvalidMarketParameterError as InvalidMidnightMarketParameterError,
  InvalidMidnightApiResponseError,
  InvalidOfferGroupError as InvalidMidnightOfferGroupError,
  /** @deprecated Use InvalidMidnightOfferGroupError or the raw protocol subpath. */
  InvalidOfferGroupError,
  InvalidOfferParameterError as InvalidMidnightOfferParameterError,
  /** @deprecated Use InvalidMidnightOfferParameterError or the raw protocol subpath. */
  InvalidOfferParameterError,
  InvalidPositionAccrualStateError as InvalidMidnightPositionAccrualStateError,
  /** @deprecated Use InvalidMidnightPositionAccrualStateError or the raw protocol subpath. */
  InvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError as InvalidMidnightPositionAccrualTimestampError,
  /** @deprecated Use InvalidMidnightPositionAccrualTimestampError or the raw protocol subpath. */
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError as InvalidMidnightPositionLossFactorError,
  /** @deprecated Use InvalidMidnightPositionLossFactorError or the raw protocol subpath. */
  InvalidPositionLossFactorError,
  InvalidTickSpacingError as InvalidMidnightTickSpacingError,
  /** @deprecated Use InvalidMidnightTickSpacingError or the raw protocol subpath. */
  InvalidTickSpacingError,
  InvalidTreeError as InvalidMidnightTreeError,
  /** @deprecated Use InvalidMidnightTreeError or the raw protocol subpath. */
  InvalidTreeError,
  InvalidTreeHeightError as InvalidMidnightTreeHeightError,
  /** @deprecated Use InvalidMidnightTreeHeightError or the raw protocol subpath. */
  InvalidTreeHeightError,
  InvalidTypedDataSignatureError as InvalidMidnightTypedDataSignatureError,
  MidnightApiError,
  MidnightMempoolValidationError,
  PayloadDecodeError as MidnightPayloadDecodeError,
  PriceGreaterThanOneError as MidnightPriceGreaterThanOneError,
  /** @deprecated Use MidnightPriceGreaterThanOneError or the raw protocol subpath. */
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError as MidnightSettlementFeeExceedsPriceError,
  /** @deprecated Use MidnightSettlementFeeExceedsPriceError or the raw protocol subpath. */
  SettlementFeeExceedsPriceError,
  TickOutOfRangeError as MidnightTickOutOfRangeError,
  /** @deprecated Use MidnightTickOutOfRangeError or the raw protocol subpath. */
  TickOutOfRangeError,
  UnknownCollateralIndexError as UnknownMidnightCollateralIndexError,
  /** @deprecated Use UnknownMidnightCollateralIndexError or the raw protocol subpath. */
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
export type { ErrorClass } from "@morpho-org/morpho-ts";
export {
  _try,
  DivisionByZeroError,
  InvalidBitLengthError,
  NegativeValueError,
  RegistryValueAlreadyRegisteredError,
} from "@morpho-org/morpho-ts";
