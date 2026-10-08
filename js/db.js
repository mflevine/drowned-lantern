// A tiny database wrapper with two backends:
//  - firebase: Firebase Realtime Database (used when firebase-config.js is filled in)
//  - local:    localStorage + BroadcastChannel, so you can test with several tabs
//              in one browser before setting up Firebase. Add ?local to any URL to force it.
import { firebaseConfig } from '../firebase-config.js';

const FIREBASE_VERSION = '10.12.2';
const params = new URLSearchParams(location.search);
const configured = !!firebaseConfig?.databaseURL && !firebaseConfig.databaseURL.includes('YOUR_');

export const mode = configured && !params.has('local') ? 'firebase' : 'local';

export function connect() {
  return mode === 'firebase' ? connectFirebase() : connectLocal();
}

async function connectFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, fb] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-database.js`),
  ]);
  const db = fb.getDatabase(initializeApp(firebaseConfig));
  const ref = path => fb.ref(db, path);
  let offset = 0;
  fb.onValue(ref('.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  return {
    mode,
    now: () => Date.now() + offset,
    on: (path, cb) => fb.onValue(ref(path), s => cb(s.val())),
    get: async path => (await fb.get(ref(path))).val(),
    set: (path, value) => fb.set(ref(path), value),
    update: (path, values) => fb.update(ref(path), values),
    remove: path => fb.remove(ref(path)),
    onDisconnectSet: (path, value) => fb.onDisconnect(ref(path)).set(value),
    onConnected: cb => fb.onValue(ref('.info/connected'), s => cb(!!s.val())),
  };
}

function connectLocal() {
  const KEY = 'mm-local-db';
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const listeners = new Set();
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const parts = path => path.split('/').filter(Boolean);
  const at = (tree, path) =>
    parts(path).reduce((o, k) => (o && typeof o === 'object' && k in o ? o[k] : null), tree);
  const put = (tree, path, value) => {
    const keys = parts(path);
    const last = keys.pop();
    let o = tree;
    for (const k of keys) {
      if (!o[k] || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    }
    if (value === null || value === undefined) delete o[last];
    else o[last] = JSON.parse(JSON.stringify(value));
  };

  let queued = false;
  const notify = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      for (const l of [...listeners]) l(load());
    }, 0);
  };
  if (channel) channel.onmessage = notify;
  window.addEventListener('storage', e => { if (e.key === KEY) notify(); });

  const write = fn => {
    const tree = load();
    fn(tree);
    try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch { /* storage full or blocked */ }
    channel?.postMessage(1);
    notify();
    return Promise.resolve();
  };

  return {
    mode,
    now: () => Date.now(),
    on(path, cb) {
      let last;
      const listener = tree => {
        const value = at(tree, path);
        const json = JSON.stringify(value ?? null);
        if (json === last) return;
        last = json;
        cb(JSON.parse(json));
      };
      listeners.add(listener);
      setTimeout(() => listener(load()), 0);
      return () => listeners.delete(listener);
    },
    get: async path => at(load(), path),
    set: (path, value) => write(t => put(t, path, value)),
    update: (path, values) => write(t => {
      for (const [k, v] of Object.entries(values)) put(t, `${path}/${k}`, v);
    }),
    remove: path => write(t => put(t, path, null)),
    onDisconnectSet: async () => {},
    onConnected: cb => setTimeout(() => cb(true), 0),
  };
}
