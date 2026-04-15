// ── SATELLITE TRACKER ────────────────────────────────────────
// CelesTrak TLE data → satellite.js propagation → Cesium entities
// Renders real-time orbital positions + optional path arcs

import { viewer } from './globe.js';
import { intel }  from './intel.js';

// CelesTrak CORS-friendly proxy via their own API endpoint
const TLE_SOURCES = {
  gps: 'https://celestrak.org/SOCRATES/query.php?GROUP=gps-ops&FORMAT=tle',
  leo: 'https://celestrak.org/SOCRATES/query.php?GROUP=active&FORMAT=tle',
  // Direct TLE endpoints (plain text, CORS-enabled)
  gps_direct: 'https://celestrak.org/GPS/gps-ops.txt',
  starlink:   'https://celestrak.org/SATCAT/starlink.txt',
  stations:   'https://celestrak.org/stations/stations.txt',
};

// CelesTrak new API format
const CELESTRAK_API = 'https://celestrak.org/SATCAT/elements.php?GROUP=';
const GROUPS = {
  gps:      'gps-ops',
  leo:      'active',
  stations: 'stations',
};

let satEntities  = new Map();   // satnum → Cesium entity
let orbitPaths   = new Map();   // satnum → path entity
let satRecords   = new Map();   // satnum → { satrec, name }
let animFrame    = null;
let showOrbits   = false;
let activeSets   = new Set();

export async function loadSatellites(group = 'gps') {
  const url = buildTleUrl(group);
  intel.satellite(`Fetching TLE: ${group.toUpperCase()}…`);

  try {
    const tleText = await fetchTle(url);
    const parsed  = parseTle(tleText);
    intel.satellite(`Loaded ${parsed.length} ${group.toUpperCase()} TLEs`);
    activeSets.add(group);

    for (const { name, line1, line2 } of parsed) {
      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        const satnum = satrec.satnum;
        satRecords.set(satnum, { satrec, name: name.trim() });
      } catch (e) { /* bad TLE, skip */ }
    }

    if (!animFrame) startLoop();
    return parsed.length;
  } catch (e) {
    intel.alert(`TLE fetch failed (${group}): ${e.message}`);
    // Fall back to demo sats
    loadDemoSatellites();
    return 0;
  }
}

function buildTleUrl(group) {
  // CelesTrak new JSON API, returns TLE-formatted text
  const g = GROUPS[group] || group;
  return `https://celestrak.org/SATCAT/elements.php?GROUP=${g}&FORMAT=tle`;
}

async function fetchTle(url) {
  // Try direct, then CORS proxy
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    // Fallback proxy
    const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error(`Proxy HTTP ${r2.status}`);
    return await r2.text();
  }
}

function parseTle(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    if (lines[i+1]?.startsWith('1 ') && lines[i+2]?.startsWith('2 ')) {
      result.push({ name: lines[i], line1: lines[i+1], line2: lines[i+2] });
    }
  }
  return result;
}

function startLoop() {
  function tick() {
    updatePositions();
    animFrame = requestAnimationFrame(tick);
  }
  animFrame = requestAnimationFrame(tick);
}

export function stopSatellites() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
  satEntities.forEach(e => viewer.entities.remove(e));
  orbitPaths.forEach(e => viewer.entities.remove(e));
  satEntities.clear();
  orbitPaths.clear();
  satRecords.clear();
  activeSets.clear();
  document.getElementById('stat-sats').textContent = '0';
  intel.satellite('Satellite tracker OFF');
}

function updatePositions() {
  const now        = new Date();
  const gmst       = satellite.gstime(now);
  let visible      = 0;

  for (const [satnum, { satrec, name }] of satRecords) {
    const posVel = satellite.propagate(satrec, now);
    if (!posVel.position) continue;

    const geo = satellite.eciToGeodetic(posVel.position, gmst);
    const lat = satellite.radiansToDegrees(geo.latitude);
    const lon = satellite.radiansToDegrees(geo.longitude);
    const alt = geo.height * 1000; // km → m

    if (isNaN(lat) || isNaN(lon) || isNaN(alt)) continue;
    visible++;

    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt);

    if (satEntities.has(satnum)) {
      satEntities.get(satnum).position = pos;
    } else {
      const altKm = alt / 1000;
      const color = altKm < 2000
        ? Cesium.Color.fromCssColorString('#00ff88')
        : Cesium.Color.fromCssColorString('#ffaa00');

      const entity = viewer.entities.add({
        id:       `sat_${satnum}`,
        position: pos,
        point: {
          pixelSize:  altKm < 2000 ? 3 : 2,
          color:      color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
        },
        label: {
          text:      name,
          font:      '8px Courier New',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style:     Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(6, 0),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
        },
        properties: {
          NAME:    name,
          SATNUM:  satnum,
          ALT_KM:  altKm.toFixed(1),
          LAT:     lat.toFixed(2),
          LON:     lon.toFixed(2),
          TYPE:    altKm < 2000 ? 'LEO' : altKm < 35_000 ? 'MEO' : 'GEO',
        },
      });
      satEntities.set(satnum, entity);
    }

    if (showOrbits) updateOrbitPath(satnum, satrec, now);
  }

  document.getElementById('stat-sats').textContent = visible;
}

