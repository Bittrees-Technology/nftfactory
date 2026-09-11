// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Local integration fixture only; not part of deployment scripts.
contract SignInWallet {
    address public immutable signer;
    constructor(address authorizedSigner) { signer = authorizedSigner; }
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(hash, signature);
        return error == ECDSA.RecoverError.NoError && recovered == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
