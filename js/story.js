// All story content and the rules that turn game state into choices.
// Shared by the host screen and the phone controllers.

export const VOTE_SECONDS = 40;
export const ROLL_SECONDS = 15;
export const START_MARKS = 4;      // searches before dawn forces an accusation
export const MAX_PLAYERS = 6;
export const LEADS_NEEDED = 3;     // clues pointing at the culprit needed for the best ending
export const CULPRIT = 'lyra';

export const CLASSES = [
  { icon: '🧙', name: 'Wizard' },
  { icon: '⚔️', name: 'Fighter' },
  { icon: '🗡️', name: 'Rogue' },
  { icon: '🏹', name: 'Ranger' },
  { icon: '✨', name: 'Cleric' },
  { icon: '🌿', name: 'Druid' },
];

export const SUSPECTS = {
  thorin:    { icon: '🪓', name: 'Thorin Ashmantle' },
  halden:    { icon: '☀️', name: 'Brother Halden' },
  seraphine: { icon: '🔥', name: 'Seraphine Vell' },
  lyra:      { icon: '🎻', name: 'Lyra Moonwhisper' },
  pip:       { icon: '🍺', name: 'Pip Underbough' },
};

// `lead: true` marks clues that point at the real killer.
export const CLUES = {
  wound:   { icon: '🩸', name: 'A bloodless wound', text: 'The stab wound barely bled. Vane was poisoned first, and the dagger came after.' },
  goblet:  { icon: '🍷', name: 'Sweet-smelling wine', text: 'The goblet reeks of nightbloom, the scent of the poison called Midnight Tears.' },
  music:   { icon: '🎼', name: 'Torn sheet music', text: "A scrap of an elven lullaby, snagged on the latch of Vane's door.", lead: true },
  rune:    { icon: '🪓', name: 'The Ashmantle rune', text: "The murder weapon bears Thorin's family rune. It is unmistakably his." },
  wine:    { icon: '🫗', name: 'Who carried the wine', text: "Pip says Lyra insisted on carrying the lord's wine up herself.", lead: true },
  cellar:  { icon: '🕯️', name: 'Halden in the cellar', text: 'Pip was hauling a drunk Brother Halden out of the cellar when the scream came.' },
  lute:    { icon: '✨', name: 'A lingering lullaby', text: "Lyra's lute hums with a sleep enchantment cast tonight.", lead: true },
  dagger:  { icon: '💤', name: 'A guard who never sleeps', text: 'Thorin dozed off while the elf sang. When he woke, his dagger was gone.', lead: true },
  grudge:  { icon: '😠', name: "Thorin's grudge", text: "Vane owed Thorin three months' pay. The dwarf doesn't hide his anger." },
  debt:    { icon: '📜', name: "The temple's debt", text: "Vane was about to call in the temple's debts. Halden argued with him at supper." },
  witness: { icon: '👁️', name: 'A figure at the door', text: "Halden saw a slender figure with a lute case slip out of Vane's room near midnight.", lead: true },
  ledger:  { icon: '📒', name: 'The singed ledger', text: 'Seraphine\'s ledger: "1 vial Midnight Tears, sold to L.M., paid in silver."', lead: true },
  ashes:   { icon: '🔥', name: 'Burned papers', text: 'Seraphine burned a stack of papers soon after Vane died.' },
  cargo:   { icon: '📦', name: 'Smuggled cargo', text: "Seraphine's wagons hide untaxed silk. Vane was about to seize them." },
  vial:    { icon: '🧪', name: 'The empty vial', text: "Hidden in Lyra's lute case: an empty vial that smells of nightbloom.", lead: true },
  motive:  { icon: '⚖️', name: 'A brother hanged', text: "A notice: \"Elric Moonwhisper, hanged by order of Magistrate Vane.\" He was Lyra's brother.", lead: true },
};

export const LOCATIONS = [
  { id: 'body',     label: "🛏️ Search Lord Vane's chamber",    scene: 'loc_body' },
  { id: 'bar',      label: '🍺 Question Pip in the common room', scene: 'loc_bar' },
  { id: 'guard',    label: '🐴 Find Thorin in the stables',      scene: 'loc_guard' },
  { id: 'chapel',   label: '☀️ Speak with Brother Halden',       scene: 'loc_chapel' },
  { id: 'merchant', label: "🔥 Visit Seraphine's room",          scene: 'loc_merchant' },
  { id: 'bard',     label: "🎻 Sneak into Lyra's room",          scene: 'loc_bard' },
];

