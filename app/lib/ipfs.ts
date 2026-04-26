// app/lib/ipfs.ts
//
// Pluggable IPFS pinning interface. The orchestrator pins each evidence
// bundle (request + both rationales + LLM metadata) and includes the
// resulting CID in gate.execute(...). Wire a real provider (Pinata,
// web3.storage, IPFS HTTP API) via an adapter that implements IPFSPinner.

import { keccak256, stringToBytes, type Hex } from "viem";

export interface IPFSPinner {
  /// Returns ipfs://<cid>.
  pinJSON(value: unknown): Promise<string>;
  readonly providerName: string;
}

export interface EvidenceBundle {
  request: {
    proposerId: string;
    reviewerId: string;
    target: string;
    value: string;
    data: string;
    nonce: string;
    deadline: string;
    contextHash: string;
  };
  proposer: {
    rationale: string;
    provider: string;
    model: string;
    selectedTool: string;
  };
  reviewer: {
    rationale: string;
    provider: string;
    model: string;
    decision: "approve" | "reject";
    reasonCode?: number;
  };
  context: {
    capturedAt: string; // ISO-8601
    chainId: number;
    gateAddress: string;
  };
}

/// In-process stub. Useful for tests + local dev when no real provider is wired.
/// Stores bundles in a Map and returns ipfs://stub-<sha> URIs derived from
/// the JSON content so the same bundle is content-addressed deterministically.
export class StubIPFSPinner implements IPFSPinner {
  readonly providerName = "stub";
  readonly bundles = new Map<string, unknown>();

  async pinJSON(value: unknown): Promise<string> {
    const json = JSON.stringify(value);
    const hash = keccak256(stringToBytes(json));
    const cid = `stub-${hash.slice(2, 18)}`; // first 8 bytes for brevity
    this.bundles.set(cid, value);
    return `ipfs://${cid}`;
  }
}

/// Compute the keccak256(evidence JSON bytes) so callers can pass it as
/// evidenceHash to the gate (binds the URI to its content).
export function evidenceHash(value: unknown): Hex {
  return keccak256(stringToBytes(JSON.stringify(value)));
}
