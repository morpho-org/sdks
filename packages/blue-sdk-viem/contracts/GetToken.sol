// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20Permit} from "./interfaces/IERC20Permit.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IWstEth} from "./interfaces/IWstEth.sol";

struct Eip712Domain {
    string name;
    string version;
    address verifyingContract;
    uint256 chainId;
}

struct TokenResponse {
    uint256 decimals;
    bool hasSymbol;
    string symbol;
    bool hasName;
    string name;
    uint256 stEthPerWstEth;
    Eip712Domain eip712Domain;
    bool hasEip712Domain;
}

contract GetToken {
    function query(IERC20 token, bool isWstEth) external view returns (TokenResponse memory res) {
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

        if (isWstEth) res.stEthPerWstEth = IWstEth(address(token)).stEthPerToken();

        try IERC20Permit(address(token)).eip712Domain() returns (
            bytes1 /* fields */,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 /* salt */,
            uint256[] memory /* extensions */
        ) {
            res.hasEip712Domain = true;
            res.eip712Domain = Eip712Domain({
                name: name,
                version: version,
                verifyingContract: verifyingContract,
                chainId: chainId
            });
        } catch {}
    }
}
