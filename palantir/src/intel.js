// ── INTEL FEED ───────────────────────────────────────────────
// Central log bus — all modules write here

const MAX_ENTRIES = 120;

function ts() {
  return new Date().toUTCString().slice(17, 25); // HH:MM:SS
}

function append(msg, type = 'info') {
  const feed = document.getElementById('intel-feed');
  if (!feed) return;

  const el = document.createElement('div');
  el.className = `intel-entry ${type}`;
  el.innerHTML = `<span class="ts">[${ts()}]</span>${msg}`;
  feed.prepend(el);

  // Trim to MAX_ENTRIES
  while (feed.children.length > MAX_ENTRIES) {
    feed.removeChild(feed.lastChild);
  }
}

export const intel = {
  log:       (msg) => append(msg, 'info'),
  init:      (msg) => append(msg, 'init'),
  flight:    (msg) => append(msg, 'flight'),
  satellite: (msg) => append(msg, 'satellite'),
  alert:     (msg) => append(msg, 'alert'),
};