// Private hints dealt one per player at the start. Some help, some mislead.
export const WHISPERS = [
  "At supper, Lyra the bard didn't touch a drop of the lord's wine, though she kept filling his cup.",
  'You heard Seraphine hiss at Vane: "You\'ll ruin me, you old vulture."',
  'Thorin was yawning by the fire just before midnight, which is odd for a veteran bodyguard.',
  'Brother Halden slipped toward the cellar stairs around midnight with an empty mug.',
  'Pip muttered that the bard was "awfully keen" to help in the kitchen tonight.',
  'Vane laughed at supper: "I\'ve hanged better singers than you, girl." The bard just smiled and kept playing.',
];

// Scene fields:
//   text: paragraphs. {marks} and {accused} are filled in at runtime.
//         [audio tags] like [whispers] direct the voice actors (ElevenLabs v4) and are hidden on screen.
//   choices: [{label, to}] or [{label, check: {skill, dc, pass, fail}}]
//   next: scene to continue to when there are no choices
//   clue: clue id granted on entering. location: consumes a candle-mark on entering.
//   hub / accuse / ending: special scene kinds.
//   speaker: who voices the "quoted" lines in the audio narration (a list = one per quote, in order).
export const SCENES = {
  intro: {
    speaker: 'pip',
    art: '⛈️', title: 'A Storm at the Drowned Lantern',
    text: [
      '[ominously] Rain hammers the Drowned Lantern, a crooked inn on the High Road. The river has swallowed the only bridge, so nobody leaves tonight.',
      "[pause] At the stroke of midnight a scream splits the storm. [gravely] Lord Aldric Vane, the King's Magistrate, lies dead in his room with a dwarven dagger buried in his chest.",
      'Pip Underbough, the halfling innkeeper, grabs your sleeve. "[panicked, breathless] You\'re adventurers, aren\'t you? The bridge opens at dawn, and the killer will walk right out. [desperately] Please, find them before then."',
    ],
    next: 'suspects',
  },
  suspects: {
    art: '🕯️', title: 'The Guests',
    text: [
      '[conspiratorially] Five people besides your party are trapped here tonight:',
      "🪓 <b>Thorin Ashmantle</b>, Vane's dwarf bodyguard. It was his dagger.",
      '☀️ <b>Brother Halden</b>, a priest of Lathander traveling with Vane.',
      '🔥 <b>Seraphine Vell</b>, a tiefling merchant whose cargo Vane meant to seize.',
      '🎻 <b>Lyra Moonwhisper</b>, an elven bard who sang for the lord at supper.',
      '🍺 <b>Pip Underbough</b>, the innkeeper who begged for your help.',
      '[gravely] Dawn is four candle-marks away, and every search burns one. <b>Check your phone:</b> each of you noticed something at supper.',
    ],
    next: 'hub',
  },
  hub: {
    art: '🕯️', title: 'The Candle Burns', hub: true,
    text: ['[ominously] The storm howls against the shutters. [urgently] Dawn is {marks} away.', '[eagerly] Where does the party search next?'],
  },
  dawn: {
    art: '🌅', title: 'First Light',
    text: [
      '[softly] The last candle gutters out. Grey light seeps under the door, and the river is falling fast.',
      'Everyone gathers in the common room. [dramatically] Before the bridge opens, you must name the killer.',
    ],
    next: 'accuse',
  },
  accuse: {
    art: '⚖️', title: 'Name the Killer', accuse: true,
    text: [
      'The guests stand around the dying fire. Thorin grips his empty sheath, Halden mutters prayers, Seraphine smiles thinly, Lyra tunes her lute, and Pip wrings his apron.',
      'Review your clues. [pause] [slowly, dramatically] Who murdered Lord Aldric Vane?',
    ],
  },

  // --- Vane's chamber ---
  loc_body: {
    art: '🛏️', title: "Lord Vane's Chamber", location: 'body',
    text: ["[grimly] Vane lies sprawled beside an overturned chair with Thorin's dagger in his chest. A half-finished goblet of wine sits on the desk. The window is latched from the inside."],
    choices: [
      { label: '🩺 Examine the wound (Medicine, DC 11)', check: { skill: 'Medicine', dc: 11, pass: 'body_wound', fail: 'body_rune' } },
      { label: '🍷 Sniff the wine goblet', to: 'body_goblet' },
      { label: '🔎 Search every inch of the room (Investigation, DC 14)', check: { skill: 'Investigation', dc: 14, pass: 'body_music', fail: 'body_rune' } },
    ],
  },
  body_wound: {
    art: '🩸', title: 'A Bloodless Wound', clue: 'wound', next: 'hub',
    text: [
      "You kneel by the body. The stab wound has barely bled, and Vane's lips are tinged blue.",
      '[gasps] He was dead before the blade ever touched him. Someone poisoned him, then used the dagger to mislead.',
    ],
  },
  body_goblet: {
    art: '🍷', title: 'Midnight Tears', clue: 'goblet', next: 'hub',
    text: [
      'The wine smells cloyingly sweet, like night-blooming flowers.',
      'You recognize it: [whispers] Midnight Tears, a rare poison sold only by smugglers on the Sword Coast.',
    ],
  },
  body_music: {
    art: '🎼', title: 'A Scrap of Song', clue: 'music', next: 'hub',
    text: [
      'Behind the door, snagged on the latch, you find a torn corner of sheet music.',
      'The notes are written in elvish script. [eerily] They are the opening bars of a lullaby.',
    ],
  },
  body_rune: {
    art: '🪓', title: 'The Ashmantle Rune', clue: 'rune', next: 'hub',
    text: [
      "You find nothing unusual except the dagger itself.",
      '[ominously] Its hilt bears the Ashmantle family rune. There is no doubt it belongs to Thorin.',
    ],
  },

  // --- Common room ---
  loc_bar: {
    art: '🍺', title: 'The Common Room', location: 'bar',
    text: [
      'Pip polishes the same mug over and over. The fire has burned low.',
      '[mysteriously] In the corner, Lyra idly tunes her lute and watches you over the strings.',
    ],
    choices: [
      { label: '🍷 Ask Pip who took the lord his wine', to: 'bar_wine' },
      { label: '😤 Press Pip on where HE was at midnight (Intimidation, DC 12)', check: { skill: 'Intimidation', dc: 12, pass: 'bar_cellar', fail: 'bar_clam' } },
      { label: "✨ Ask to admire Lyra's lute (Arcana, DC 13)", check: { skill: 'Arcana', dc: 13, pass: 'bar_lute', fail: 'bar_lute_fail' } },
    ],
  },
  bar_wine: {
    speaker: 'pip',
    art: '🫗', title: 'A Helpful Bard', clue: 'wine', next: 'hub',
    text: [
      '"[cheerfully] His lordship\'s wine? The bard took it up," Pip says. "Insisted on it. Said she\'d sing him a private song to make up for something."',
      '"[slowly realizing] I thought it was sweet of her, at the time."',
    ],
  },
  bar_cellar: {
    speaker: 'pip',
    art: '🕯️', title: "Pip's Alibi", clue: 'cellar', next: 'hub',
    text: [
      'Pip squeaks and confesses. "[squeaking, panicked] I was in the cellar! Brother Halden was down there, drunk on my best red. I was hauling him back up the stairs when the scream came."',
      'That accounts for both of them at midnight.',
    ],
  },
  bar_clam: {
    speaker: 'pip',
    art: '😶', title: 'Nothing to Say', next: 'hub',
    text: [
      'Pip flinches and clams up. "[whimpering] I\'ve told you everything! Please, I just want this night to end."',
      "The fire crackles. You've learned nothing, and the candle burns lower.",
    ],
  },
  bar_lute: {
    art: '✨', title: 'A Lingering Lullaby', clue: 'lute', next: 'hub',
    text: [
      'Lyra hands it over with a smile. As you touch the strings, a soft warmth crawls up your arm and [drowsily] your eyelids grow heavy.',
      'Someone used this lute to cast a sleep enchantment tonight. [suspiciously] Lyra takes it back a little too quickly.',
    ],
  },
  bar_lute_fail: {
    speaker: 'lyra',
    art: '🎻', title: 'Just a Lute', next: 'hub',
    text: [
      "It's a fine elven instrument, but if it holds any secrets, they're beyond you.",
      '"[laughs softly] Careful, darling, it\'s older than your grandmother," Lyra says, taking it back.',
    ],
  },

  // --- Stables ---
  loc_guard: {
    speaker: 'thorin',
    art: '🐴', title: 'The Stables', location: 'guard',
    text: [
      'Thorin Ashmantle sits on a hay bale, turning his empty sheath over in his hands.',
      '"[growling] I didn\'t kill him," he growls. "[bitterly] But I failed him all the same."',
    ],
    choices: [
      { label: '🗡️ Ask how he lost his dagger', to: 'guard_dagger' },
      { label: '👁️ Watch him closely for lies (Insight, DC 10)', check: { skill: 'Insight', dc: 10, pass: 'guard_truth', fail: 'guard_grudge' } },
    ],
  },
  guard_dagger: {
    speaker: 'thorin',
    art: '💤', title: 'A Guard Who Never Sleeps', clue: 'dagger', next: 'hub',
    text: [
      '"[proudly] Thirty years I\'ve stood watch. Never once slept on duty," Thorin says.',
      '"[ashamed] Tonight I sat by the fire while the elf sang. Next thing I know, I\'m waking up, my blade is gone, and the lord is dead."',
    ],
  },
  guard_truth: {
    speaker: 'thorin',
    art: '🧔', title: 'An Honest Dwarf', clue: 'dagger', next: 'hub',
    text: [
      "Thorin's shame is real. You'd bet your life he's telling the truth.",
      '"[mutters darkly] It was the elf\'s song," he mutters. "I closed my eyes for one verse and woke an hour later. My dagger was gone from my belt."',
    ],
  },
  guard_grudge: {
    speaker: 'thorin',
    art: '😠', title: 'Bad Blood', clue: 'grudge', next: 'hub',
    text: [
      "You can't read him, but Thorin isn't hiding his anger.",
      '"[angrily] Three months\' pay he owed me. I won\'t miss him. But I didn\'t kill him."',
    ],
  },

  // --- Prayer nook ---
  loc_chapel: {
    art: '☀️', title: 'The Prayer Nook', location: 'chapel',
    text: ['[hushed] Brother Halden kneels before a little sunburst shrine. His hands shake, and he reeks of wine.'],
    choices: [
      { label: '📜 Ask about his argument with Vane at supper', to: 'chapel_debt' },
      { label: '🤝 Calm him and ask what he saw (Persuasion, DC 12)', check: { skill: 'Persuasion', dc: 12, pass: 'chapel_witness', fail: 'chapel_debt' } },
    ],
  },
  chapel_debt: {
    speaker: 'halden',
    art: '📜', title: "The Temple's Debt", clue: 'debt', next: 'hub',
    text: [
      '"[slurring slightly] Vane held the temple\'s debts," Halden admits. "He meant to call them in and turn the orphans out. Yes, we quarrelled."',
      'He meets your eyes. "[solemnly] But Lathander forbids murder. I would never."',
    ],
  },
  chapel_witness: {
    speaker: 'halden',
    art: '👁️', title: 'A Figure at the Door', clue: 'witness', next: 'hub',
    text: [
      'Halden takes a shaky breath. "[nervously] Near midnight I went down for... [hiccups] more wine. On the way I passed his lordship\'s door."',
      '"[whispers] Someone slipped out. Slender, light on their feet, carrying a lute case. I thought nothing of it until now."',
    ],
  },

  // --- Seraphine's room ---
  loc_merchant: {
    speaker: 'seraphine',
    art: '🔥', title: "Seraphine's Room", location: 'merchant',
    text: [
      'Seraphine Vell sits by her hearth, feeding papers into the flames one by one. Her tail flicks lazily.',
      '"[purring, seductively] Can I help you, darlings?"',
    ],
    choices: [
      { label: '🔥 Snatch the papers from the fire (Sleight of Hand, DC 12)', check: { skill: 'Sleight of Hand', dc: 12, pass: 'merchant_ledger', fail: 'merchant_ashes' } },
      { label: '📦 Ask why Vane wanted her cargo', to: 'merchant_cargo' },
    ],
  },
  merchant_ledger: {
    art: '📒', title: 'The Singed Ledger', clue: 'ledger', next: 'hub',
    text: [
      "You pluck a smouldering ledger from the coals. Seraphine hisses but doesn't stop you.",
      'Most of it is smuggling records. [dramatically] One line stands out: "1 vial Midnight Tears, sold to L.M., paid in silver."',
    ],
  },
  merchant_ashes: {
    speaker: 'seraphine',
    art: '🔥', title: 'Ashes', clue: 'ashes', next: 'hub',
    text: [
      'Your fingers close on nothing but ash. Seraphine laughs.',
      '"[laughs] Old love letters, darling. Nothing that would interest you."',
    ],
  },
  merchant_cargo: {
    speaker: 'seraphine',
    art: '📦', title: 'Smuggled Silk', clue: 'cargo', next: 'hub',
    text: [
      '"[casually] Untaxed Calishite silk," Seraphine says with a shrug. "Vane was going to seize my wagons and ruin me."',
      '"[mischievously] Am I sorry he\'s dead? Not at all. Did I kill him? [laughs] Darling, I\'m a smuggler, not a fool."',
    ],
  },

  // --- Lyra's room ---
  loc_bard: {
    art: '🎻', title: "Lyra's Room", location: 'bard',
    text: [
      'Lyra is downstairs in the common room. Her own room is tidy, [suspiciously] almost too tidy.',
      'A lute case lies on the bed, and a bundle of letters sits on the desk.',
    ],
    choices: [
      { label: '🎒 Search the lute case (Investigation, DC 11)', check: { skill: 'Investigation', dc: 11, pass: 'bard_vial', fail: 'bard_nothing' } },
      { label: '✉️ Read the letters on the desk', to: 'bard_letters' },
    ],
  },
  bard_vial: {
    art: '🧪', title: 'The Empty Vial', clue: 'vial', next: 'hub',
    text: [
      'Under the velvet lining of the case, your fingers find a tiny glass vial. [whispers] It is empty.',
      'When you uncork it, the room fills with the sickly-sweet scent of night-blooming flowers.',
    ],
  },
  bard_nothing: {
    art: '🎻', title: 'Rosin and Strings', next: 'hub',
    text: [
      'Spare strings, a cake of rosin, a few copper coins. Nothing more.',
      '[urgently] Footsteps on the stairs! You slip out before anyone sees you.',
    ],
  },
  bard_letters: {
    speaker: ['narrator', 'lyra'],
    art: '⚖️', title: 'A Brother Hanged', clue: 'motive', next: 'hub',
    text: [
      'Under the letters lies a yellowed notice: "Elric Moonwhisper, hanged for theft by order of Magistrate Aldric Vane."',
      'On top, in fresh ink: "[softly, grieving] Dear brother, tonight I will sing for you one last time."',
    ],
  },

  // --- Endings ---
  end_justice: {
    speaker: ['narrator', 'lyra', 'lyra'],
    art: '🏆', title: 'The Last Song', ending: true, win: true,
    text: [
      '"[dramatically] Lyra Moonwhisper." The room goes silent as you lay out the evidence piece by piece.',
      'The bard\'s smile fades. "[quietly, bitter] He hanged my brother over a loaf of bread," she says quietly. "[coldly] I poisoned his wine, sang the dwarf to sleep, and borrowed his dagger so no one would suspect a song."',
      'At dawn Lyra crosses the bridge in chains. Justice is done, though nobody feels much like celebrating. <b>[triumphantly] The party solved the murder!</b>',
    ],
  },
  end_escape: {
    art: '🌫️', title: 'A Song Unfinished', ending: true,
    text: [
      'You name Lyra Moonwhisper, but your evidence is thin. She laughs it off, and the others aren\'t convinced.',
      'At dawn the bard strolls across the bridge, humming. Weeks later you hear the truth: Vane hanged her brother years ago, and she poisoned his wine to avenge him.',
      '[sighs] <b>You had the right name but not enough proof.</b>',
    ],
  },
  end_wrong: {
    art: '💀', title: 'The Wrong Neck', ending: true,
    text: [
      'You accuse {accused}. The guests turn on them, and at dawn they are dragged off in irons, protesting all the way.',
      '[softly] In the common room, Lyra Moonwhisper plays a soft, sad tune, then slips away across the bridge.',
      '[pause] Months later the truth comes out. Vane had hanged Lyra\'s brother. She poisoned his wine, sang Thorin to sleep, and planted his dagger. <b>[ominously] The real killer walked free.</b>',
    ],
  },
};