export function toggleOrbitPaths(show) {
  showOrbits = show;
  if (!show) {
    orbitPaths.forEach(e => viewer.entities.remove(e));
    orbitPaths.clear();
  }
}

function updateOrbitPath(satnum, satrec, now) {
  // Sample one full orbital period (approx via mean motion)
  const period = (2 * Math.PI / satrec.no) * 60 * 1000; // ms
  const steps  = 120;
  const positions = [];

  for (let i = 0; i <= steps; i++) {
    const t    = new Date(now.getTime() + (i / steps) * period);
    const gmst = satellite.gstime(t);
    const pv   = satellite.propagate(satrec, t);
    if (!pv.position) continue;
    const geo  = satellite.eciToGeodetic(pv.position, gmst);
    const lat  = satellite.radiansToDegrees(geo.latitude);
    const lon  = satellite.radiansToDegrees(geo.longitude);
    const alt  = geo.height * 1000;
    if (!isNaN(lat) && !isNaN(lon) && !isNaN(alt)) {
      positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
    }
  }

  if (positions.length < 2) return;

  if (orbitPaths.has(satnum)) {
    orbitPaths.get(satnum).polyline.positions = positions;
  } else {
    const path = viewer.entities.add({
      polyline: {
        positions,
        width:    1,
        material: new Cesium.PolylineDashMaterialProperty({
          color:    Cesium.Color.fromCssColorString('#00ff8844'),
          dashLength: 16,
        }),
        clampToGround: false,
      }
    });
    orbitPaths.set(satnum, path);
  }
}

// ── DEMO SATELLITES (no API needed) ──────────────────────────
function loadDemoSatellites() {
  intel.satellite('Loading demo orbital dataset…');

  const DEMO_TLES = [
    ['ISS (ZARYA)',
     '1 25544U 98067A   24001.50000000  .00006143  00000+0  11511-3 0  9992',
     '2 25544  51.6406 108.3971 0001828  87.4088 272.7220 15.49804757432991'],
    ['STARLINK-1007',
     '1 44713U 19074A   24001.50000000  .00001469  00000+0  11374-3 0  9998',
     '2 44713  53.0534 216.4312 0001330  94.3157 265.7950 15.06390060232141'],
    ['GPS BIIR-2  (PRN 13)',
     '1 24876U 97035A   24001.50000000 -.00000023  00000+0  00000+0 0  9998',
     '2 24876  55.4849 179.4028 0044983  40.3154 320.0980  2.00558977192742'],
    ['NOAA 19',
     '1 33591U 09005A   24001.50000000  .00000082  00000+0  71072-4 0  9992',
     '2 33591  99.1909 344.0572 0014059 208.0289 151.9913 14.12393067769614'],
    ['TERRA',
     '1 25994U 99068A   24001.50000000  .00000038  00000+0  23697-4 0  9995',
     '2 25994  98.2044 244.5571 0001259  82.5613 277.5712 14.57126681278476'],
    ['AQUA',
     '1 27424U 02022A   24001.50000000  .00000090  00000+0  49540-4 0  9997',
     '2 27424  98.2072 272.2455 0002129  63.8640 296.2725 14.57120988142831'],
    ['SENTINEL-2A',
     '1 40697U 15028A   24001.50000000  .00000067  00000+0  37044-4 0  9996',
     '2 40697  98.5691 312.9388 0001094  99.2744 260.8583 14.30817757456019'],
    ['LANDSAT 8',
     '1 39084U 13008A   24001.50000000  .00000056  00000+0  32127-4 0  9993',
     '2 39084  98.2193 317.0049 0001310  90.3268 269.8072 14.57108059584411'],
  ];

  for (const [name, line1, line2] of DEMO_TLES) {
    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      satRecords.set(satrec.satnum, { satrec, name });
    } catch (e) { /* skip */ }
  }

  if (!animFrame) startLoop();
  intel.satellite(`Demo: ${DEMO_TLES.length} satellites active`);
}

export { loadDemoSatellites };
