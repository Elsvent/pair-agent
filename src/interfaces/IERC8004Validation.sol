// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DO-NOT-TRUST-PLACEHOLDER — REPLACE BEFORE ANY OTHER WORK                ║
// ║                                                                          ║
// ║  ERC-8004 Validation Registry is described in the spec as "under         ║
// ║  active revision with the TEE community." This placeholder reflects a    ║
// ║  reasonable shape but MUST be replaced via T001 with the canonical       ║
// ║  interface deployed on Base Sepolia (verify the version on 8004scan.io). ║
// ║                                                                          ║
// ║  PairReviewGate never imports this directly — it goes through            ║
// ║  IValidationAdapter so a registry version swap touches one file only.    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

interface IERC8004Validation {
    /// @notice Posts a validation response for `subjectAgentId`.
    /// @param subjectAgentId  Agent being validated (typically the Proposer for our use case)
    /// @param score           0..100, where 0 = rejected, 100 = approved
    /// @param requestHash     Identifier of the request being validated (we use EIP-712 digest)
    /// @param responseURI     Pointer to evidence bundle (IPFS CID URL)
    /// @param responseHash    keccak256 of the evidence bundle for integrity
    /// @param tag             Free-form 32-byte tag identifying the validator class
    /// @return validationId   Returned id of the recorded validation
    function postValidation(
        uint256 subjectAgentId,
        uint8 score,
        bytes32 requestHash,
        string calldata responseURI,
        bytes32 responseHash,
        bytes32 tag
    ) external returns (bytes32 validationId);
}
