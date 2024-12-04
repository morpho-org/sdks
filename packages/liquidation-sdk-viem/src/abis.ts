export const curveStableSwapNGAbi = [
  {
    name: "Transfer",
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
      },
      {
        name: "receiver",
        type: "address",
        indexed: true,
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "Approval",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
      },
      {
        name: "spender",
        type: "address",
        indexed: true,
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "TokenExchange",
    inputs: [
      {
        name: "buyer",
        type: "address",
        indexed: true,
      },
      {
        name: "sold_id",
        type: "int128",
        indexed: false,
      },
      {
        name: "tokens_sold",
        type: "uint256",
        indexed: false,
      },
      {
        name: "bought_id",
        type: "int128",
        indexed: false,
      },
      {
        name: "tokens_bought",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "TokenExchangeUnderlying",
    inputs: [
      {
        name: "buyer",
        type: "address",
        indexed: true,
      },
      {
        name: "sold_id",
        type: "int128",
        indexed: false,
      },
      {
        name: "tokens_sold",
        type: "uint256",
        indexed: false,
      },
      {
        name: "bought_id",
        type: "int128",
        indexed: false,
      },
      {
        name: "tokens_bought",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "AddLiquidity",
    inputs: [
      {
        name: "provider",
        type: "address",
        indexed: true,
      },
      {
        name: "token_amounts",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "fees",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "invariant",
        type: "uint256",
        indexed: false,
      },
      {
        name: "token_supply",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "RemoveLiquidity",
    inputs: [
      {
        name: "provider",
        type: "address",
        indexed: true,
      },
      {
        name: "token_amounts",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "fees",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "token_supply",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "RemoveLiquidityOne",
    inputs: [
      {
        name: "provider",
        type: "address",
        indexed: true,
      },
      {
        name: "token_id",
        type: "int128",
        indexed: false,
      },
      {
        name: "token_amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "coin_amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "token_supply",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "RemoveLiquidityImbalance",
    inputs: [
      {
        name: "provider",
        type: "address",
        indexed: true,
      },
      {
        name: "token_amounts",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "fees",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "invariant",
        type: "uint256",
        indexed: false,
      },
      {
        name: "token_supply",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "RampA",
    inputs: [
      {
        name: "old_A",
        type: "uint256",
        indexed: false,
      },
      {
        name: "new_A",
        type: "uint256",
        indexed: false,
      },
      {
        name: "initial_time",
        type: "uint256",
        indexed: false,
      },
      {
        name: "future_time",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "StopRampA",
    inputs: [
      {
        name: "A",
        type: "uint256",
        indexed: false,
      },
      {
        name: "t",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "ApplyNewFee",
    inputs: [
      {
        name: "fee",
        type: "uint256",
        indexed: false,
      },
      {
        name: "offpeg_fee_multiplier",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    name: "SetNewMATime",
    inputs: [
      {
        name: "ma_exp_time",
        type: "uint256",
        indexed: false,
      },
      {
        name: "D_ma_time",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
    type: "event",
  },
  {
    stateMutability: "nonpayable",
    type: "constructor",
    inputs: [
      {
        name: "_name",
        type: "string",
      },
      {
        name: "_symbol",
        type: "string",
      },
      {
        name: "_A",
        type: "uint256",
      },
      {
        name: "_fee",
        type: "uint256",
      },
      {
        name: "_offpeg_fee_multiplier",
        type: "uint256",
      },
      {
        name: "_ma_exp_time",
        type: "uint256",
      },
      {
        name: "_coins",
        type: "address[]",
      },
      {
        name: "_rate_multipliers",
        type: "uint256[]",
      },
      {
        name: "_asset_types",
        type: "uint8[]",
      },
      {
        name: "_method_ids",
        type: "bytes4[]",
      },
      {
        name: "_oracles",
        type: "address[]",
      },
    ],
    outputs: [],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "exchange",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
      {
        name: "_dx",
        type: "uint256",
      },
      {
        name: "_min_dy",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "exchange",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
      {
        name: "_dx",
        type: "uint256",
      },
      {
        name: "_min_dy",
        type: "uint256",
      },
      {
        name: "_receiver",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "exchange_received",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
      {
        name: "_dx",
        type: "uint256",
      },
      {
        name: "_min_dy",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "exchange_received",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
      {
        name: "_dx",
        type: "uint256",
      },
      {
        name: "_min_dy",
        type: "uint256",
      },
      {
        name: "_receiver",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "add_liquidity",
    inputs: [
      {
        name: "_amounts",
        type: "uint256[]",
      },
      {
        name: "_min_mint_amount",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "add_liquidity",
    inputs: [
      {
        name: "_amounts",
        type: "uint256[]",
      },
      {
        name: "_min_mint_amount",
        type: "uint256",
      },
      {
        name: "_receiver",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity_one_coin",
    inputs: [
      {
        name: "_burn_amount",
        type: "uint256",
      },
      {
        name: "i",
        type: "int128",
      },
      {
        name: "_min_received",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity_one_coin",
    inputs: [
      {
        name: "_burn_amount",
        type: "uint256",
      },
      {
        name: "i",
        type: "int128",
      },
      {
        name: "_min_received",
        type: "uint256",
      },
      {
        name: "_receiver",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity_imbalance",
    inputs: [
      {
        name: "_amounts",
        type: "uint256[]",
      },
      {
        name: "_max_burn_amount",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity_imbalance",
    inputs: [
      {
        name: "_amounts",
        type: "uint256[]",
      },
      {
        name: "_max_burn_amount",
        type: "uint256",
      },
      {
        name: "_receiver",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity",
    inputs: [
      {
        name: "_burn_amount",
        type: "uint256",
      },
      {
        name: "_min_amounts",
        type: "uint256[]",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256[]",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity",
    inputs: [
      {
        name: "_burn_amount",
        type: "uint256",
      },
      {
        name: "_min_amounts",
        type: "uint256[]",
      },
      {
        name: "_receiver",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256[]",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "remove_liquidity",
    inputs: [
      {
        name: "_burn_amount",
        type: "uint256",
      },
      {
        name: "_min_amounts",
        type: "uint256[]",
      },
      {
        name: "_receiver",
        type: "address",
      },
      {
        name: "_claim_admin_fees",
        type: "bool",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256[]",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "withdraw_admin_fees",
    inputs: [],
    outputs: [],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "last_price",
    inputs: [
      {
        name: "i",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "ema_price",
    inputs: [
      {
        name: "i",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "get_p",
    inputs: [
      {
        name: "i",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "price_oracle",
    inputs: [
      {
        name: "i",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "D_oracle",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "transfer",
    inputs: [
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "transferFrom",
    inputs: [
      {
        name: "_from",
        type: "address",
      },
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "_spender",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "permit",
    inputs: [
      {
        name: "_owner",
        type: "address",
      },
      {
        name: "_spender",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
      {
        name: "_deadline",
        type: "uint256",
      },
      {
        name: "_v",
        type: "uint8",
      },
      {
        name: "_r",
        type: "bytes32",
      },
      {
        name: "_s",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "get_dx",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
      {
        name: "dy",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "get_dy",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
      {
        name: "dx",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "calc_withdraw_one_coin",
    inputs: [
      {
        name: "_burn_amount",
        type: "uint256",
      },
      {
        name: "i",
        type: "int128",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "get_virtual_price",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "calc_token_amount",
    inputs: [
      {
        name: "_amounts",
        type: "uint256[]",
      },
      {
        name: "_is_deposit",
        type: "bool",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "A",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "A_precise",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "balances",
    inputs: [
      {
        name: "i",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "get_balances",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256[]",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "stored_rates",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256[]",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "dynamic_fee",
    inputs: [
      {
        name: "i",
        type: "int128",
      },
      {
        name: "j",
        type: "int128",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "ramp_A",
    inputs: [
      {
        name: "_future_A",
        type: "uint256",
      },
      {
        name: "_future_time",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "stop_ramp_A",
    inputs: [],
    outputs: [],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "set_new_fee",
    inputs: [
      {
        name: "_new_fee",
        type: "uint256",
      },
      {
        name: "_new_offpeg_fee_multiplier",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "set_ma_exp_time",
    inputs: [
      {
        name: "_ma_exp_time",
        type: "uint256",
      },
      {
        name: "_D_ma_time",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "N_COINS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "coins",
    inputs: [
      {
        name: "arg0",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "fee",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "offpeg_fee_multiplier",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "admin_fee",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "initial_A",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "future_A",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "initial_A_time",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "future_A_time",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "admin_balances",
    inputs: [
      {
        name: "arg0",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "ma_exp_time",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "D_ma_time",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "ma_last_time",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "version",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "arg0",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "allowance",
    inputs: [
      {
        name: "arg0",
        type: "address",
      },
      {
        name: "arg1",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "nonces",
    inputs: [
      {
        name: "arg0",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    stateMutability: "view",
    type: "function",
    name: "salt",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
      },
    ],
  },
] as const;

export const sUsdsAbi = [
  {
    inputs: [
      { internalType: "address", name: "usdsJoin_", type: "address" },
      { internalType: "address", name: "vow_", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [{ internalType: "address", name: "target", type: "address" }],
    name: "AddressEmptyCode",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "implementation", type: "address" },
    ],
    name: "ERC1967InvalidImplementation",
    type: "error",
  },
  { inputs: [], name: "ERC1967NonPayable", type: "error" },
  { inputs: [], name: "FailedInnerCall", type: "error" },
  { inputs: [], name: "InvalidInitialization", type: "error" },
  { inputs: [], name: "NotInitializing", type: "error" },
  { inputs: [], name: "UUPSUnauthorizedCallContext", type: "error" },
  {
    inputs: [{ internalType: "bytes32", name: "slot", type: "bytes32" }],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "usr",
        type: "address",
      },
    ],
    name: "Deny",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "assets",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "shares",
        type: "uint256",
      },
    ],
    name: "Deposit",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "chi",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "diff",
        type: "uint256",
      },
    ],
    name: "Drip",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "what",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "data",
        type: "uint256",
      },
    ],
    name: "File",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64",
      },
    ],
    name: "Initialized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint16",
        name: "referral",
        type: "uint16",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "assets",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "shares",
        type: "uint256",
      },
    ],
    name: "Referral",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "usr",
        type: "address",
      },
    ],
    name: "Rely",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address",
      },
    ],
    name: "Upgraded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "assets",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "shares",
        type: "uint256",
      },
    ],
    name: "Withdraw",
    type: "event",
  },
  {
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PERMIT_TYPEHASH",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "chi",
    outputs: [{ internalType: "uint192", name: "", type: "uint192" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    name: "convertToAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    name: "convertToShares",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "usr", type: "address" }],
    name: "deny",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "assets", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "assets", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "uint16", name: "referral", type: "uint16" },
    ],
    name: "deposit",
    outputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "drip",
    outputs: [{ internalType: "uint256", name: "nChi", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "what", type: "bytes32" },
      { internalType: "uint256", name: "data", type: "uint256" },
    ],
    name: "file",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getImplementation",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "maxDeposit",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "maxMint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "maxRedeem",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "maxWithdraw",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "uint16", name: "referral", type: "uint16" },
    ],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
    ],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "nonces",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    name: "previewDeposit",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    name: "previewMint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    name: "previewRedeem",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    name: "previewWithdraw",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "address", name: "owner", type: "address" },
    ],
    name: "redeem",
    outputs: [{ internalType: "uint256", name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "usr", type: "address" }],
    name: "rely",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "rho",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "ssr",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address",
      },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "usds",
    outputs: [{ internalType: "contract UsdsLike", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "usdsJoin",
    outputs: [
      { internalType: "contract UsdsJoinLike", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "vat",
    outputs: [{ internalType: "contract VatLike", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "version",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "vow",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "wards",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "assets", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "address", name: "owner", type: "address" },
    ],
    name: "withdraw",
    outputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const mkrSkyConverterAbi = [
  {
    inputs: [
      { internalType: "address", name: "mkr_", type: "address" },
      { internalType: "address", name: "sky_", type: "address" },
      { internalType: "uint256", name: "rate_", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      { indexed: true, internalType: "address", name: "usr", type: "address" },
      {
        indexed: false,
        internalType: "uint256",
        name: "mkrAmt",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "skyAmt",
        type: "uint256",
      },
    ],
    name: "MkrToSky",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      { indexed: true, internalType: "address", name: "usr", type: "address" },
      {
        indexed: false,
        internalType: "uint256",
        name: "skyAmt",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "mkrAmt",
        type: "uint256",
      },
    ],
    name: "SkyToMkr",
    type: "event",
  },
  {
    inputs: [],
    name: "mkr",
    outputs: [{ internalType: "contract GemLike", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "usr", type: "address" },
      { internalType: "uint256", name: "mkrAmt", type: "uint256" },
    ],
    name: "mkrToSky",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "rate",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "sky",
    outputs: [{ internalType: "contract GemLike", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "usr", type: "address" },
      { internalType: "uint256", name: "skyAmt", type: "uint256" },
    ],
    name: "skyToMkr",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const daiUsdsConverterAbi = [
  {
    inputs: [
      { internalType: "address", name: "daiJoin_", type: "address" },
      { internalType: "address", name: "usdsJoin_", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      { indexed: true, internalType: "address", name: "usr", type: "address" },
      { indexed: false, internalType: "uint256", name: "wad", type: "uint256" },
    ],
    name: "DaiToUsds",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      { indexed: true, internalType: "address", name: "usr", type: "address" },
      { indexed: false, internalType: "uint256", name: "wad", type: "uint256" },
    ],
    name: "UsdsToDai",
    type: "event",
  },
  {
    inputs: [],
    name: "dai",
    outputs: [{ internalType: "contract GemLike", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "daiJoin",
    outputs: [
      { internalType: "contract DaiJoinLike", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "usr", type: "address" },
      { internalType: "uint256", name: "wad", type: "uint256" },
    ],
    name: "daiToUsds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "usds",
    outputs: [{ internalType: "contract GemLike", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "usdsJoin",
    outputs: [
      { internalType: "contract UsdsJoinLike", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "usr", type: "address" },
      { internalType: "uint256", name: "wad", type: "uint256" },
    ],
    name: "usdsToDai",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const preLiquidationFactoryAbi = [
  {
    type: "constructor",
    inputs: [{ name: "morpho", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "MORPHO",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IMorpho" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createPreLiquidation",
    inputs: [
      { name: "id", type: "bytes32", internalType: "Id" },
      {
        name: "preLiquidationParams",
        type: "tuple",
        internalType: "struct PreLiquidationParams",
        components: [
          { name: "preLltv", type: "uint256", internalType: "uint256" },
          { name: "preLCF1", type: "uint256", internalType: "uint256" },
          { name: "preLCF2", type: "uint256", internalType: "uint256" },
          { name: "preLIF1", type: "uint256", internalType: "uint256" },
          { name: "preLIF2", type: "uint256", internalType: "uint256" },
          {
            name: "preLiquidationOracle",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPreLiquidation",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isPreLiquidation",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CreatePreLiquidation",
    inputs: [
      {
        name: "preLiquidation",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "id",
        type: "bytes32",
        indexed: false,
        internalType: "Id",
      },
      {
        name: "preLiquidationParams",
        type: "tuple",
        indexed: false,
        internalType: "struct PreLiquidationParams",
        components: [
          { name: "preLltv", type: "uint256", internalType: "uint256" },
          { name: "preLCF1", type: "uint256", internalType: "uint256" },
          { name: "preLCF2", type: "uint256", internalType: "uint256" },
          { name: "preLIF1", type: "uint256", internalType: "uint256" },
          { name: "preLIF2", type: "uint256", internalType: "uint256" },
          {
            name: "preLiquidationOracle",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
] as const;

export const preLiquidationAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "morpho", type: "address", internalType: "address" },
      { name: "id", type: "bytes32", internalType: "Id" },
      {
        name: "_preLiquidationParams",
        type: "tuple",
        internalType: "struct PreLiquidationParams",
        components: [
          { name: "preLltv", type: "uint256", internalType: "uint256" },
          { name: "preLCF1", type: "uint256", internalType: "uint256" },
          { name: "preLCF2", type: "uint256", internalType: "uint256" },
          { name: "preLIF1", type: "uint256", internalType: "uint256" },
          { name: "preLIF2", type: "uint256", internalType: "uint256" },
          {
            name: "preLiquidationOracle",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ID",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "Id" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MORPHO",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IMorpho" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "marketParams",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct MarketParams",
        components: [
          {
            name: "loanToken",
            type: "address",
            internalType: "address",
          },
          {
            name: "collateralToken",
            type: "address",
            internalType: "address",
          },
          { name: "oracle", type: "address", internalType: "address" },
          { name: "irm", type: "address", internalType: "address" },
          { name: "lltv", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "onMorphoRepay",
    inputs: [
      {
        name: "repaidAssets",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "callbackData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "preLiquidate",
    inputs: [
      { name: "borrower", type: "address", internalType: "address" },
      {
        name: "seizedAssets",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "repaidShares",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
      { name: "", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "preLiquidationParams",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct PreLiquidationParams",
        components: [
          { name: "preLltv", type: "uint256", internalType: "uint256" },
          { name: "preLCF1", type: "uint256", internalType: "uint256" },
          { name: "preLCF2", type: "uint256", internalType: "uint256" },
          { name: "preLIF1", type: "uint256", internalType: "uint256" },
          { name: "preLIF2", type: "uint256", internalType: "uint256" },
          {
            name: "preLiquidationOracle",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PreLiquidate",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        indexed: true,
        internalType: "Id",
      },
      {
        name: "liquidator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "borrower",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "repaidAssets",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "repaidShares",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "seizedAssets",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "InconsistentInput", inputs: [] },
  { type: "error", name: "LiquidatablePosition", inputs: [] },
  { type: "error", name: "NonexistentMarket", inputs: [] },
  { type: "error", name: "NotMorpho", inputs: [] },
  { type: "error", name: "NotPreLiquidatablePosition", inputs: [] },
  { type: "error", name: "PreLCFDecreasing", inputs: [] },
  { type: "error", name: "PreLCFTooHigh", inputs: [] },
  { type: "error", name: "PreLIFDecreasing", inputs: [] },
  { type: "error", name: "PreLIFTooHigh", inputs: [] },
  { type: "error", name: "PreLIFTooLow", inputs: [] },
  {
    type: "error",
    name: "PreLiquidationTooLarge",
    inputs: [
      {
        name: "repaidShares",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "repayableShares",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  { type: "error", name: "PreLltvTooHigh", inputs: [] },
] as const;
