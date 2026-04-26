// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC8004Identity} from "../interfaces/IERC8004Identity.sol";

/// @notice Test mock for IERC8004Identity. Lets tests rotate agent wallets to
///         exercise PairReviewGate's operator-rotation security property
///         (CLAUDE.md Rule 5).
/// @dev    Test-helper convenience methods (setAgent, rotateAgentWallet) live
///         alongside the canonical interface methods. Tests use the helpers;
///         PairReviewGate only ever sees the IERC8004Identity surface.
contract MockIdentityRegistry is IERC8004Identity {
    struct Agent {
        address owner;
        address wallet;
        string uri;
        bool exists;
    }

    mapping(uint256 => Agent) internal _agents;
    uint256 internal _nextId = 1;

    // -----------------------------------------------------------------------
    // Test helpers (not part of IERC8004Identity)
    // -----------------------------------------------------------------------

    function setAgent(uint256 agentId, address owner_, address wallet_, string memory uri_) external {
        _agents[agentId] = Agent({owner: owner_, wallet: wallet_, uri: uri_, exists: true});
        if (agentId >= _nextId) _nextId = agentId + 1;
    }

    function rotateAgentWallet(uint256 agentId, address newWallet) external {
        require(_agents[agentId].exists, "no agent");
        _agents[agentId].wallet = newWallet;
    }

    // -----------------------------------------------------------------------
    // IERC8004Identity surface
    // -----------------------------------------------------------------------

    /// @inheritdoc IERC8004Identity
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agents[agentId].wallet;
    }

    /// @inheritdoc IERC8004Identity
    function ownerOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].owner;
    }

    /// @inheritdoc IERC8004Identity
    function tokenURI(uint256 agentId) external view returns (string memory) {
        return _agents[agentId].uri;
    }

    /// @inheritdoc IERC8004Identity
    function register(string memory agentURI) external returns (uint256 agentId) {
        agentId = _nextId++;
        _agents[agentId] = Agent({owner: msg.sender, wallet: msg.sender, uri: agentURI, exists: true});
    }

    // -----------------------------------------------------------------------
    // ERC-721-ish surface used by canonical ValidationRegistryUpgradeable's
    // permission check (T030). Default no-approval stubs; tests don't need
    // operator approvals because they set the agent owner directly.
    // -----------------------------------------------------------------------

    function isApprovedForAll(address /*owner*/, address /*operator*/) external pure returns (bool) {
        return false;
    }

    function getApproved(uint256 /*agentId*/) external pure returns (address) {
        return address(0);
    }
}
