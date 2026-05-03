# Demo deck

Slidev source for the 2-minute demo video. Speaker notes (the `<!-- ... -->`
blocks) are the verbatim voiceover lines — read them while recording.

## Run it

`@slidev/cli` and `@slidev/theme-default` are project devDeps, so once
`pnpm install` is done you have three scripts:

```bash
# Live presenter mode at http://localhost:3030 (speaker view at /presenter)
pnpm slides

# Static SPA build (output: dist/)
pnpm slides:build

# PDF export (slidev pulls Playwright on first run)
pnpm slides:export
```

The peer-dep warnings on `shiki`, `vite`, `unplugin-vue-markdown`, and
`vite-plugin-inspect` during install are harmless — slidev pins older
versions but its renderer doesn't depend on the mismatched APIs.

## Beat sheet (2:00 total)

| # | Time | Slide | Voiceover focus |
|---|---|---|---|
| 1 | 0:00–0:10 | Title | Cold open: single agents = single point of failure |
| 2 | 0:10–0:25 | Threat triad → Fix | Three failure modes, one outcome |
| 3 | 0:25–0:40 | Architecture + Live deployment | Two LLMs, both sign; deployed and verified |
| 4 | 0:40–0:55 | execute() snippet + Adapter | getAgentWallet at execute time; adapter is swappable |
| 5 | 0:55–1:25 | Tests + Coverage | 38 passing, 100/100/100/100 |
| 6 | 1:25–1:45 | Compromise scenario (two-cols) | Proposer compromised, Reviewer refuses |
| 7 | 1:45–2:00 | Reputation + Close | Validation Registry → public reputation → repo URL |

## Generate the voiceover

```bash
# Free, zero-setup: macOS `say` (Samantha voice, 175 wpm by default)
pnpm tts
# → 11 .m4a files in docs/demo/audio/, one per slide

# Tune the pace if you need to hit 2:00 exactly:
SAY_RATE=200 pnpm tts   # ~2:11 total
SAY_RATE=215 pnpm tts   # ~2:00 total (slightly rushed)

# Pick a different macOS voice (must be installed):
SAY_VOICE=Daniel pnpm tts            # British male
SAY_VOICE=Ava pnpm tts               # premium female (download via System Settings)
```

Higher-quality providers auto-activate when their API key is present:

```bash
# OpenAI tts-1-hd (~$0.005 for the whole 2-min script)
OPENAI_API_KEY=sk-... pnpm tts
OPENAI_TTS_VOICE=onyx pnpm tts       # alloy / echo / fable / onyx / nova / shimmer

# ElevenLabs (best quality, free tier covers the 2-min script easily)
ELEVENLABS_API_KEY=... pnpm tts
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM pnpm tts   # default = "Rachel"
```

The script reads each slide's `<!-- ... -->` block, extracts only the
quoted-string spans (skipping stage directions like `[00:00-00:10]`),
and writes one audio file per slide named `NN-<slug>.m4a` (or `.mp3`
for the cloud providers). Drop them all into iMovie / DaVinci Resolve
and align each clip to the matching slide.

## Recording tips

- **Audio first.** Record the voiceover separately (or use `pnpm tts`
  above), overlay onto screen capture in iMovie / DaVinci Resolve.
  Live narration during screen capture sounds rough.
- **Pre-load Basescan tabs** for the three deployed contracts so they don't
  show a loading state when you switch.
- **Run terminal at 24pt+ font** in iTerm2 / Warp. The architecture mermaid
  diagram and the `execute()` snippet are the densest beats — give them an
  extra half-second to read.
- **Record beats 1–4 with the slides only**, then beats 5–7 with a mix of
  slides + Basescan + terminal. iMovie can crossfade between sources.

## When to re-record

The current deck is honest about what's deployed today (contracts + tests)
without claiming a working user-types-swap → both-agents-sign → tx-lands
demo. That happy path needs T032 (mint agents) + T040/T041 (LLM agents) +
T042 (frontend) to land first. Once they do, replace beat 5 with a live
recording of the actual flow and beat 6 with the actual prompt-injection
attack run.
