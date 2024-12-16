/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  AddressLike,
  BaseContract,
  BigNumberish,
  BytesLike,
  ContractMethod,
  ContractRunner,
  FunctionFragment,
  Interface,
  Listener,
  Result,
} from "ethers";
import type {
  TypedContractEvent,
  TypedContractMethod,
  TypedDeferredTopicFilter,
  TypedEventLog,
  TypedListener,
} from "./common";

export type TokenAmountStruct = { token: AddressLike; amount: BigNumberish };

export type TokenAmountStructOutput = [token: string, amount: bigint] & {
  token: string;
  amount: bigint;
};

export interface SwapMockInterface extends Interface {
  getFunction(nameOrSignature: "swap"): FunctionFragment;

  encodeFunctionData(
    functionFragment: "swap",
    values: [TokenAmountStruct, TokenAmountStruct],
  ): string;

  decodeFunctionResult(functionFragment: "swap", data: BytesLike): Result;
}

export interface SwapMock extends BaseContract {
  connect(runner?: ContractRunner | null): SwapMock;
  waitForDeployment(): Promise<this>;

  interface: SwapMockInterface;

  queryFilter<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined,
  ): Promise<Array<TypedEventLog<TCEvent>>>;
  queryFilter<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined,
  ): Promise<Array<TypedEventLog<TCEvent>>>;

  on<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>,
  ): Promise<this>;
  on<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>,
  ): Promise<this>;

  once<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>,
  ): Promise<this>;
  once<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>,
  ): Promise<this>;

  listeners<TCEvent extends TypedContractEvent>(
    event: TCEvent,
  ): Promise<Array<TypedListener<TCEvent>>>;
  listeners(eventName?: string): Promise<Array<Listener>>;
  removeAllListeners<TCEvent extends TypedContractEvent>(
    event?: TCEvent,
  ): Promise<this>;

  swap: TypedContractMethod<
    [input: TokenAmountStruct, output: TokenAmountStruct],
    [void],
    "nonpayable"
  >;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment,
  ): T;

  getFunction(
    nameOrSignature: "swap",
  ): TypedContractMethod<
    [input: TokenAmountStruct, output: TokenAmountStruct],
    [void],
    "nonpayable"
  >;

  filters: {};
}