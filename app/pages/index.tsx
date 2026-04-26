// app/pages/index.tsx
//
// Frontend orchestrator (thin React wrapper). The dance lives in
// app/lib/orchestrator.ts; this page only handles wallet connection,
// intent input, render-state, and tx submission.
//
// To wire this up, run:
//   pnpm add next react react-dom @types/react @types/react-dom
// (left out of the default deps because the hackathon's deploy/test
// path doesn't need a dev server.)
//
// Pseudocode for what this page should do once Next/React are installed:
//
//   const [intent, setIntent] = useState("");
//   const [state, setState] = useState<"idle" | "running" | "executable" | "rejected" | "submitted">("idle");
//   const [bundle, setBundle] = useState<OrchestratorOutput | null>(null);
//
//   async function onSubmit() {
//     setState("running");
//     const out = await runPairReview({
//       intent,
//       toolCatalog: TOOLS,
//       pairNonce: await readNonce(),
//       proposerId, reviewerId,
//       proposerKey: process.env.NEXT_PUBLIC_PROPOSER_KEY!,  // demo only
//       reviewerKey: process.env.NEXT_PUBLIC_REVIEWER_KEY!,
//       proposerLLM: new AnthropicLLM(...),
//       reviewerLLM: new OpenAILLM(...),
//       policy: loadPolicyFromJson(require("../agents/policies/default.json")),
//       gateAddress: GATE_ADDRESS,
//       chainId: 84532,
//       ipfs: new PinataPinner(...),
//     });
//     setBundle(out);
//     setState(out.kind);
//
//     if (out.kind === "executable") {
//       const wallet = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum!) });
//       const txHash = await wallet.writeContract({
//         address: GATE_ADDRESS,
//         abi: PAIR_REVIEW_GATE_ABI,
//         functionName: "execute",
//         args: [out.request, out.proposerSig, out.reviewerSig, out.evidenceURI, out.evidenceHash],
//       });
//       setState("submitted");
//     }
//   }

export default function Home() {
  return null;
}
