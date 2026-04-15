// ── ROAD PARTICLE SYSTEM ─────────────────────────────────────
// Fetches OSM road network via Overpass API, then animates
// particles along road segments to simulate traffic flow.
// Rendered as a Canvas2D overlay projected onto the globe.

import { viewer } from './globe.js';
import { intel }  from './intel.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Query: main roads in a bounding box
const OVERPASS_QUERY = (south, west, north, east) => `
[out:json][timeout:25];
(
  way["highway"~"motorway|trunk|primary|secondary"]
  (${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`;

let particles     = [];
let roadSegments  = [];
let active        = false;
let animFrame     = null;
let canvas        = null;
let ctx           = null;
const MAX_PARTS   = 800;

export async function initRoads(bbox = { south: 30.1, west: -97.9, north: 30.5, east: -97.5 }) {
  if (active) return;

  intel.log('Fetching OSM road network…');
  try {
    const segments = await fetchRoads(bbox);
    intel.log(`OSM: ${segments.length} road segments loaded`);
    roadSegments = segments;
  } catch (e) {
    intel.alert(`OSM fetch failed: ${e.message} — using demo grid`);
    roadSegments = buildDemoGrid();
  }

  // Build overlay canvas
  canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:fixed; inset:0; z-index:5;
    pointer-events:none; width:100%; height:100%;
  `;
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  spawnParticles();
  active = true;
  loop();
  intel.log('Road particle system active');
}

export function stopRoads() {
  if (!active) return;
  active = false;
  cancelAnimationFrame(animFrame);
  if (canvas) canvas.remove();
  canvas = null; ctx = null;
  particles = [];
  intel.log('Road particles OFF');
}

async function fetchRoads(bbox) {
  const query = OVERPASS_QUERY(bbox.south, bbox.west, bbox.north, bbox.east);
  const res   = await fetch(OVERPASS_URL, {
    method: 'POST',
    body:   `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = await res.json();

  // Build node map
  const nodes = {};
  for (const el of json.elements) {
    if (el.type === 'node') nodes[el.id] = { lat: el.lat, lon: el.lon };
  }

  // Build segments from ways
  const segs = [];
  for (const el of json.elements) {
    if (el.type !== 'way') continue;
    const pts = (el.nodes || []).map(id => nodes[id]).filter(Boolean);
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push([pts[i], pts[i + 1]]);
    }
  }
  return segs;
}

function buildDemoGrid() {
  // Austin TX-ish synthetic grid
  const segs = [];
  for (let lat = 30.15; lat < 30.45; lat += 0.05) {
    for (let lon = -97.85; lon < -97.55; lon += 0.01) {
      segs.push([{ lat, lon }, { lat, lon: lon + 0.01 }]);
    }
  }
  for (let lon = -97.85; lon < -97.55; lon += 0.05) {
    for (let lat = 30.15; lat < 30.45; lat += 0.01) {
      segs.push([{ lat, lon }, { lat: lat + 0.01, lon }]);
    }
  }
  return segs;
}

function spawnParticles() {
  if (!roadSegments.length) return;
  for (let i = 0; i < MAX_PARTS; i++) {
    spawnOne();
  }
}

function spawnOne() {
  const seg = roadSegments[Math.floor(Math.random() * roadSegments.length)];
  particles.push({
    seg,
    t:     Math.random(),       // 0→1 position along segment
    speed: 0.001 + Math.random() * 0.003,
    color: Math.random() < 0.1 ? '#ff4444' : '#44aaff',
    alpha: 0.4 + Math.random() * 0.6,
    size:  1 + Math.random() * 1.5,
  });
}

function loop() {
  if (!active) return;
  animFrame = requestAnimationFrame(loop);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.t += p.speed;
    if (p.t > 1) {
      // Respawn on a new segment
      Object.assign(p, {
        seg:   roadSegments[Math.floor(Math.random() * roadSegments.length)],
        t:     0,
        speed: 0.001 + Math.random() * 0.003,
      });
      continue;
    }

    const a  = p.seg[0];
    const b  = p.seg[1];
    const lat = a.lat + (b.lat - a.lat) * p.t;
    const lon = a.lon + (b.lon - a.lon) * p.t;

    const screen = latLonToScreen(lat, lon);
    if (!screen) continue;

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function latLonToScreen(lat, lon) {
  if (!viewer) return null;
  try {
    const cart = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const scrn = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart);
    if (!scrn) return null;
    return { x: scrn.x * (canvas.width / window.innerWidth),
             y: scrn.y * (canvas.height / window.innerHeight) };
  } catch { return null; }
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
