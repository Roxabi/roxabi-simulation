const APP_PREFIX = 'roxabi-sim';

export function createStorage(type, schemaVersion = 1) {
  const MAX = 5;
  const metaKey = id => `${APP_PREFIX}:meta:${type}:${id}`;
  const dataKey = id => `${APP_PREFIX}:data:${type}:${id}`;

  function getMeta(id) {
    try {
      const raw = localStorage.getItem(metaKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function setMeta(id, meta) { localStorage.setItem(metaKey(id), JSON.stringify(meta)); }
  function touch(id) {
    const meta = getMeta(id) || { created: Date.now() };
    meta.lastUsed = Date.now();
    setMeta(id, meta);
  }
  function generateId() { return 'sim-' + Math.random().toString(36).slice(2, 8); }

  function getAllIds() {
    const ids = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${APP_PREFIX}:meta:${type}:`)) ids.push(key.split(':').pop());
    }
    return ids;
  }

  function removeSim(id) {
    localStorage.removeItem(dataKey(id));
    localStorage.removeItem(metaKey(id));
  }

  function pruneIfNeeded() {
    const all = getAllIds();
    if (all.length < MAX) return;
    const metas = all.map(id => ({ id, ...getMeta(id) }));
    metas.sort((a, b) => (a.lastUsed || a.created || 0) - (b.lastUsed || b.created || 0));
    const toRemove = metas.slice(0, metas.length - MAX + 1);
    for (const s of toRemove) removeSim(s.id);
  }

  return {
    initTab() {
      let id = window.location.hash.replace('#', '');
      if (id && getMeta(id)) { touch(id); return id; }
      pruneIfNeeded();
      id = generateId();
      history.replaceState(null, '', '#' + id);
      touch(id);
      return id;
    },
    save(id, params) {
      const envelope = { version: schemaVersion, params, savedAt: Date.now() };
      localStorage.setItem(dataKey(id), JSON.stringify(envelope));
      touch(id);
    },
    load(id) {
      try {
        const raw = localStorage.getItem(dataKey(id));
        if (!raw) return null;
        const env = JSON.parse(raw);
        if (env?.version !== schemaVersion) {
          // version mismatch: discard stale entry
          removeSim(id);
          return null;
        }
        touch(id);
        return env.params;
      } catch { return null; }
    },
    remove(id) { removeSim(id); },
    rename(id, name) {
      const meta = getMeta(id);
      if (!meta) return;
      meta.name = name;
      setMeta(id, meta);
    },
    getAllIds,
    getAllSims() {
      return getAllIds()
        .map(id => ({ id, ...getMeta(id) }))
        .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    },
  };
}