export function choicesFor(S) {
  const sc = SCENES[S.sceneId];
  if (!sc || sc.ending) return [];
  if (sc.hub) {
    const list = LOCATIONS.filter(l => !S.visited.includes(l.id)).map(l => ({ label: l.label, to: l.scene }));
    if (S.visited.length) list.push({ label: '⚖️ Gather everyone and name the killer', to: 'accuse' });
    return list;
  }
  if (sc.accuse) return Object.entries(SUSPECTS).map(([id, s]) => ({ label: `${s.icon} ${s.name}`, accuse: id }));
  return sc.choices || [];
}

export function leadsFound(clues) {
  return clues.filter(c => CLUES[c]?.lead).length;
}

export function endingFor(accused, clues) {
  if (accused !== CULPRIT) return 'end_wrong';
  return leadsFound(clues) >= LEADS_NEEDED ? 'end_justice' : 'end_escape';
}

// Audio tags are for the voice actors only.
export const stripTags = text => text.replace(/\[[^\]]*\]\s*/g, '');

export function sceneText(S) {
  const sc = SCENES[S.sceneId];
  if (!sc) return [];
  const marks = `${S.marksLeft} candle-mark${S.marksLeft === 1 ? '' : 's'}`;
  const accused = SUSPECTS[S.accused]?.name || 'someone';
  return sc.text.map(p => stripTags(p).replaceAll('{marks}', marks).replaceAll('{accused}', accused));
}

