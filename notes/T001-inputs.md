# T001 Inputs — canonical ERC-8004 interfaces (Base Sepolia)

**Provenance.** The function signatures, events, structs, and addresses below
were collected on **2026-04-25** from the canonical ERC-8004 reference repo
[`erc-8004/erc-8004-contracts`](https://github.com/erc-8004/erc-8004-contracts)
(Apache 2.0 / MIT, the publicly-curated registry contracts) and from the
verified deployment on Base Sepolia via `sepolia.basescan.org`. Nothing here
is synthesized from training data — every signature is copied verbatim from
the linked source.

CLAUDE.md Rule 1 is satisfied. Ralph: when picking T001, paste these into the
two interface files exactly as written; do **not** invent additional methods.
If the gate (`src/PairReviewGate.sol`) needs a method that isn't here, set
T001 to `blocked` and surface a new task — do not guess.

---

## 1. IdentityRegistry — DEPLOYED canonical on Base Sepolia

| Field | Value |
|---|---|
| `source_url_repo` | https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/IdentityRegistryUpgradeable.sol |
| `source_url_explorer` | https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e |
| `address (proxy)` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (ERC-1967 proxy) |
| `address (impl)` | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` (`IdentityRegistryUpgradeable`) |
| `chain` | Base Sepolia (84532) |
| `captured_at` | 2026-04-25 (UTC) |
| `block_at_capture` | TODO(ralph): record `cast block-number --rpc-url $BASE_SEPOLIA_RPC_URL` at T001 time |
| `abi_sha256` | TODO(ralph): `shasum -a 256` of the verbatim source file once vendored at T001b |

This is the ERC-721-based agent NFT registry. Our gate calls `getAgentWallet(agentId)` at execution time to resolve the current operator address (this replaces the placeholder's incorrect `operatorOf(...)`).

### External / public functions (verbatim from canonical source)

```solidity
function register() external returns (uint256 agentId);
function register(string memory agentURI) external returns (uint256 agentId);
function register(string memory agentURI, MetadataEntry[] memory metadata) external returns (uint256 agentId);

function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory);
function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external;

function setAgentURI(uint256 agentId, string calldata newURI) external;

function getAgentWallet(uint256 agentId) external view returns (address);
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external;
function unsetAgentWallet(uint256 agentId) external;

function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);

function getVersion() external pure returns (string memory);
```

The contract also inherits the standard ERC-721 surface (`ownerOf`, `tokenURI`, `balanceOf`, `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`, `getApproved`, `isApprovedForAll`, `name`, `symbol`, `supportsInterface`). For T001 our minimal `IERC8004Identity` only needs to declare what `PairReviewGate` actually calls.

### Events

```solidity
event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
```

### Structs

```solidity
struct MetadataEntry {
    string metadataKey;
    bytes metadataValue;
}
```

### Minimal interface ralph should write into `src/interfaces/IERC8004Identity.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IERC8004Identity (frozen subset)
/// @notice Minimal canonical ERC-8004 Identity Registry surface used by PairReviewGate.
/// @dev    Frozen at T001 from the canonical source. Do not add methods.
///
///   source_url:  https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/IdentityRegistryUpgradeable.sol
///   address:     0x8004A818BFB912233c491871b3d84c89A494BD9e   (Base Sepolia proxy)
///   impl:        0x7274e874ca62410a93bd8bf61c69d8045e399c02
///   captured_at: 2026-04-25T18:00:00Z
///   block:       <ralph: fill from cast block-number at T001 time>
///   abi_sha256:  <ralph: shasum -a 256 of the canonical .sol after vendoring (T001b)>
interface IERC8004Identity {
    /// @notice Current operator wallet authorized to act for `agentId`.
    /// @dev    PairReviewGate MUST call this at execute() time (Rule 5).
    function getAgentWallet(uint256 agentId) external view returns (address);

    /// @notice ERC-721 owner of the agent NFT.
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice ERC-721 token URI (agent-card pointer).
    function tokenURI(uint256 agentId) external view returns (string memory);

    /// @notice Register a fresh agent. Used by scripts/mintAgents.ts at T032.
    function register(string memory agentURI) external returns (uint256 agentId);
}
```

If `PairReviewGate` needs `isAuthorizedOrOwner` later (e.g., for a privileged
admin path), add it then — surface a docs task; don't sneak it in.

---

## 2. ValidationRegistry — NOT DEPLOYED on Base Sepolia (we deploy our own at T031)

The ERC-8004 README states the Validation Registry is "still under active
update and discussion." There is no `0x8004…`-prefixed canonical deployment on
Base Sepolia at capture time. This project takes **Path A**: vendor the
canonical source verbatim (T001b) and deploy our own instance during T031.
The address slot stays a TODO until T031 lands.

| Field | Value |
|---|---|
| `source_url_repo` | https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/ValidationRegistryUpgradeable.sol |
| `address` | TODO(T031): `<our deploy on Base Sepolia>` |
| `chain` | Base Sepolia (84532) |
| `captured_at` | 2026-04-25 (UTC) |
| `block_at_capture` | n/a — not deployed yet |
| `abi_sha256` | TODO(ralph): `shasum -a 256` of the vendored source after T001b |

### External / public functions (verbatim from canonical source)

```solidity
function initialize(address identityRegistry_) external;
function getIdentityRegistry() external view returns (address);

