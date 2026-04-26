// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IERC8004Identity (frozen subset)
/// @notice Minimal canonical ERC-8004 Identity Registry surface used by PairReviewGate.
/// @dev    Frozen at T001 from the canonical source. Do not add methods. If
///         PairReviewGate ever needs another method, surface a new task in
///         prd.json — do not silently extend this file (CLAUDE.md Rule 1).
///
///   source_repo:    https://github.com/erc-8004/erc-8004-contracts
///   source_file:    contracts/IdentityRegistryUpgradeable.sol
///   address_proxy:  0x8004A818BFB912233c491871b3d84c89A494BD9e   (Base Sepolia, ERC-1967)
///   address_impl:   0x7274e874ca62410a93bd8bf61c69d8045e399c02
///   chain_id:       84532
///   captured_at:    2026-04-25
///   block:          <recorded at T031 deploy time via cast block-number>
///   abi_sha256:     <recorded at T001b after vendoring>
interface IERC8004Identity {
    /// @notice Current operator wallet authorized to act for `agentId`.
    /// @dev    PairReviewGate.execute() MUST resolve this at execution time
    ///         (CLAUDE.md Rule 5). Never cache, never pre-resolve.
    function getAgentWallet(uint256 agentId) external view returns (address);

    /// @notice ERC-721 owner of the agent NFT.
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice ERC-721 token URI (agent-card pointer, typically ipfs://...).
    function tokenURI(uint256 agentId) external view returns (string memory);

    /// @notice Register a fresh agent. Used by scripts/mintAgents.ts at T032.
    /// @return agentId The newly minted agent's tokenId.
    function register(string memory agentURI) external returns (uint256 agentId);
}
