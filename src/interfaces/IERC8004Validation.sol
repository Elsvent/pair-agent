// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IERC8004Validation (frozen subset)
/// @notice Minimal canonical ERC-8004 Validation Registry surface used by ValidationAdapterV1.
/// @dev    Frozen at T001 from the canonical source. The canonical API is
///         two-phase: validationRequest(...) MUST be called before
///         validationResponse(...) for the same requestHash. ValidationAdapterV1
///         (T030) wraps both calls inside a single postOutcome(...) so the gate
///         keeps a one-call abstraction. Do not add methods (CLAUDE.md Rule 1).
///
///   source_repo:    https://github.com/erc-8004/erc-8004-contracts
///   source_file:    contracts/ValidationRegistryUpgradeable.sol
///   address:        <T031 deploy on Base Sepolia — our own instance, vendored verbatim at T001b>
///   chain_id:       84532
///   captured_at:    2026-04-25
///   abi_sha256:     <recorded at T001b after vendoring>
interface IERC8004Validation {
    /// @notice Validator declares an upcoming validation. MUST precede validationResponse.
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    /// @notice Validator records the outcome.
    /// @param  response 0..255; 0 = rejected, 100 = approved (per ERC-8004 convention).
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external;
}