function validationRequest(
    address validatorAddress,
    uint256 agentId,
    string calldata requestURI,
    bytes32 requestHash
) external;

function validationResponse(
    bytes32 requestHash,
    uint8 response,
    string calldata responseURI,
    bytes32 responseHash,
    string calldata tag
) external;

function getValidationStatus(bytes32 requestHash) external view returns (
    address validatorAddress,
    uint256 agentId,
    uint8 response,
    bytes32 responseHash,
    string memory tag,
    uint256 lastUpdate
);

function getSummary(
    uint256 agentId,
    address[] calldata validatorAddresses,
    string calldata tag
) external view returns (uint64 count, uint8 avgResponse);

function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory);
function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory);
function getVersion() external pure returns (string memory);
```

### Events

```solidity
event ValidationRequest(
    address indexed validatorAddress,
    uint256 indexed agentId,
    string requestURI,
    bytes32 indexed requestHash
);
event ValidationResponse(
    address indexed validatorAddress,
    uint256 indexed agentId,
    bytes32 indexed requestHash,
    uint8 response,
    string responseURI,
    bytes32 responseHash,
    string tag
);
```

### Structs

```solidity
struct ValidationStatus {
    address validatorAddress;
    uint256 agentId;
    uint8 response;
    bytes32 responseHash;
    string tag;
    uint256 lastUpdate;
    bool hasResponse;
}
```

### Minimal interface ralph should write into `src/interfaces/IERC8004Validation.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IERC8004Validation (frozen subset)
/// @notice Minimal canonical ERC-8004 Validation Registry surface used by ValidationAdapterV1.
/// @dev    Frozen at T001 from the canonical source. Do not add methods.
///
///   source_url:  https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/ValidationRegistryUpgradeable.sol
///   address:     <T031 deploy on Base Sepolia — our own instance, vendored verbatim at T001b>
///   captured_at: 2026-04-25T18:00:00Z
///   abi_sha256:  <ralph: shasum -a 256 of the vendored .sol (T001b)>
interface IERC8004Validation {
    /// @notice Validator declares an upcoming validation. MUST be called before validationResponse.
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    /// @notice Validator records the outcome.
    /// @dev    `response` is 0..255; 0 = rejected, 100 = approved (per ERC-8004 convention).
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external;
}
```

Note: the canonical API is **two-phase** (`validationRequest` then
`validationResponse`). The placeholder's single-shot `postValidation(...)` is
wrong. `ValidationAdapterV1` (T030) must call both phases inside its
`postOutcome(...)` shim — request first, then response, atomically from the
gate's perspective. Update `IValidationAdapter` if the field set needs to
change to carry both `requestURI` and `responseURI`.

---

## Downstream consequences ralph will hit

These are **not** T001's responsibility, but ralph should expect them when later tasks pick up:

| Where | Current (placeholder) | Canonical | Task that fixes it |
|---|---|---|---|
| `src/PairReviewGate.sol` `execute()` TODO comment | `identity.operatorOf(req.proposerId)` | `identity.getAgentWallet(req.proposerId)` | T011 (gate happy path) |
| `src/PairReviewGate.sol` `execute()` invariant | `identity.isActive(req.proposerId)` (placeholder) | not in canonical — drop the check or replace with `isAuthorizedOrOwner` | T017 |
| `src/test-helpers/MockIdentityRegistry.sol` | exposes `operatorOf`, `rotateOperator`, `setActive` | rename to `getAgentWallet`, `setAgentWallet`, drop `setActive` | T003 (helpers smoke test) |
| `src/adapters/ValidationAdapterV1.sol` `postOutcome` | calls `registry.postValidation(...)` (single-shot) | call `validationRequest(...)` then `validationResponse(...)` | T030 |
| `CLAUDE.md` Rule 5 wording | "operator", `IIdentityRegistry.operatorOf(agentId)` | "agent wallet", `IERC8004Identity.getAgentWallet(agentId)` | T011 (PR also touches docs) |

Ralph: when these surface, fix as part of the appropriate task. Don't try to fix them all at T001 — T001's scope is only the two interface files.

---

## T001 acceptance — explicit pass/fail bullets

When ralph picks T001:

- [ ] Replace `src/interfaces/IERC8004Identity.sol` with the minimal interface above (verbatim) + the header comment from §1
- [ ] Replace `src/interfaces/IERC8004Validation.sol` with the minimal interface above (verbatim) + the header comment from §2
- [ ] Delete the `DO-NOT-TRUST-PLACEHOLDER` banners (now unnecessary)
- [ ] `pnpm compile` succeeds against the two new interface files (the gate skeleton's `revert("not implemented")` body still compiles)
- [ ] Commit titled `[T001] Freeze ERC-8004 interfaces from canonical source`
- [ ] Status → `needs_human_review`
- [ ] Surface T001b (vendor `ValidationRegistryUpgradeable.sol`) and any rename tasks for the gate / mocks as new prd.json entries
