#!/usr/bin/env node
// Generates the narration MP3s with ElevenLabs into audio/, plus audio/manifest.json,
// which the host screen reads to know which lines have audio.
//
// Each scene is split into narrator lines and "quoted" character lines (see `speaker` in
// js/story.js), each voiced by the cast in tools/voices.json, then stitched into one MP3.
// Only new or changed lines are regenerated, so it's cheap to re-run after editing the story.
//
//   node tools/voices.mjs --dry-run                  print the full script + character count (no key needed)
//   node tools/voices.mjs                            generate new/changed lines (needs ELEVENLABS_API_KEY)
//   node tools/voices.mjs --only intro,hub-4         regenerate specific lines
//   node tools/voices.mjs --force                    regenerate everything
//   node tools/voices.mjs --list-voices              show the voices on your account
import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as G from '../js/story.js';

const ROOT = new URL('..', import.meta.url);
const AUDIO = new URL('audio/', ROOT);
const MANIFEST = new URL('manifest.json', AUDIO);
const API = 'https://api.elevenlabs.io/v1';

const args = process.argv.slice(2);
const has = name => args.includes(name);
const only = has('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const apiKey = process.env.ELEVENLABS_API_KEY;
const cast = JSON.parse(await readFile(new URL('tools/voices.json', ROOT), 'utf8'));

// --- Build the script ---
const clean = html => html
  .replace(/<[^>]+>/g, '')
  .replace(/\p{Extended_Pictographic}️?/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

function segmentsFor(state) {
  const sc = G.SCENES[state.sceneId];
  const segs = [{ voice: 'narrator', text: `${clean(sc.title)}. <break time="0.8s" />` }];
  let quote = 0;
  for (const para of G.sceneText(state)) {
    for (const part of clean(para).split(/("[^"]+")/)) {
      const text = part.trim();
      if (!/[A-Za-z0-9]/.test(text)) continue;
      if (text.startsWith('"')) {
        const who = Array.isArray(sc.speaker) ? sc.speaker[quote] : sc.speaker;
        quote++;
        segs.push({ voice: who || 'narrator', text: text.slice(1, -1) });
      } else {
        segs.push({ voice: 'narrator', text });
      }
    }
  }
  // Merge neighbouring lines from the same voice into one request.
  return segs.reduce((out, s) => {
    const last = out[out.length - 1];
    if (last?.voice === s.voice) last.text += ` ${s.text}`;
    else out.push({ ...s });
    return out;
  }, []);
}

const jobs = [
  ...G.narrationStates().map(s => ({ key: G.audioKey(s), segs: segmentsFor(s) })),
  ...Object.entries(G.ROLL_LINES).map(([key, text]) => ({ key, segs: [{ voice: 'narrator', text }] })),
];

for (const job of jobs) {
  for (const s of job.segs) {
    if (!cast.voices[s.voice]) throw new Error(`No voice cast for "${s.voice}" (line ${job.key}). Add it to tools/voices.json.`);
  }
  job.hash = createHash('sha1')
    .update(JSON.stringify([cast.model, job.segs.map(s => [cast.voices[s.voice], s.text])]))
    .digest('hex')
    .slice(0, 12);
}

const totalChars = jobs.reduce((n, j) => n + j.segs.reduce((m, s) => m + s.text.length, 0), 0);

// --- Commands ---
if (has('--dry-run')) {
  for (const job of jobs) {
    console.log(`\n▶ ${job.key}`);
    for (const s of job.segs) console.log(`  [${s.voice}] ${s.text}`);
  }
  console.log(`\n${jobs.length} audio files, ${totalChars.toLocaleString()} characters total.`);
  process.exit(0);
}

if (!apiKey) {
  console.error('Set ELEVENLABS_API_KEY first (ElevenLabs → Developers → API Keys), e.g.\n  export ELEVENLABS_API_KEY=sk_...');
  process.exit(1);
}

if (has('--list-voices')) {
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const { voices } = await res.json();
  for (const v of voices) {
    const labels = Object.values(v.labels || {}).join(', ');
    console.log(`${v.voice_id}  ${v.name.padEnd(28)} ${labels}`);
  }
  process.exit(0);
}

async function tts({ voice, text }) {
  const v = cast.voices[voice];
  const body = {
    text,
    model_id: cast.model,
    voice_settings: { stability: v.stability, similarity_boost: 0.75, style: v.style, use_speaker_boost: true },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/text-to-speech/${v.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status} voicing ${voice} (${v.name}, ${v.id}): ${detail}`);
  }
}

const exists = url => access(url).then(() => true, () => false);

await mkdir(AUDIO, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')); } catch { /* first run */ }

let made = 0, chars = 0;
for (const job of jobs) {
  const file = new URL(`${job.key}.mp3`, AUDIO);
  const fresh = manifest[job.key] === job.hash && await exists(file);
  if (only ? !only.has(job.key) : fresh && !has('--force')) continue;

  process.stdout.write(`${job.key.padEnd(24)} `);
  const parts = [];
  for (const seg of job.segs) {
    parts.push(await tts(seg));
    process.stdout.write(seg.voice === 'narrator' ? '·' : seg.voice[0].toUpperCase());
    chars += seg.text.length;
  }
  await writeFile(file, Buffer.concat(parts));
  manifest[job.key] = job.hash;
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n'); // saved as we go, so a re-run resumes
  made++;
  console.log(' ✓');
}

// Drop lines that no longer exist in the story.
const keys = new Set(jobs.map(j => j.key));
for (const key of Object.keys(manifest)) {
  if (keys.has(key)) continue;
  delete manifest[key];
  await unlink(new URL(`${key}.mp3`, AUDIO)).catch(() => {});
}
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\nGenerated ${made} file(s), ${chars.toLocaleString()} characters. ${jobs.length - made} already up to date.`);
