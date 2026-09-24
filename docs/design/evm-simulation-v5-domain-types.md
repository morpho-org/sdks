# EVM simulation v5 domain contract

SDK-1292 defines the types for the [September 24 TIB](../tibs/TIB-2026-09-18-evm-simulation-calldata-verification.md), on SDK-1291 / PR #1167. The SDK baseline is morpho-sdk 6.0.0.

These declarations live under [src/domain](../../packages/evm-simulation/src/domain) and are marked `@internal`. They are deliberately absent from `src/index.ts`: SDK-1293 will replace the existing public names and connect the parser atomically. There are no temporary public aliases, runtime implementations, new error constructors, or claims that the current `simulate()` verifies these fields. The legacy public types, errors and function remain unchanged. The patch changeset records internal source maintenance within the inherited unreleased major stack.

All new records and nested collections are readonly. Consumers provide raw bigint amounts; fixed suffixes identify assets, shares, WAD ratios, WAD annual rates, seconds and E27 conversion rates. `MarketId` and `InputMarketParams` come from blue-sdk's public barrel; Address and Hex use viem. Protocol typed-data shapes are owned locally, preserving exact primary-type/message/schema relationships without exposing a fragile upstream generic.

## Input coverage

| TIB input | Declaration / fields | Static and runtime boundary |
| --- | --- | --- |
| Config | Existing `SimulationConfig.chains`, `ChainSimulationConfig.simulateV1Url`, `logger`, `timeoutMs` | Preserved by the current public API; SDK-1291 requires the sole backend URL. |
| User calls | `SimulationBaseParams.chainId, transactions`; readonly existing `SimulationTransaction` (`from, to, data, value?`) | Ordering and raw shapes are preserved. Common sender, address validity and amount bounds require parsing. |
| Block | `SimulationBaseParams.blockNumber?: bigint \| BlockTag` | Resolve once at runtime; omitted means latest. |
| Preview | `PreviewSimulateParams.mode: "preview", authorizations?` | Optional readonly pending requests. |
| Final | `FinalSimulateParams.mode?: "final", authorizations?: never` | Omitted mode is final; the runtime parser must also reject supplied authorization properties from untyped callers. |
| Normalized mode | `NormalizedSimulateParams` | Explicit mode; final has an empty readonly tuple, preview has an ordered request list. |
| Global limits | `SimulationLimits.maxSlippageWad, minLltvBufferWad, maxSignatureLifetimeSeconds` | Defaults are 0.03%, 0.5%, 7200 seconds; default application, ranges and tightening are runtime checks. |
| Wallet limits | `wallet.maxDebit, wallet.minCredit`; `TokenAmount.token, amount` | Native token uses ethAddress; evaluate net balances excluding gas. |
| Operation limits | `operations: readonly OperationLimit[]` | Tagged fields below; exact/unique subject binding and tightening remain runtime checks. |
| Effective limits | `EffectiveSimulationLimits` | All defaults, wallet collections and operation lists are resolved explicitly. |

## Authorization coverage

| Variant | Exact fields | Payload / ownership |
| --- | --- | --- |
| erc20Approval | `token, owner, spender, amount` | Raw ERC-20 approval amount; request ordering preserves zero reset then grant. |
| erc2612Permit | `typedData` | `Erc2612TypedData`: primaryType Permit; message owner, spender, value, nonce, deadline. |
| permit2SignatureTransfer | `owner, typedData` | `Permit2SignatureTransferTypedData`: primaryType PermitTransferFrom; message permitted.token/amount, spender, nonce, deadline. Explicit owner is outside the message. |
| blueAuthorization | `authorizer, authorized, isAuthorized` | Direct Morpho setAuthorization request. |
| blueAuthorizationSignature | `typedData` | `BlueAuthorizationTypedData`: primaryType Authorization; message authorizer, authorized, isAuthorized, nonce, deadline. |
| EIP-712 domain/schema | `domain.chainId, verifyingContract, name?, version?, salt?`; exact ordered `types` tuples | Domain identity, schema, nonce and deadline need runtime verification. PermitSingle and legacy approval/signature variants are absent. |

