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

        // Work around a Solidity via-IR decoding regression hit by valid EIP-5267 domains
        // such as Treehouse ETH (tETH) on mainnet. Decoding the raw returndata locally avoids
        // the deployless helper revert while preserving the same returned shape.
        (bool success, bytes memory returnData) = address(token).staticcall(abi.encodeCall(IERC20Permit.eip712Domain, ()));
        if (success) {
            (
                bytes1 fields,
                string memory name,
                string memory version,
                uint256 chainId,
                address verifyingContract,
                bytes32 salt,
                uint256[] memory extensions
            ) = abi.decode(returnData, (bytes1, string, string, uint256, address, bytes32, uint256[]));

            res.hasEip5267Domain = true;
            res.eip5267Domain = Eip5267Domain({
                fields: fields,
                name: name,
                version: version,
                chainId: chainId,
                verifyingContract: verifyingContract,
                salt: salt,
                extensions: extensions
            });
        }
    }
}
