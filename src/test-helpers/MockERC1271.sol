// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Minimal ERC-1271 wallet for testing the smart-account Reviewer path.
/// @dev    Backed by a single signer key. `toggleInvalid(true)` makes it
///         reject every signature, simulating a compromised or revoked wallet.
contract MockERC1271 {
    bytes4 internal constant _MAGIC_VALUE = 0x1626ba7e;

    address public signer;
    bool public invalidate;

    constructor(address signer_) {
        signer = signer_;
    }

    function toggleInvalid(bool v) external {
        invalidate = v;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (invalidate) return 0xffffffff;
        address recovered = ECDSA.recover(hash, sig);
        if (recovered == signer) return _MAGIC_VALUE;
        return 0xffffffff;
    }
}
