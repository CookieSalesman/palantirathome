// ── PALANTIR — MAIN ORCHESTRATOR ─────────────────────────────

import { Config }              from './config.js';
import { initGlobe, setAtmosphere, loadGoogle3DTiles } from './globe.js';
import { initFlights, stopFlights }    from './flights.js';
import { loadSatellites, stopSatellites, toggleOrbitPaths, loadDemoSatellites } from './satellites.js';
import { initRoads, stopRoads }        from './roads.js';
import { initShaders, setMode }        from './shaders.js';
import { intel }               from './intel.js';

// ── CLOCK ────────────────────────────────────────────────────
function startClock() {
  setInterval(() => {
    const now = new Date();
    const hh  = String(now.getUTCHours()).padStart(2,'0');
    const mm  = String(now.getUTCMinutes()).padStart(2,'0');
    const ss  = String(now.getUTCSeconds()).padStart(2,'0');
    document.getElementById('utc-time').textContent = `UTC ${hh}:${mm}:${ss}`;
    document.getElementById('local-date').textContent =
      now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  }, 1000);
}

// ── FPS COUNTER ──────────────────────────────────────────────
function startFPS() {
  let last = performance.now();
  let frames = 0;
  function tick() {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      document.getElementById('fps-counter').textContent = `FPS: ${frames}`;
      frames = 0;
      last   = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── CONFIG MODAL ─────────────────────────────────────────────
function showConfigModal() {
  document.getElementById('config-modal').classList.remove('hidden');
  // Pre-fill if keys exist
  document.getElementById('key-google').value       = Config.googleMapsKey;
  document.getElementById('key-cesium').value       = Config.cesiumToken;
  document.getElementById('key-adsb').value         = Config.adsbKey;
  document.getElementById('key-opensky-user').value = Config.openskyUser;
  document.getElementById('key-opensky-pass').value = Config.openskyPass;
}

function hideConfigModal() {
  document.getElementById('config-modal').classList.add('hidden');
}

// ── LAYER TOGGLES ─────────────────────────────────────────────
function wireToggles() {
  const on = (id, fn) => document.getElementById(id)
    .addEventListener('change', e => fn(e.target.checked));

  on('toggle-atmosphere', enabled => setAtmosphere(enabled));

  on('toggle-flights', async enabled => {
    if (enabled) initFlights(false);
    else stopFlights();
  });

  on('toggle-adsb', async enabled => {
    if (enabled) {
      if (!Config.hasAdsb()) {
        intel.alert('No ADS-B key — set in config');
        document.getElementById('toggle-adsb').checked = false;
        return;
      }
      initFlights(true);
    } else stopFlights();
  });

  on('toggle-gps', async enabled => {
    if (enabled) await loadSatellites('gps');
    else stopSatellites();
  });

  on('toggle-leo', async enabled => {
    if (enabled) await loadSatellites('leo');
    else stopSatellites();
  });

  on('toggle-orbits', enabled => toggleOrbitPaths(enabled));

  on('toggle-roads', async enabled => {
    if (enabled) await initRoads();
    else stopRoads();
  });

  on('toggle-cctv', enabled => {
    if (enabled) intel.log('CCTV: Loading Austin traffic cameras…');
    // CCTV projection is a stretch goal — see notes
    intel.alert('CCTV texture projection: requires CORS-enabled stream URLs');
  });

  on('toggle-3dtiles', async enabled => {
    if (enabled && Config.hasGoogle()) await loadGoogle3DTiles();
    else if (enabled) intel.alert('3D Tiles: add Google Maps API key in config');
  });
}

// ── MODE BUTTONS ─────────────────────────────────────────────
function wireModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const m = btn.dataset.mode;
      setMode(m);
      document.getElementById('status-msg').textContent =
        `VIEW MODE: ${m.toUpperCase()}`;
    });
  });
}

// ── TIME CONTROLS ─────────────────────────────────────────────
function wireTimeControls() {
  let rate = 1;
  const display = document.getElementById('time-rate-display');

  document.getElementById('btn-realtime').addEventListener('click', () => {
    rate = 1;
    display.textContent = 'Rate: 1x (LIVE)';
    document.getElementById('btn-realtime').classList.add('active');
    intel.log('Time: LIVE');
  });

  document.getElementById('btn-faster').addEventListener('click', () => {
    rate = Math.min(rate * 10, 10000);
    display.textContent = `Rate: ${rate}x`;
    document.getElementById('btn-realtime').classList.remove('active');
    intel.log(`Time acceleration: ${rate}x`);
  });

  document.getElementById('btn-slower').addEventListener('click', () => {
    rate = Math.max(rate / 10, 0.1);
    display.textContent = `Rate: ${rate}x`;
    intel.log(`Time: ${rate}x`);
  });
}

// ── API KEY MODAL BUTTONS ────────────────────────────────────
function wireModalButtons() {
  document.getElementById('btn-save-keys').addEventListener('click', () => {
    Config.save({
      google:      document.getElementById('key-google').value.trim(),
      cesium:      document.getElementById('key-cesium').value.trim(),
      adsb:        document.getElementById('key-adsb').value.trim(),
      openskyUser: document.getElementById('key-opensky-user').value.trim(),
      openskyPass: document.getElementById('key-opensky-pass').value.trim(),
    });
    hideConfigModal();
    boot();
  });

  document.getElementById('btn-demo-mode').addEventListener('click', () => {
    hideConfigModal();
    bootDemo();
  });
}

// ── BOOT: WITH KEYS ──────────────────────────────────────────
async function boot() {
  document.getElementById('status-msg').textContent = 'INITIALIZING GLOBE…';
  await initGlobe();
  initShaders();
  intel.init('Globe ready. Toggle layers in the left panel.');
  document.getElementById('status-msg').textContent =
    Config.hasGoogle()
      ? 'PHOTOREALISTIC 3D TILES ACTIVE'
      : 'CESIUM TERRAIN ACTIVE — Add Google Maps key for 3D Tiles';
}

// ── BOOT: DEMO MODE ──────────────────────────────────────────
async function bootDemo() {
  document.getElementById('status-msg').textContent = 'DEMO MODE — No API keys required';
  await initGlobe();
  initShaders();

  intel.init('DEMO MODE ACTIVE');
  intel.init('Loading demo satellite constellation…');
  loadDemoSatellites();

  // Auto-enable GPS toggle
  document.getElementById('toggle-gps').checked = true;

  intel.init('Tip: Toggle layers in the left panel. Add API keys for live data.');
  document.getElementById('status-msg').textContent =
    'DEMO MODE — 8 demo satellites active | Toggle NVG/FLIR/RADAR view modes';
}

// ── ENTRY POINT ──────────────────────────────────────────────
async function main() {
  startClock();
  startFPS();
  wireToggles();
  wireModeButtons();
  wireTimeControls();
  wireModalButtons();

  // Show modal if no keys saved, else boot directly
  if (Config.hasAny()) {
    hideConfigModal();
    await boot();
  } else {
    showConfigModal();
    intel.init('Waiting for API key configuration…');
  }
}

main().catch(console.error);
