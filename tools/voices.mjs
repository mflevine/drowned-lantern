#!/usr/bin/env node
// Generates the narration MP3s with ElevenLabs into audio/, plus audio/manifest.json,
// which the host screen reads to know which lines have audio.
//
// Each scene is split into clips (see narrationClips in js/story.js), and each clip into narrator lines and "quoted" character lines (see `speaker` in
// js/story.js), each voiced by the cast in tools/voices.json, then stitched into one MP3.
// Only new or changed lines are regenerated, so it's cheap to re-run after editing the story.
//
//   node tools/voices.mjs --dry-run                  print the full script + character count (no key needed)
//   node tools/voices.mjs                            generate new/changed lines (needs ELEVENLABS_API_KEY)
//   node tools/voices.mjs --only intro,hub-4         regenerate specific lines
//   node tools/voices.mjs --force                    regenerate everything
//   node tools/voices.mjs --list-voices              show the voices on your account
//   node tools/voices.mjs --audition                 search the Voice Library for each role → tools/audition.html
//   node tools/voices.mjs --cast pip=2,thorin=1      add audition picks to your account and cast them
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

// Splits a clip into narrator lines and "quoted" character lines.
// `quote` counts quotes across the whole scene so list-style `speaker`s line up.
function segmentsFor(scene, clip, counter) {
  const segs = clip.title ? [{ voice: 'narrator', text: `${clean(scene.title)}. [pause]` }] : [];
  for (const para of clip.parts) {
    for (const part of clean(para).split(/("[^"]+")/)) {
      const text = part.trim();
      if (!/[A-Za-z0-9]/.test(text)) continue;
      if (text.startsWith('"')) {
        const who = Array.isArray(scene.speaker) ? scene.speaker[counter.quote] : scene.speaker;
        counter.quote++;
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

// Every clip of every narration variant, each recorded once.
const clipJobs = new Map();
for (const state of G.narrationStates()) {
  const counter = { quote: 0 };
  for (const clip of G.narrationClips(state)) {
    const segs = segmentsFor(G.SCENES[state.sceneId], clip, counter);
    if (!clipJobs.has(clip.key)) clipJobs.set(clip.key, { key: clip.key, segs });
  }
}

const jobs = [
  ...clipJobs.values(),
  ...Object.entries(G.ROLL_LINES).map(([key, text]) => ({ key, segs: [{ voice: 'narrator', text }] })),
];

for (const job of jobs) {
  for (const s of job.segs) {
    if (!cast.voices[s.voice]) throw new Error(`No voice cast for "${s.voice}" (line ${job.key}). Add it to tools/voices.json.`);
  }
  job.hash = createHash('sha1')
    .update(JSON.stringify([cast.model, job.segs.map(s => [cast.voices[s.voice].id, cast.voices[s.voice].settings, s.text])]))
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

const headers = { 'xi-api-key': apiKey };
const AUDITION = new URL('tools/.audition.json', ROOT);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

if (has('--audition')) {
  const found = {};
  for (const [role, v] of Object.entries(cast.voices)) {
    const seen = new Map();
    for (const term of v.search?.terms || []) {
      const q = new URLSearchParams({ search: term, page_size: '8', sort: 'cloned_by_count' });
      if (v.search.gender) q.set('gender', v.search.gender);
      const { voices } = await api(`/shared-voices?${q}`);
      for (const sv of voices) if (!seen.has(sv.voice_id)) seen.set(sv.voice_id, sv);
    }
    // Most-used first; voices free accounts can't use, or that cost extra, go last.
    found[role] = [...seen.values()]
      .sort((a, b) => (b.free_users_allowed - a.free_users_allowed) || ((a.rate || 1) - (b.rate || 1)) || (b.cloned_by_count - a.cloned_by_count))
      .slice(0, 8);
    console.log(`${role.padEnd(10)} ${found[role].length} candidates`);
  }
  await writeFile(AUDITION, JSON.stringify(found, null, 2));

  const sections = Object.entries(found).map(([role, list]) => `
    <section><h2>${role} <small>now: ${esc(cast.voices[role].name)}</small></h2>
    <p class="want">${esc(cast.voices[role].want)}</p>
    <ol>${list.map(sv => `<li>
      <div><b>${esc(sv.name)}</b> <span>${esc([sv.gender, sv.age?.replace('_', ' '), sv.accent, sv.descriptive].filter(Boolean).join(' · '))}</span>
      ${sv.rate > 1 ? `<em>costs ${sv.rate}× credits</em>` : ''}</div>
      <p>${esc(sv.description || '')}</p>
      ${sv.preview_url ? `<audio controls preload="none" src="${esc(sv.preview_url)}"></audio>` : ''}
    </li>`).join('')}</ol></section>`).join('');
  await writeFile(new URL('tools/audition.html', ROOT), `<!doctype html><meta charset="utf-8"><title>Voice audition</title>
<style>body{font:16px/1.4 system-ui;max-width:760px;margin:2em auto;padding:0 1em;background:#16110d;color:#f1e4c8}
h2{text-transform:capitalize;border-bottom:1px solid #4a3626;padding-bottom:.2em}small{font-weight:400;color:#b39f82;font-size:.6em}
.want{color:#e0a84a;font-style:italic}li{margin:0 0 1.2em}li p{margin:.2em 0;color:#b39f82;font-size:.9em}
span{color:#b39f82;font-size:.85em}em{color:#e07a6a;font-size:.8em;margin-left:.4em}audio{width:100%;height:32px}code{background:#2e221a;padding:.2em .4em;border-radius:4px}</style>
<h1>Drowned Lantern voice audition</h1>
<p>Pick a number for each role, then run <code>node tools/voices.mjs --cast pip=2,thorin=1,…</code></p>
<p><em>Voice Library voices can only be used through the API on a paid ElevenLabs plan (Starter or above). On the free plan, cast the built-in voices from <code>--list-voices</code> instead.</em></p>${sections}`);
  console.log('\nOpen tools/audition.html to listen, then cast with: node tools/voices.mjs --cast role=N,...');
  process.exit(0);
}

if (has('--cast')) {
  const found = JSON.parse(await readFile(AUDITION, 'utf8').catch(() => '{}'));
  for (const pick of (args[args.indexOf('--cast') + 1] || '').split(',')) {
    const [role, n] = pick.split('=');
    const sv = found[role]?.[Number(n) - 1];
    if (!cast.voices[role] || !sv) throw new Error(`No audition pick "${pick}". Run --audition first and use role=number.`);
    const { voice_id } = await api(`/voices/add/${sv.public_owner_id}/${sv.voice_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ new_name: `Lantern ${role}: ${sv.name}`.slice(0, 60) }),
    });
    Object.assign(cast.voices[role], { id: voice_id, name: sv.name });
    console.log(`${role.padEnd(10)} → ${sv.name} (${voice_id})`);
  }
  await writeFile(new URL('tools/voices.json', ROOT), JSON.stringify(cast, null, 2) + '\n');
  console.log('Updated tools/voices.json.');
  process.exit(0);
}

async function tts({ voice, text }) {
  const v = cast.voices[voice];
  const body = { text, model_id: cast.model };
  if (v.settings) body.voice_settings = v.settings;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/text-to-speech/${v.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', accept: 'audio/mpeg' },
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

// Make sure every cast voice is on this account before spending any credits.
{
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const available = new Set((await res.json()).voices.map(v => v.voice_id));
  const missing = Object.entries(cast.voices).filter(([, v]) => !available.has(v.id));
  if (missing.length) {
    console.error('These cast voices are not on your ElevenLabs account:\n');
    for (const [role, v] of missing) console.error(`  ${role.padEnd(10)} ${v.name} (${v.id})\n             wanted: ${v.want}\n`);
    console.error('Find a match in the Voice Library (elevenlabs.io/app/voice-library), add it to My Voices,');
    console.error('then put its id in tools/voices.json. `node tools/voices.mjs --list-voices` shows what you have.');
    process.exit(1);
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
