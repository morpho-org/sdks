// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit, Eip5267Domain} from "./interfaces/IERC20Permit.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IWstEth} from "./interfaces/IWstEth.sol";
import {TokenResponse} from "./GetToken.sol";

contract GetTokens {
    function query(IERC20[] calldata tokens, address wstEth) external view returns (TokenResponse[] memory res) {
        uint256 nbTokens = tokens.length;

        res = new TokenResponse[](nbTokens);

        for (uint256 i = 0; i < nbTokens; i++) {
            IERC20 token = tokens[i];
            TokenResponse memory resI = res[i];

            try token.name() returns (string memory name) {
                resI.hasName = true;
                resI.name = name;
            } catch {}

            try token.symbol() returns (string memory symbol) {
                resI.hasSymbol = true;
                resI.symbol = symbol;
            } catch {}

            try token.decimals() returns (uint8 decimals) {
                resI.decimals = decimals;
            } catch {}

            if (wstEth != address(0) && address(token) == wstEth) {
                resI.stEthPerWstEth = IWstEth(address(token)).stEthPerToken();
            }

            try IERC20Permit(address(token)).eip712Domain() returns (Eip5267Domain memory eip5267Domain) {
                resI.hasEip5267Domain = true;
                resI.eip5267Domain = eip5267Domain;
            } catch {}
        }
    }
}
