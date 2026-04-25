// app/agents/reviewer.ts
//
// Reviewer agent runner. Implementation under T041.
//
// HARD RULES:
//  - Receives ONLY the structured AgentRequest. No Proposer rationale, no transcript.
//  - Loads policy from app/agents/policies/default.json.
//  - Uses LLM provider B (different from Proposer's provider).
//  - Returns either a signature or a rejection with reasonCode.

export {}; // placeholder; T041 implements