Released SDK `RequirementTypedData` is intentionally broader than the target payloads. SDK-1294's adapter must parse that value and retain the exact payload; it cannot assert it into a narrow type or rebuild it from action summaries. `sdk-composition.test.ts` type-checks the public `ActionOutput.getRequirements → adapter → buildTx() → preview` and `buildTx(signatures) → final` flow. The SDK is a **devDependency only** for this acceptance check, with no new runtime dependency.

## Operation and limit coverage

Every row is present in `OperationLimitFields`, `DecodedOperationFields` and `OperationOutcomeFields`. Each limit also accepts optional `transactionIndex` to disambiguate the subject. The operation identity carries `transactionIndex, callPath`; deployment, chainId and owner are explicit.

| Operation | Binding subject | Optional expected pins | Optional outcome bounds |
| --- | --- | --- | --- |
| `blueSupply` | `marketId` | `expectedAssets`, `expectedOnBehalf` | `minSupplySharesMinted` |
| `blueWithdraw` | `marketId` | `expectedReceiver`, `expectedFullClose` | `minAssetsReceived`, `maxSupplySharesBurned`, `maxUtilizationAfterWad`, `maxReallocationPenaltyAssets` |
| `blueSupplyCollateral` | `marketId` | `expectedAssets`, `expectedOnBehalf` | `maxLtvAfterWad` |
| `blueBorrow` | `marketId` | `expectedAssets`, `expectedReceiver` | `maxBorrowSharesMinted`, `maxLtvAfterWad`, `minHealthFactorAfterWad`, `maxUtilizationAfterWad`, `maxBorrowApyAfterWad`, `maxReallocationPenaltyAssets` |
| `blueSupplyCollateralBorrow` | `marketId` | `expectedCollateralAssets`, `expectedBorrowAssets`, `expectedOnBehalf`, `expectedReceiver` | `maxBorrowSharesMinted`, `maxLtvAfterWad`, `minHealthFactorAfterWad`, `maxUtilizationAfterWad`, `maxBorrowApyAfterWad`, `maxReallocationPenaltyAssets` |
| `blueRepay` | `marketId` | `expectedOnBehalf`, `expectedFullClose` | `maxAssetsPaid`, `minBorrowSharesBurned`, `maxResidualBorrowShares`, `minRefundAssets` |
| `blueWithdrawCollateral` | `marketId` | `expectedAssets`, `expectedReceiver` | `maxLtvAfterWad`, `minHealthFactorAfterWad` |
| `blueRepayWithdrawCollateral` | `marketId` | `expectedWithdrawAssets`, `expectedOnBehalf`, `expectedReceiver`, `expectedFullClose` | `maxAssetsPaid`, `minBorrowSharesBurned`, `maxResidualBorrowShares`, `minRefundAssets`, `maxLtvAfterWad`, `minHealthFactorAfterWad` |
| `blueRefinance` | `sourceMarketId`, `targetMarketId` | `expectedSourceFullClose` | `maxTargetBorrowAssets`, `maxTargetBorrowSharesMinted`, `maxSourceResidualBorrowShares`, `maxTargetLtvAfterWad`, `minTargetHealthFactorAfterWad`, `maxLoanDustAssets`, `maxReallocationPenaltyAssets` |
| `blueAuthorization` | `authorized` | `expectedIsAuthorized` | — |
| `vaultV1Deposit` | `vault` | `expectedAssets`, `expectedReceiver` | `minSharesMinted` |
| `vaultV2Deposit` | `vault` | `expectedAssets`, `expectedReceiver` | `minSharesMinted` |
| `vaultV1Withdraw` | `vault` | `expectedAssets`, `expectedReceiver` | `maxSharesBurned` |
| `vaultV2Withdraw` | `vault` | `expectedAssets`, `expectedReceiver` | `maxSharesBurned` |
| `vaultV1Redeem` | `vault` | `expectedShares`, `expectedReceiver` | `minAssetsReceived` |
| `vaultV2Redeem` | `vault` | `expectedShares`, `expectedReceiver` | `minAssetsReceived` |
| `vaultV2ForceWithdraw` | `vault` | `expectedExitAssets`, `expectedAdapter` | `maxSharesBurned`, `minAssetsReceived`, `maxPenaltyAssets` |
| `vaultV2ForceRedeem` | `vault` | `expectedShares`, `expectedDeallocations` | `minAssetsReceived`, `maxPenaltyShares`, `maxPenaltyAssets` |
| `vaultV1InKindRedeem` | `vault` | `expectedAssets`, `expectedMarketIds` | `maxSharesBurned`, `minIdleAssetsReceived`, `minSupplyAssetsByMarket`, `maxPenaltyAssets`, `maxResidualShareAllowance` |
| `vaultV2InKindRedeem` | `vault` | `expectedAssets`, `expectedMarketIds` | `maxSharesBurned`, `minIdleAssetsReceived`, `minSupplyAssetsByMarket`, `maxPenaltyAssets`, `maxResidualShareAllowance` |
| `vaultV1MigrateToV2` | `sourceVault`, `targetVault` | `expectedAssets OR expectedShares`, `expectedReceiver` | `minTargetSharesMinted` |

