// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20} from "./interfaces/IERC20.sol";
import {IWstEth} from "./interfaces/IWstEth.sol";

struct TokenResponse {
    uint256 decimals;
    string symbol;
    string name;
    uint256 stEthPerWstEth;
}

contract GetToken {
    function query(IERC20 token, bool isWstEth) external view returns (TokenResponse memory res) {
        res.decimals = token.decimals();
        res.symbol = token.symbol();
        res.name = token.name();

        if (isWstEth) res.stEthPerWstEth = IWstEth(address(token)).stEthPerToken();
    }
}