// --- Narration audio (generated by tools/voices.mjs into audio/) ---

// A scene's narration as an ordered list of clips. Any sentence containing a {placeholder}
// becomes its own small clip (one recording per value, e.g. hub-2-3 = "Dawn is 3 candle-marks
// away."), so the rest of the scene is recorded once and shared by every variant.
//   → [{ key, title, parts }]   title: clip starts with the scene title; parts: paragraph text
export function narrationClips(S) {
  const sc = SCENES[S.sceneId];
  if (!sc) return [];
  const values = { marks: `${S.marksLeft} candle-mark${S.marksLeft === 1 ? '' : 's'}`, accused: SUSPECTS[S.accused]?.name || 'someone' };
  const variant = { marks: S.marksLeft, accused: S.accused };
  const clips = [];
  let buffer = { title: true, parts: [] };
  const flush = () => {
    if (buffer.title || buffer.parts.length) clips.push(buffer);
    buffer = { title: false, parts: [] };
  };
  for (const para of sc.text) {
    if (!para.includes('{')) { buffer.parts.push(para); continue; }
    let rest = [];
    for (const sentence of para.match(/[^.!?]+[.!?]+["']?\s*/g) || [para]) {
      const name = sentence.match(/\{(\w+)\}/)?.[1];
      if (!name) { rest.push(sentence.trim()); continue; }
      if (rest.length) { buffer.parts.push(rest.join(' ')); rest = []; }
      flush();
      clips.push({ title: false, parts: [sentence.replaceAll(`{${name}}`, values[name]).trim()], value: variant[name] });
    }
    if (rest.length) buffer.parts.push(rest.join(' '));
  }
  flush();
  return clips.map((c, i) => ({
    ...c,
    key: clips.length === 1 ? S.sceneId : `${S.sceneId}-${i + 1}${c.value != null ? `-${c.value}` : ''}`,
  }));
}

// Every narration variant the game can show, as minimal states for narrationClips.
export function narrationStates() {
  const states = [];
  for (const sceneId of Object.keys(SCENES)) {
    if (sceneId === 'hub') {
      for (let m = START_MARKS; m >= 1; m--) states.push({ sceneId, marksLeft: m, accused: '' });
    } else if (sceneId === 'end_wrong') {
      for (const id of Object.keys(SUSPECTS)) if (id !== CULPRIT) states.push({ sceneId, marksLeft: 0, accused: id });
    } else {
      states.push({ sceneId, marksLeft: 0, accused: '' });
    }
  }
  return states;
}

// The narrator's over-the-top reaction when a d20 lands.
export const ROLL_LINES = {
  'roll-nat20': '[shouting with excitement] A NATURAL TWENTY! [gasps] The very gods bow before you!',
  'roll-nat1': '[long pause] A natural one. [sighs] Oh no. [whispers] Oh no, no, no.',
  'roll-success': '[triumphantly] Success!',
  'roll-failure': '[sarcastic] Failure. How... unfortunate.',
};

export function rollAudioKey(roll) {
  if (roll.value === 20) return 'roll-nat20';
  if (roll.value === 1) return 'roll-nat1';
  return roll.success ? 'roll-success' : 'roll-failure';
}
