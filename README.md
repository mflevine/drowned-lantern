# Death at the Drowned Lantern

A Jackbox-style D&D murder mystery. One screen (TV or laptop) tells the story and shows a QR code.
Up to 6 players join from their phones and vote on every move. Skill checks are rolled by a random
player tapping a d20 on their phone. Before dawn (4 searches) the party must name the killer.

It's 100% static files for GitHub Pages, with Firebase Realtime Database relaying messages between phones and the host.

## Try it locally first (no Firebase needed)

```bash
python3 -m http.server 8765
```

Open http://localhost:8765/host.html, then click **Open a test controller in a new tab** once per pretend player.
Until `firebase-config.js` is filled in, the game runs in *local demo mode*, which only works across tabs of one browser.

## Go online

### 1. Firebase (free Spark plan is plenty)
1. Go to https://console.firebase.google.com and click **Create a project**. You can turn off Analytics.
2. Open **Build → Realtime Database → Create database**. Pick a location, then choose **Start in locked mode**.
3. On the **Rules** tab, paste the contents of `database.rules.json` and click **Publish**.
4. Go to **Project settings (gear) → General → Your apps** and click the web icon `</>`. Register an app (no hosting needed).
5. Copy the config values into `firebase-config.js`. Make sure `databaseURL` is included. If it's missing, copy it from the top of the Realtime Database page.

The config values are not secrets. They're meant to be public, and the database rules do the protecting.

### 2. GitHub Pages
1. Create a repo and push these files to the `main` branch, keeping `index.html` at the root.
2. Go to **Settings → Pages → Build and deployment** and set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After a minute the game is live at `https://<you>.github.io/<repo>/`. Open `host.html` on the TV.

## Voiced narration (ElevenLabs)

The TV can play a fully voiced narration: a dramatic narrator plus a voice for each suspect, and the
narrator reacting to dice rolls ("A natural twenty! The very gods bow before you!").
The MP3s are generated once by a script and committed to `audio/`, so playing them costs nothing.

```bash
node tools/voices.mjs --dry-run                 # read the whole script and character count, no key needed
export ELEVENLABS_API_KEY=sk_...                # ElevenLabs → Developers → API Keys
node tools/voices.mjs                           # generate audio/*.mp3 + audio/manifest.json
git add audio && git commit -m "Add voices" && git push
```

- The whole story is about 10,000 characters. The ElevenLabs free tier gives 10,000 credits a month, so you'll probably need the $5 Starter plan (30,000) to have room for retakes.
- Re-running only regenerates lines whose text or voice changed. `--only intro,hub-4` redoes specific lines, and `--force` redoes everything.
- Casting lives in `tools/voices.json`. Run `node tools/voices.mjs --list-voices` to see the voices on your account and swap any id. Lower `stability` and higher `style` make the delivery more over the top.
- Who voices each "quoted" line is set by `speaker` on each scene in `js/story.js`.
- Scenes without an MP3 fall back to the browser's built-in voice. The 🔊 button on the TV mutes the narration, and ↻ replays it.

## How it works

```
rooms/{CODE}/
  state      written only by the host: phase, scene, choices, clues, roll…
  players/   each phone writes its own {name, joinedAt, connected}; host assigns a class
  votes/s{step}/{playerId}   phone → host
  rolls/s{step}              d20 result from the chosen roller
  advance/s{step}            "Continue" / "Play again" taps
  secrets/{playerId}         private whisper dealt to each player
```

The host is the single source of truth. Phones only send input and render whatever `state` says.
Refreshing the host page resumes the same room because the code is in the URL.

| File | What it is |
|---|---|
| `host.html`, `js/host.js` | TV screen: lobby + QR, game flow, vote tallying, rolls |
| `play.html`, `js/play.js` | Phone controller |
| `js/story.js` | **All story content**: scenes, clues, suspects, whispers, endings |
| `js/db.js` | Firebase / local-demo database wrapper |
| `database.rules.json` | Realtime Database rules |
| `tools/voices.mjs`, `tools/voices.json` | ElevenLabs narration generator and voice casting |
| `js/sfx.js` | Synthesized dice sounds |

## Writing your own story

Everything lives in `js/story.js`. A scene looks like this:

```js
loc_bard: {
  art: '🎻', title: "Lyra's Room", location: 'bard',   // location = costs a candle-mark
  text: ['Paragraph one…', 'Paragraph two…'],
  choices: [
    { label: '🎒 Search the lute case (Investigation, DC 11)',
      check: { skill: 'Investigation', dc: 11, pass: 'bard_vial', fail: 'bard_nothing' } },
    { label: '✉️ Read the letters', to: 'bard_letters' },
  ],
},
bard_vial: { art: '🧪', title: 'The Empty Vial', clue: 'vial', next: 'hub', text: [...] },
```

Clues marked `lead: true` point at the culprit. The best ending needs `LEADS_NEEDED` of them.

## Prototype caveats
- The rules allow anyone who knows a room code to read and write that room. That's fine for a party game. For anything public, add Firebase Anonymous Auth and tighten the rules.
- Old rooms aren't cleaned up. Delete `rooms` in the Firebase console now and then, or add a scheduled cleanup.
- Players' whispers sit in the database, so a determined cheater could read them.
