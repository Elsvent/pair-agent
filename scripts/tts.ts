// scripts/tts.ts
//
// Generate per-beat voiceover audio from the speaker-notes blocks in
// docs/demo/slides.md.
//
// Run via:  pnpm tts
//
// Provider selection (auto, in priority order):
//   1. OPENAI_API_KEY     → OpenAI tts-1-hd (best price/quality)
//   2. ELEVENLABS_API_KEY → ElevenLabs (best quality, slower)
//   3. else               → macOS `say` (zero setup, robotic)
//
// Output (one file per slide):
//   docs/demo/audio/01-title.m4a
//   docs/demo/audio/02-threat-triad.m4a
//   ...
//
// Each file is the concatenated quoted-string text from that slide's
// <!-- ... --> block. Stage directions like "[00:00-00:10] Cold open."
// are skipped — only "..." spans count as spoken content.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SLIDES_PATH = "docs/demo/slides.md";
const OUTPUT_DIR = "docs/demo/audio";

// macOS `say` defaults — Samantha works on every Mac OOTB.
// Higher-quality alternatives (must be installed via System Settings →
// Accessibility → Spoken Content → System Voice → Customize):
//   Ava (Premium), Tom (Premium), Allison (Premium), Reed.
const SAY_VOICE = process.env.SAY_VOICE ?? "Samantha";
const SAY_RATE = process.env.SAY_RATE ?? "175"; // words/min

// OpenAI TTS defaults.
const OPENAI_MODEL = process.env.OPENAI_TTS_MODEL ?? "tts-1-hd";
const OPENAI_VOICE = process.env.OPENAI_TTS_VOICE ?? "onyx"; // confident male
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

// ElevenLabs.
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // "Rachel" default

interface Beat {
  number: number;
  slug: string;
  text: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseSlides(md: string): Beat[] {
  // Slidev separates slides with a line of exactly `---`. Split, then look
  // inside each chunk for the speaker-note block.
  const chunks = md.split(/^---\s*$/m);
  // The first chunk is the file frontmatter; usable slides start at index 1.
  const beats: Beat[] = [];
  let n = 0;
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i] ?? "";
    const noteMatch = chunk.match(/<!--([\s\S]*?)-->/);
    if (!noteMatch) continue;
    const note = noteMatch[1] ?? "";

    // Extract quoted spans only. "..." may span multiple lines.
    const quoted = Array.from(note.matchAll(/"([^"]+)"/g))
      .map((m) => (m[1] ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (quoted.length === 0) continue;

    n++;
    // Slug: first heading line of the slide ("# Foo bar"), or fallback.
    const heading = chunk.match(/^#\s+(.+)$/m)?.[1] ?? `slide-${n}`;
    beats.push({
      number: n,
      slug: slugify(heading),
      text: quoted.join(" "),
    });
  }
  return beats;
}

// ---------- macOS `say` provider ----------

function synthMacSay(text: string, outPath: string): void {
  // `say` writes .aiff natively. Convert to .m4a via the built-in
  // afconvert so the file plays in iMovie/DaVinci Resolve directly.
  const aiff = join(tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.aiff`);
  execFileSync("say", ["-v", SAY_VOICE, "-r", SAY_RATE, "-o", aiff, text], {
    stdio: "inherit",
  });
  execFileSync("afconvert", [aiff, outPath, "-d", "aac", "-f", "m4af"], {
    stdio: "inherit",
  });
}

// ---------- OpenAI TTS provider ----------

async function synthOpenAi(text: string, outPath: string): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: text,
      voice: OPENAI_VOICE,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI TTS failed: ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // outPath is .m4a by convention; rename in caller if needed.
  // For OpenAI we keep .mp3 — works in every video editor.
  const mp3Path = outPath.replace(/\.m4a$/, ".mp3");
  writeFileSync(mp3Path, buf);
}

// ---------- ElevenLabs provider ----------

async function synthElevenLabs(text: string, outPath: string): Promise<void> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mp3Path = outPath.replace(/\.m4a$/, ".mp3");
  writeFileSync(mp3Path, buf);
}

// ---------- main ----------

async function main() {
  if (!existsSync(SLIDES_PATH)) {
    throw new Error(`${SLIDES_PATH} not found`);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const md = readFileSync(SLIDES_PATH, "utf8");
  const beats = parseSlides(md);
  if (beats.length === 0) {
    console.warn("no speaker notes with quoted lines found — nothing to synthesize");
    return;
  }

  let provider: "openai" | "elevenlabs" | "macos";
  if (OPENAI_API_KEY) provider = "openai";
  else if (ELEVENLABS_API_KEY) provider = "elevenlabs";
  else provider = "macos";

  console.log(`provider=${provider}, beats=${beats.length}`);
  console.log(`output=${OUTPUT_DIR}/`);

  for (const beat of beats) {
    const numStr = String(beat.number).padStart(2, "0");
    const ext = provider === "macos" ? "m4a" : "mp3";
    const outFile = join(OUTPUT_DIR, `${numStr}-${beat.slug}.${ext}`);
    console.log(`  [${numStr}] ${beat.slug} (${beat.text.length} chars) → ${outFile}`);
    if (provider === "openai") await synthOpenAi(beat.text, outFile);
    else if (provider === "elevenlabs") await synthElevenLabs(beat.text, outFile);
    else synthMacSay(beat.text, outFile);
  }

  console.log(`\ndone. drag ${OUTPUT_DIR}/*.{m4a,mp3} into your video editor`);
  console.log("and align each clip with the matching slide.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