`expectedDeallocations` preserves ordered `{ adapter, marketId?, amount }` records.
`expectedMarketIds` preserves market order. `minSupplyAssetsByMarket` contains
`{ marketId, minAssets }` records. Migration accepts at most one assets/shares pin.
Outcome records drop the min/max prefix (`minSharesMinted → sharesMinted`, etc.);
market credits become `supplyAssetsByMarket: { marketId, assets }[]`.
LTV, utilization and health outcomes use explicit risk states, not numeric infinity.

| Decoded recipe detail | Representation |
| --- | --- |
| Exact assets versus exact shares | `OperationAmount`; never both. Full-close flags are explicit; their truth must be established from calldata and pinned state. |
| ERC-20 versus native funding | `OperationFunding`; native names its wrapped token, and deposits exclude absent funding. |
| Signature/no-permit route | `OperationSignature` includes none and the three supported signatures, without exposing signature bytes. Vault share exits accept only none/ERC-2612. |
| Blue market binding | `MarketBinding.marketId, params`, reusing readonly InputMarketParams. |
| Reallocations | Ordered `OperationReallocation`: vault, idle/market source (adapter/market), target adapter/market, assets, penaltyWad. |
| Blue accounting and composites | Separate operation records carry supply/withdraw/borrow/collateral/repay amounts, funding, fullClose, maxRepayAssets, maxLtvWad, receiver/onBehalf, deadline and applicable reallocations. |
| Full refinance | Source/target markets, sourceFullClose: true, maxLtvWad, reallocations, onBehalf and Morpho authorization signature. There is no partial refinance variant. |
| Operator authorization | Morpho route, authorizer/authorized/isAuthorized, with a bundles or preLiquidation operator subject; the latter binds its market. |
| Ordinary vault operations | Vault/asset/receiver, funding or shares/assets, deadline, fee and applicable share-price bound. |
| V2 force withdraw | VaultExitBundlesV1, vault/asset/adapter, penalty-inclusive exitAssets, minSharePriceE27, receiver/onBehalf, deadline, fee and share permit. |
| V2 force redeem | VaultV2Multicall, ordered deallocations with decoded data, exact shares and receiver/onBehalf. |
| V1/V2 in-kind redeem | VaultExitBundlesV1, vault/asset, gross assets, every ordered market, onBehalf, deadline, share permit; V2 also names its adapter. |
| V1 → V2 migration | Source/target vault, asset, exclusive amount mode, receiver, maxTargetSharePriceE27, deadline, fee and source-share permit. |
| Unsupported routes | No Midnight, Bundler3, Aave migration, legacy wrapping or arbitrary-composition operation tags. Runtime decoding still rejects unknown recipes and callbacks. |

## Output and evidence coverage

