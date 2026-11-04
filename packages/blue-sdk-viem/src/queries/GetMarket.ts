/** @internal Deployless `GetMarket` query ABI. */
export const abi = [
  {
    inputs: [
      {
        internalType: "contract IMorpho",
        name: "morpho",
        type: "address",
      },
      {
        internalType: "Id",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "contract IAdaptiveCurveIrm",
        name: "adaptiveCurveIrm",
        type: "address",
      },
    ],
    name: "query",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "loanToken",
                type: "address",
              },
              {
                internalType: "address",
                name: "collateralToken",
                type: "address",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
              {
                internalType: "address",
                name: "irm",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lltv",
                type: "uint256",
              },
            ],
            internalType: "struct MarketParams",
            name: "marketParams",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint128",
                name: "totalSupplyAssets",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "totalSupplyShares",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "totalBorrowAssets",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "totalBorrowShares",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "lastUpdate",
                type: "uint128",
              },
              {
                internalType: "uint128",
                name: "fee",
                type: "uint128",
              },
            ],
            internalType: "struct Market",
            name: "market",
            type: "tuple",
          },
          {
            internalType: "bool",
            name: "hasPrice",
            type: "bool",
          },
          {
            internalType: "uint256",
            name: "price",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rateAtTarget",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "deadSupplyShares",
            type: "uint256",
          },
        ],
        internalType: "struct MarketResponse",
        name: "res",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** @internal Deployless `GetMarket` query bytecode. */
export const code =
  "0x608080604052346015576105b0908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c63d8f172c414610025575f80fd5b346102ca5760603660031901126102ca576004356001600160a01b03811691908290036102ca576044356001600160a01b0381169290602435908490036102ca5761006f836104f8565b60405161007b81610514565b5f81525f60208201525f60408201525f60608201525f60808201528352602083016040516100a8816104f8565b5f81525f60208201525f60408201525f60608201525f60808201525f60a08201528152604084015f815260608501915f835260808601935f855260a08701955f8752604051632c3c915760e01b815282600482015260a081602481855afa9081156102d6575f91610473575b508852604051632e3071cd60e11b81526004810183905260c081602481855afa9081156102d6575f916103d0575b506044916060918552604051928380926349e2903160e11b825286600483015261dead60248301525afa9081156102d6575f91610347575b505186528651604001516001600160a01b0316806102e1575b508651606001516001600160a01b03168814610263575b5060408051965180516001600160a01b0390811689526020808301518216818b01528284015182168a850152606080840151909216828b01526080928301518a840152935180516001600160801b0390811660a08c81019190915295820151811660c08c015293810151841660e08b01529081015183166101008a0152908101518216610120890152909101511661014086015251151561016085015251610180840152516101a0830152516101c08201526101e09150f35b6020906024604051809a81936301977b5760e01b835260048301525afa9687156102d6575f9761029d575b509583526101e09560a06101aa565b96506020873d6020116102ce575b816102b860209383610530565b810103126102ca5795519560a061028e565b5f80fd5b3d91506102ab565b6040513d5f823e3d90fd5b60206004916040519283809263501ad8ff60e11b82525afa5f9181610313575b5015610193576001845284525f610193565b9091506020813d60201161033f575b8161032f60209383610530565b810103126102ca5751905f610301565b3d9150610322565b90506060813d6060116103c8575b8161036260609383610530565b810103126102ca57604051906060820182811067ffffffffffffffff8211176103b4576103a99160409182528051845261039e60208201610566565b602085015201610566565b60408201525f61017a565b634e487b7160e01b5f52604160045260245ffd5b3d9150610355565b905060c0813d60c01161046b575b816103eb60c09383610530565b810103126102ca5760449160609161045e60a06040519261040b846104f8565b61041481610566565b845261042260208201610566565b602085015261043360408201610566565b6040850152610443868201610566565b8685015261045360808201610566565b608085015201610566565b60a0820152915091610142565b3d91506103de565b905060a0813d60a0116104f0575b8161048e60a09383610530565b810103126102ca576080604051916104a583610514565b6104ae81610552565b83526104bc60208201610552565b60208401526104cd60408201610552565b60408401526104de60608201610552565b6060840152015160808201525f610114565b3d9150610481565b60c0810190811067ffffffffffffffff8211176103b457604052565b60a0810190811067ffffffffffffffff8211176103b457604052565b90601f8019910116810190811067ffffffffffffffff8211176103b457604052565b51906001600160a01b03821682036102ca57565b51906001600160801b03821682036102ca5756fea2646970667358221220f012b675aba0ffdbfa645e2db92d0c4ba4dd1efc461a149150cb0a4da01e8a3864736f6c63430008240033";
