// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ValidationRegistryUpgradeable} from "./ValidationRegistryUpgradeable.sol";

/// @title  ValidationRegistryV0
/// @notice Single-step deploy wrapper around the canonical
///         ValidationRegistryUpgradeable. The canonical's `initialize(...)`
///         is `reinitializer(2) onlyOwner`, designed to be reached via a
///         v1 -> v2 proxy upgrade dance (MinimalUUPS -> ValidationRegistry).
///         That dance is overkill for the hackathon; we just need
///         `_identityRegistry` populated so validationRequest +
///         validationResponse run their real bodies.
/// @dev    The canonical comment at the field declaration:
///           "Identity registry address stored at slot 0 (matches MinimalUUPS)"
///         Assembly sstore(0, ...) writes the same slot the canonical reads
///         via _identityRegistry. OwnableUpgradeable in OZ 5.x lives in a
///         namespaced ERC-7201 slot, not slot 0, so this doesn't collide.
///
///         When the official ERC-8004 team ships a canonical Base Sepolia
///         deployment, swap the address inside ValidationAdapterV1 — this
///         wrapper goes away. (CLAUDE.md Rule 7 — adapter pattern.)
contract ValidationRegistryV0 is ValidationRegistryUpgradeable {
    function initialize_v0(address identityRegistry_) external {
        require(identityRegistry_ != address(0), "bad identity");
        assembly {
            sstore(0, identityRegistry_)
        }
    }
}
