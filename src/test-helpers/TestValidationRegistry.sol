// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ValidationRegistryUpgradeable} from "../external/ValidationRegistryUpgradeable.sol";

/// @notice Test-only wrapper that lets us deploy the canonical
///         ValidationRegistryUpgradeable as a single-step contract in unit
///         tests. The canonical's `initialize(...)` is reinitializer(2) +
///         onlyOwner, designed to be reached via a v1 -> v2 proxy upgrade
///         dance. For T030's adapter test we don't care about the upgrade
///         path; we just need _identityRegistry set so validationRequest +
///         validationResponse run their real bodies.
/// @dev    The canonical comment at the field declaration:
///           "Identity registry address stored at slot 0 (matches MinimalUUPS)"
///         Assembly sstore(0, ...) writes the same slot the canonical reads
///         via _identityRegistry. OwnableUpgradeable in OZ 5.x lives in a
///         namespaced ERC-7201 slot, not slot 0, so this doesn't collide.
contract TestValidationRegistry is ValidationRegistryUpgradeable {
    function initTestable(address identityRegistry_) external {
        require(identityRegistry_ != address(0), "bad identity");
        assembly {
            sstore(0, identityRegistry_)
        }
    }
}