| TIB output | Declaration / fields |
| --- | --- |
| Legacy result fields | `VerifiedSimulationResult extends SimulationResult`: simulationTxs, calls, transfers, assetChanges. The target semantics keep user-only calls and original transfers.txIdx; the existing runtime retains its prior behavior until cutover. |
| Mode/context | `SimulationVerification.mode`; `ExecutionContext.chainId, blockNumber, blockTimestamp` plus stateBlockNumber/stateBlockHash/stateBlockTimestamp to distinguish a node-generated execution block from the real state anchor. |
| Effective limits and operations | `verification.limits, operations`; each VerifiedOperation ties its decoded operation to the correct typed outcome. |
| Authorization request | `AuthorizationEvidence.authorizationIndex, request`; one entry per pending wallet request. Final mode has an empty tuple. |
| Request policy checks | `requestChecks.owner, binding, authority`; signature requests additionally domain/nonce/deadline; Permit2 additionally canonicalPermit2Allowance. All represent completed checks. |
| Preparation calls | `AuthorizationPreparation.type: approvalCalls`; ordered `calls[].transaction.{from,to,data,value}` and `result` (logs, status, returnData, gasUsed). No public txIdx. |
| Preparation override | `type: stateOverride, address, storageVariable, slot, value`; only allowance/isAuthorized storage, never code or signature nonce overrides. |
| Read-back | `AuthorizationReadBack.probe, expected, observed`; permission states and internal probe identities. |
| Snapshots | `verification.before, after` are complete VerificationSnapshot records; unchanged values are retained. |
| Total/action differences | `diff, actionDiff: VerificationDiff`; signed raw changes and explicit risk transitions. actionDiff excludes preparation and modeled accrual. |
| Wallet | account, token, assets; raw balances before/after and signed differences. |
| Permissions | ERC-20 token/owner/spender/amount; Morpho authorizer/authorized/isAuthorized; ERC-2612 and Morpho owner/verifyingContract/nonce; Permit2 owner/permit2/nonce/wordPosition/bitmap/consumed. |
| Intermediate permissions | `permissionEvidence.identity, changes, logs`; captures temporary grants/revokes and allowance consumption hidden by equal endpoints. |
| Positions | marketId, owner, supplyAssets/supplyShares, borrowAssets/borrowShares, collateralAssets, ltvWad, healthFactorWad. |
| Markets | market binding, total supply/borrow assets/shares, lastUpdate, feeWad, liquidityAssets, utilizationWad, borrowApyWad, oracle price/value scale, per-second borrow rate, applicable preLiquidation address/preLltvWad. |
| Vaults | vault/owner/asset, totalAssets/totalShares/ownerShares/idleAssets/sharePriceE27, performance fee/recipient, allocations; V1 lastTotalAssets; V2 management fee/recipient, rate cap, lastUpdate, recordedTotalAssets. |
| Allocations | adapter, optional marketId, assets/shares, absolute/relative caps, penaltyWad. Differences preserve every allocation's asset/share change. |
| Conversions | Operation identity, market/vault subject, assets/shares, quoted and actual E27 price, min/max E27 bounds, rounding direction. |
| Fees/penalties | Operation identity, referral/performance/management/exitPenalty/reallocationPenalty, token/recipient, rateWad, expectedAmount/observedAmount, assets/shares unit. |
| Missing/undefined metrics | EvidenceRead distinguishes present from missing (failedProbe/missingState/inconsistentReference); it is accepted only in PendingEvidence. Applicable records distinguish defined noOracle/noIrm/noPreLiquidation cases from missing data. |
| Debt-free/unbounded metrics | RiskMetric: finite valueWad, debtFree, or unbounded with zeroCollateral/zeroLiquidity reason. Complete results cannot contain missing evidence or fabricated zero defaults. |
| Internal call identity | ExecutionIdentity distinguishes transactionIndex, authorizationIndex/preparationCallIndex and probeId/phase (before/prepared/intermediate/after). ObservedSnapshot carries identity, checked context and complete snapshot. |

Array completeness, same-subject transitions, read-back equality, safe authorization amounts, final signature execution, real native funding, accrual, fees and accounting are **runtime obligations**, not claims proven by structural types. No evidence producer or verifier is implemented here.

## Error and stage coverage

Existing error classes and constructors are unchanged. `SimulationErrorCodes` accounts for the full catalog:

