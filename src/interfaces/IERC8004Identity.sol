// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DO-NOT-TRUST-PLACEHOLDER — REPLACE BEFORE ANY OTHER WORK                ║
// ║                                                                          ║
// ║  This file is a hand-written approximation of the ERC-8004 Identity      ║
// ║  Registry interface. It is NOT canonical. Task T001 in prd.json must     ║
// ║  replace this with the real interface fetched from 8004scan.io for the   ║
// ║  Base Sepolia deployment.                                                ║
// ║                                                                          ║
// ║  Until T001 is done:                                                     ║
// ║    - Use this file ONLY for tests against MockIdentityRegistry           ║
// ║    - Do NOT deploy against the real registry                             ║
// ║    - Do NOT add fields or methods to "fix" missing pieces                ║
// ║                                                                          ║
// ║  After T001:                                                             ║
// ║    - This header is replaced with: source URL, contract address,         ║
// ║      block number, ABI sha256                                            ║
// ║    - File is treated as immutable                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

interface IERC8004Identity {
    /// @notice Returns the current operator address authorized to act for `agentId`.
    /// @dev MUST resolve dynamically; PairReviewGate calls this at execution time
    ///      to enforce operator-rotation security.
    function operatorOf(uint256 agentId) external view returns (address);

    /// @notice Returns the owner of the agent NFT (typically the registrant).
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice Returns the URI for the agent card (registration JSON).
    function tokenURI(uint256 agentId) external view returns (string memory);

    /// @notice Returns true if the agent is currently active (not suspended/burned).
    function isActive(uint256 agentId) external view returns (bool);
}
