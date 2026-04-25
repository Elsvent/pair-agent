// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidationAdapter} from "../interfaces/IValidationAdapter.sol";
import {IERC8004Validation} from "../interfaces/IERC8004Validation.sol";

/// @title ValidationAdapterV1
/// @notice Adapter from PairReviewGate's IValidationAdapter to the ERC-8004
///         Validation Registry interface frozen by T001.
/// @dev    SKELETON. Implemented under T030 against the frozen IERC8004Validation.
///         The whole point of this contract is "if the registry interface
///         changes, only this file changes."
contract ValidationAdapterV1 is IValidationAdapter {
    IERC8004Validation public immutable registry;

    constructor(IERC8004Validation registry_) {
        registry = registry_;
    }

    /// @inheritdoc IValidationAdapter
    function postOutcome(
        uint256 subjectAgentId,
        uint8 score,
        bytes32 requestHash,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        bytes32 tag
    ) external returns (bytes32 validationId) {
        // TODO(T030): Forward to registry.postValidation(...).
        // Field mapping is straightforward. After T001 freezes the real
        // registry interface, confirm parameter order matches.
        validationId = registry.postValidation(
            subjectAgentId,
            score,
            requestHash,
            evidenceURI,
            evidenceHash,
            tag
        );
    }
}
