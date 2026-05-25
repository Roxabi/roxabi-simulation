const PREFIX = 'roxabi-sim';
const TYPE = 'tmi';
const MAX = 5;

function metaKey(id) { return `${PREFIX}:meta:${TYPE}:${id}`; }
function dataKey(id) { return `${PREFIX}:data:${TYPE}:${id}`; }

function getMeta(id) {
  const raw = localStorage.getItem(metaKey(id));
  return raw ? JSON.parse(raw) : null;
}

function setMeta(id, meta) {
  localStorage.setItem(metaKey(id), JSON.stringify(meta));
}

function touch(id) {
  const meta = getMeta(id) || { created: Date.now() };
  meta.lastUsed = Date.now();
  setMeta(id, meta);
}

function pruneIfNeeded() {
  const all = getAllIds();
  if (all.length < MAX) return;
  const metas = all.map(id => ({ id, ...getMeta(id) }));
  metas.sort((a, b) => (a.lastUsed || a.created || 0) - (b.lastUsed || a.created || 0));
  const toRemove = metas.slice(0, metas.length - MAX + 1);
  for (const s of toRemove) {
    localStorage.removeItem(dataKey(s.id));
    localStorage.removeItem(metaKey(s.id));
  }
}

function generateId() {
  return 'sim-' + Math.random().toString(36).slice(2, 8);
}

export function initTab() {
  let id = window.location.hash.replace('#', '');
  if (id && getMeta(id)) {
    touch(id);
    return id;
  }
  pruneIfNeeded();
  id = generateId();
  history.replaceState(null, '', '#' + id);
  touch(id);
  return id;
}

export function save(id, inputs) {
  localStorage.setItem(dataKey(id), JSON.stringify(inputs));
  touch(id);
}

export function load(id) {
  const raw = localStorage.getItem(dataKey(id));
  if (!raw) return null;
  touch(id);
  return JSON.parse(raw);
}

export function getAllIds() {
  const ids = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${PREFIX}:meta:${TYPE}:`)) {
      ids.push(key.split(':').pop());
    }
  }
  return ids;
}

export function getAllSims() {
  return getAllIds()
    .map(id => ({ id, ...getMeta(id) }))
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}
