export const abi = [
  {
    inputs: [
      {
        internalType: "contract IMorpho",
        name: "morpho",
        type: "address",
      },
      { internalType: "Id", name: "id", type: "bytes32" },
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
              { internalType: "address", name: "irm", type: "address" },
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
              { internalType: "uint128", name: "fee", type: "uint128" },
            ],
            internalType: "struct Market",
            name: "market",
            type: "tuple",
          },
          { internalType: "uint256", name: "price", type: "uint256" },
          {
            internalType: "uint256",
            name: "rateAtTarget",
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

export const code =
  "0x608080604052346015576104f3908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c63d8f172c414610025575f80fd5b34610285576060366003190112610285576004356001600160a01b0381169190829003610285576044356001600160a01b038116929060243590849003610285576080830183811067ffffffffffffffff8211176104275760405260405161008c8161043b565b5f81525f60208201525f60408201525f60608201525f60808201528352602083016040516100b981610457565b5f81525f60208201525f60408201525f60608201525f60808201525f60a0820152815260408401915f835260608501935f8552604051632c3c915760e01b815282600482015260a081602481855afa908115610291575f9161039a575b5060249160c091885260405192838092632e3071cd60e11b82528660048301525afa908115610291575f916102fd575b5082528451604001516001600160a01b03168061029c575b508451606001516001600160a01b0316861461021e575b5060408051945180516001600160a01b039081168752602080830151821681890152828401518216888501526060808401519092168289015260809283015188840152935180516001600160801b0390811660a08a81019190915295820151811660c08a015293810151841660e0890152908101518316610100880152908101518216610120870152909101511661014084015251610160830152516101808201526101a09150f35b6020906024604051809881936301977b5760e01b835260048301525afa948515610291575f95610258575b509382526101a09360a0610175565b94506020853d602011610289575b8161027360209383610473565b810103126102855793519360a0610249565b5f80fd5b3d9150610266565b6040513d5f823e3d90fd5b60206004916040519283809263501ad8ff60e11b82525afa908115610291575f916102cb575b5083525f61015e565b90506020813d6020116102f5575b816102e660209383610473565b8101031261028557515f6102c2565b3d91506102d9565b905060c0813d60c011610392575b8161031860c09383610473565b810103126102855761038760a06040519261033284610457565b61033b816104a9565b8452610349602082016104a9565b602085015261035a604082016104a9565b604085015261036b606082016104a9565b606085015261037c608082016104a9565b6080850152016104a9565b60a08201525f610146565b3d915061030b565b905060a0813d60a01161041f575b816103b560a09383610473565b810103126102855760249160c0916080604051916103d28361043b565b6103db81610495565b83526103e960208201610495565b60208401526103fa60408201610495565b604084015261040b60608201610495565b606084015201516080820152915091610116565b3d91506103a8565b634e487b7160e01b5f52604160045260245ffd5b60a0810190811067ffffffffffffffff82111761042757604052565b60c0810190811067ffffffffffffffff82111761042757604052565b90601f8019910116810190811067ffffffffffffffff82111761042757604052565b51906001600160a01b038216820361028557565b51906001600160801b03821682036102855756fea2646970667358221220efd9cf742cd33c184d8626f47b0484ddcb653e36af9a97223b2dc7be37846d8164736f6c634300081b0033";
