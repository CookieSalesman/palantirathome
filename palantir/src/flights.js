// ── FLIGHT TRACKER ───────────────────────────────────────────
// OpenSky Network (anonymous or authenticated) + ADS-B Exchange
// Renders aircraft as billboards with heading arrows

import { viewer } from './globe.js';
import { Config }  from './config.js';
import { intel }   from './intel.js';

const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const ADSB_URL    = 'https://adsbexchange-com1.p.rapidapi.com/v2/lat/0/lon/0/dist/250/';

let flightEntities = new Map();   // icao24 → Cesium entity
let flightData     = new Map();   // icao24 → latest state vector
let fetchInterval  = null;
let active         = false;
let useAdsb        = false;

// Aircraft billboard appearance
const PLANE_ICON = buildPlaneCanvas();

function buildPlaneCanvas() {
  const c  = document.createElement('canvas');
  c.width  = 32; c.height = 32;
  const cx = c.getContext('2d');
  cx.fillStyle    = '#44aaff';
  cx.strokeStyle  = '#88ccff';
  cx.lineWidth    = 1;
  // Body
  cx.beginPath();
  cx.moveTo(16, 4);
  cx.lineTo(19, 14); cx.lineTo(28, 18);
  cx.lineTo(19, 18); cx.lineTo(17, 28);
  cx.lineTo(16, 25); cx.lineTo(15, 28);
  cx.lineTo(13, 18); cx.lineTo(4, 18);
  cx.lineTo(13, 14); cx.closePath();
  cx.fill(); cx.stroke();
  return c.toDataURL();
}

export function initFlights(adsbMode = false) {
  if (active) return;
  active  = true;
  useAdsb = adsbMode && Config.hasAdsb();

  intel.flight(`Flight tracker ON (${useAdsb ? 'ADS-B Exchange' : 'OpenSky'})`);
  fetchFlights();
  fetchInterval = setInterval(fetchFlights, useAdsb ? 8000 : 15000);
}

export function stopFlights() {
  if (!active) return;
  active = false;
  clearInterval(fetchInterval);
  flightEntities.forEach(e => viewer.entities.remove(e));
  flightEntities.clear();
  flightData.clear();
  intel.flight('Flight tracker OFF');
}

async function fetchFlights() {
  try {
    let states = [];
    if (useAdsb) {
      states = await fetchAdsb();
    } else {
      states = await fetchOpenSky();
    }
    updateEntities(states);
    document.getElementById('stat-flights').textContent = flightEntities.size;
  } catch (e) {
    intel.alert(`Flight fetch error: ${e.message}`);
  }
}

async function fetchOpenSky() {
  const headers = {};
  if (Config.hasOpensky()) {
    headers['Authorization'] = 'Basic ' +
      btoa(`${Config.openskyUser}:${Config.openskyPass}`);
  }
  const res = await fetch(OPENSKY_URL, { headers });
  if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
  const json = await res.json();
  return (json.states || []).map(parseOpenSkyState);
}

function parseOpenSkyState(s) {
  return {
    icao24:    s[0],
    callsign:  (s[1] || '').trim() || s[0].toUpperCase(),
    lon:       s[5],
    lat:       s[6],
    altBaro:   s[7],   // metres
    onGround:  s[8],
    velocity:  s[9],   // m/s
    heading:   s[10],  // degrees
    vertRate:  s[11],
    origin:    s[2],
  };
}

async function fetchAdsb() {
  const res = await fetch(ADSB_URL, {
    headers: {
      'X-RapidAPI-Key':  Config.adsbKey,
      'X-RapidAPI-Host': 'adsbexchange-com1.p.rapidapi.com',
    }
  });
  if (!res.ok) throw new Error(`ADS-B HTTP ${res.status}`);
  const json = await res.json();
  return (json.ac || []).map(a => ({
    icao24:   a.hex,
    callsign: a.flight?.trim() || a.hex.toUpperCase(),
    lon:      parseFloat(a.lon),
    lat:      parseFloat(a.lat),
    altBaro:  parseFloat(a.alt_baro) * 0.3048, // ft → m
    onGround: a.alt_baro === 'ground',
    velocity: parseFloat(a.gs) * 0.514444,      // kts → m/s
    heading:  parseFloat(a.track),
    vertRate: parseFloat(a.baro_rate),
    military: !!(a.mil),
    category: a.category,
  }));
}

function updateEntities(states) {
  const seen = new Set();

  for (const ac of states) {
    if (!ac.lat || !ac.lon || ac.onGround) continue;
    seen.add(ac.icao24);
    flightData.set(ac.icao24, ac);

    const alt = ac.altBaro || 0;
    const pos = Cesium.Cartesian3.fromDegrees(ac.lon, ac.lat, alt);

    if (flightEntities.has(ac.icao24)) {
      // Update existing
      const e = flightEntities.get(ac.icao24);
      e.position = pos;
      if (ac.heading !== null) {
        e.billboard.rotation = Cesium.Math.toRadians(-(ac.heading || 0));
      }
    } else {
      // New entity
      const isMil = ac.military;
      const color = isMil
        ? Cesium.Color.fromCssColorString('#ff4444')
        : Cesium.Color.fromCssColorString('#44aaff');

      const entity = viewer.entities.add({
        id:       `flight_${ac.icao24}`,
        position: pos,
        billboard: {
          image:     PLANE_ICON,
          scale:     0.6,
          color:     color,
          rotation:  Cesium.Math.toRadians(-(ac.heading || 0)),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          sizeInMeters: false,
          pixelOffset: Cesium.Cartesian2.ZERO,
        },
        label: {
          text:            ac.callsign,
          font:            '9px Courier New',
          fillColor:       color,
          outlineColor:    Cesium.Color.BLACK,
          outlineWidth:    2,
          style:           Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset:     new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_000_000),
        },
        properties: {
          CALLSIGN:  ac.callsign,
          ICAO24:    ac.icao24.toUpperCase(),
          ALT_M:     Math.round(alt),
          ALT_FT:    Math.round(alt * 3.28084),
          SPEED_KTS: ac.velocity ? Math.round(ac.velocity * 1.944) : '—',
          HEADING:   ac.heading ? `${Math.round(ac.heading)}°` : '—',
          TYPE:      isMil ? 'MILITARY' : 'CIVIL',
        },
      });

      flightEntities.set(ac.icao24, entity);
      if (isMil) intel.alert(`MIL TRACK: ${ac.callsign} @ ${Math.round(alt / 1000)}km`);
    }
  }

  // Remove stale
  for (const [icao, entity] of flightEntities) {
    if (!seen.has(icao)) {
      viewer.entities.remove(entity);
      flightEntities.delete(icao);
      flightData.delete(icao);
    }
  }
}