| Class | Code |
| --- | --- |
| `SimulationValidationError` | `VALIDATION_ERROR` |
| `UnsupportedChainError` | `UNSUPPORTED_CHAIN` |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` |
| `SimulationRevertedError` | `SIMULATION_REVERTED` |
| `BlacklistViolationError` | `BLACKLIST_ERROR` |
| `UnsupportedOperationError` | `UNSUPPORTED_OPERATION` |
| `ProtocolBindingMismatchError` | `PROTOCOL_BINDING_MISMATCH` |
| `UnsupportedVerificationFeatureError` | `UNSUPPORTED_VERIFICATION_FEATURE` |
| `InvalidSimulationResponseError` | `INVALID_SIMULATION_RESPONSE` |
| `MissingVerificationEvidenceError` | `MISSING_VERIFICATION_EVIDENCE` |
| `AuthorizationRequestMismatchError` | `AUTHORIZATION_REQUEST_MISMATCH` |
| `AssetChangeMismatchError` | `ASSET_CHANGE_MISMATCH` |
| `PermissionChangeMismatchError` | `PERMISSION_CHANGE_MISMATCH` |
| `StateChangeMismatchError` | `STATE_CHANGE_MISMATCH` |
| `MarketConstraintViolationError` | `MARKET_CONSTRAINT_VIOLATION` |
| `SlippageLimitExceededError` | `SLIPPAGE_LIMIT_EXCEEDED` |
| `FeeMismatchError` | `FEE_MISMATCH` |
| `ConsumerLimitViolationError` | `CONSUMER_LIMIT_VIOLATION` |
| `UnexpectedSimulationError` | `UNEXPECTED_SIMULATION_ERROR` |

| Error context / stage contract | Coverage |
| --- | --- |
| Legacy fields | Existing reason/details, fieldErrors and retention assetChanges.{address, token, netRetained} string amounts are preserved in errors.ts. Target transaction locations retain txIdx. |
| Common context | SimulationErrorContext: mode, stage, chainId, blockNumber/blockHash/blockTimestamp, operation, location, subject, comparison. Context is optional where unavailable; the stage is required. |
| Identity | Transaction txIdx/callPath, authorizationIndex/preparationCallIndex, or probeId; no preparation txIdx. |
| Subject | Wallet/token, allowance owner/token/spender, Morpho operator, market, source/target refinance, vault, migration, adapter, deployment. |
| Comparison | Fixed-unit expected/observed values: assets, shares, WAD, APY WAD, seconds, nonce, E27, address, boolean, market ID(s), deallocations, count. WAD observations may explicitly be debt-free/unbounded. No signatures, credentials or raw causes. |
| Consumer failure | ConsumerConstraintContext couples operation and applicable expected/min/max field; wallet failures carry maxDebit/minCredit, account/token, boundAssets and observedAssets. |
| Stages | validation, decoding, pinnedReads, authorization, preparation, execution, evidence, verification, limits. |
| Pure contracts | parseRequest → ParsedRequest; decodeAndBind → DecodedBundle; checkRequests → ValidatedAuthorizations; planExecution → ExecutionPlan; parseEvidence → CompleteEvidence; verifyEffects → VerifiedEffects; enforceLimits → ConstrainedEffects; assembleResult → VerifiedSimulationResult. |
| I/O contracts | readPinnedInputs returns Promise<PinnedInputs>; executePlan returns Promise<unknown>. Parsing and verification cannot treat that unknown as evidence. |
| Refinements | A private unique-symbol stage brand prevents unchecked structural assignment to parsed/pinned/complete/constrained records. Constructors arrive with their checking implementations. No brand is required in consumer inputs. |

## Validation and remaining work

Colocated tests cover all five authorization tags, exact EIP-712 schema/message relationships,
mode exclusion, all operation-category key sets, fixed-unit bigint fields, route/amount constraints,
deep readonly properties, separate identities, missing evidence and stage refinements, and the
existing five error codes. Compiler fixtures must emit the expected diagnostics for final
authorizations, PermitSingle, wrong limit fields, incorrect typed-data schemas, mutable output
writes/arrays and incomplete results; no suppression directives are used.

No onchain behavior changed, so this PR adds no fork fixtures. SDK-1293 owns runtime parsing,
error implementations and public cutover; SDK-1294 owns requirement/calldata parsing; SDK-1295
owns evidence and effect checks; SDK-1296 owns constraint enforcement and final result assembly.
Their state-dependent paths require pinned forks. SDK-1297 promotes the complete stack.
There are no direct workspace runtime/peer dependents of evm-simulation to bump, and no
morpho-sdk facade category exposes this package.
