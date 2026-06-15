export const abi = [
  {
    inputs: [
      {
        internalType: "contract IMidnight",
        name: "midnight",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "id",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "group",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "timeToMaturity",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "fetchSettlementFee",
        type: "bool",
      },
    ],
    name: "query",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "consumed",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "settlementFee",
            type: "uint256",
          },
        ],
        internalType: "struct ConsumableUnitsInputsResponse",
        name: "res",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const code =
  "0x608080604052346015576101fe908161001a8239f35b5f80fdfe6080806040526004361015610012575f80fd5b5f3560e01c630bf993b614610025575f80fd5b346101495760c0366003190112610149576004356001600160a01b0381169190829003610149576044356001600160a01b038116908190036101495760a4358015158103610149576040830183811067ffffffffffffffff821117610192576040525f835260208301915f835260405190631c53bf7560e31b825260048201526064356024820152602081604481885afa908115610155575f91610160575b5083526100de575b60408093505191518252516020820152f35b60206044936040519485809263a9bef80960e01b8252602435600483015260843560248301525afa8015610155575f9061011e575b6040935081526100cc565b506020833d60201161014d575b81610138602093836101a6565b810103126101495760409251610113565b5f80fd5b3d915061012b565b6040513d5f823e3d90fd5b90506020813d60201161018a575b8161017b602093836101a6565b8101031261014957515f6100c4565b3d915061016e565b634e487b7160e01b5f52604160045260245ffd5b90601f8019910116810190811067ffffffffffffffff8211176101925760405256fea2646970667358221220de7ffcae328b6f4739d5118986cd5a9668e18f78ac368629050008a4adccc74964736f6c63430008230033";
