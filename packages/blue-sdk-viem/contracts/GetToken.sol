// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit, Eip5267Domain} from "./interfaces/IERC20Permit.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IWstEth} from "./interfaces/IWstEth.sol";

struct TokenResponse {
    uint256 decimals;
    bool hasSymbol;
    string symbol;
    bool hasName;
    string name;
    uint256 stEthPerWstEth;
    Eip5267Domain eip5267Domain;
    bool hasEip5267Domain;
}

contract GetToken {
    function query(IERC20 token, address wstEth) external view returns (TokenResponse memory res) {
        try token.name() returns (string memory name) {
            res.hasName = true;
            res.name = name;
        } catch {}

        try token.symbol() returns (string memory symbol) {
            res.hasSymbol = true;
            res.symbol = symbol;
        } catch {}

        try token.decimals() returns (uint8 decimals) {
            res.decimals = decimals;
        } catch {}

        if (wstEth != address(0) && address(token) == wstEth) {
            res.stEthPerWstEth = IWstEth(address(token)).stEthPerToken();
        }

        try IERC20Permit(address(token)).eip712Domain() returns (Eip5267Domain memory eip5267Domain) {
            res.hasEip5267Domain = true;
            res.eip5267Domain = eip5267Domain;
        } catch {}
    }
}
