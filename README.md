# palantirathome
"we have palantir at home"

An ex-google maps guy vibecoded himself a Palantir. https://www.youtube.com/watch?v=rXvU7bPJ8n4

I took a look and he was charging a subscription for his palantir. I had claude vibecode up some liable garbage but which you can download yourself. I have run it and can confirm it will not rmdir your C:\. You will need API keys yourself to get it going, however. Mine are not in there. I am not responsible for anything in here and you should have claude run a check through it. You should download this and have claude take a look around and tell you what it's got yourself since it'll obviously not be up to your specifications or desires. This version is pretty simple.

But yes if you can get yourself some live data links you too yourself can have a realtime view of your preferred battlespace.

////////////////////

claude wrote the below and I have not read what it says nor will I read it.

# PALANTIR VIBECODE

Browser-based global intelligence dashboard. CesiumJS 3D globe with real-time flight tracking, satellite orbital propagation, road particle simulation, and WebGL post-process view modes (NVG / FLIR / RADAR). No backend. No build step. Open the HTML file.

![View modes: Normal, NVG, FLIR, RADAR]

---

## What's in here

```
palantir/
├── PALANTIR_VIBECODE.html   # Self-contained single-file version (everything inline)
├── index.html               # Entry point for the modular version
├── style.css
└── src/
    ├── main.js              # Orchestrator — wires all modules together
    ├── config.js            # API key store (localStorage, never leaves browser)
    ├── globe.js             # CesiumJS viewer + Google Photorealistic 3D Tiles
    ├── flights.js           # Live flight tracker (OpenSky + ADS-B Exchange)
    ├── satellites.js        # Satellite tracker — TLE fetch, SGP4 propagation, orbit paths
    ├── roads.js             # Road particle system (OSM via Overpass API)
    ├── shaders.js           # WebGL2 post-process effects
    └── intel.js             # Central log bus / intel feed
```

Two versions of the same thing: `PALANTIR_VIBECODE.html` is the monolith (single file, easier to share), the `src/` tree is the modular version. They're kept in sync.

---

## Running it

No build step. Serve locally over HTTP (required for ES modules and CesiumJS):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`. On first load a config modal appears for API keys. Hit **DEMO MODE** to skip all keys and run with 8 hardcoded demo satellites.

---

## API keys

All keys are stored in `localStorage` only — they never leave your browser.

| Key | Where to get it | What it unlocks |
|-----|----------------|-----------------|
| **Cesium Ion token** | [ion.cesium.com/tokens](https://ion.cesium.com/tokens) — free tier | Cesium World Terrain. Optional; falls back to bare globe. |
| **Google Maps API key** | Google Cloud Console → Map Tiles API | Photorealistic 3D Tiles (street-level photogrammetry). Most impressive feature. |
| **ADS-B Exchange RapidAPI key** | [rapidapi.com/adsbx](https://rapidapi.com/adsbx/api/adsbexchange-com1) | Unfiltered live aircraft including military. Polls every 8s. |
| **OpenSky username / password** | [opensky-network.org](https://opensky-network.org) — free | Higher rate limits on the anonymous flight feed. Anonymous works without it. |

---

## Features

**Layers (toggleable)**
- **Flights** — OpenSky anonymous feed, updates every 15s. Aircraft rendered as billboards with heading rotation and callsign labels. Military contacts flagged in red.
- **ADS-B** — ADS-B Exchange feed (requires key), updates every 8s. Higher fidelity, includes military.
- **GPS satellites** — Live orbital positions from CelesTrak TLE data, propagated with satellite.js (SGP4).
- **LEO constellation** — Same pipeline, full active LEO catalog (~6000+ objects).
- **Orbit paths** — One full predicted orbital period rendered as dashed polylines.
- **Road particles** — 800 particles animated along OSM road segments fetched for the current view area. Falls back to a synthetic grid if Overpass is unreachable.
- **Google 3D Tiles** — Photorealistic photogrammetry tiles. Requires Google Maps API key.

**View modes**
- `NORMAL` — standard Cesium render
- `NVG` — green phosphor night vision: luminance boost, barrel distortion, scanlines, grain, vignette
- `FLIR` — thermal false-colour palette (black → purple → red → orange → yellow → white), inverted luminance, sensor noise
- `RADAR` — radial sweep with trail decay, range rings, green overlay

**HUD**
- UTC clock + local date
- FPS counter
- Lat/lon/altitude under cursor
- Object detail panel on click (callsign, ICAO, altitude, speed, heading, type)
- Intel feed (timestamped log from all modules)
- Time acceleration controls (0.1× – 10000×) for satellite motion

---

## Dependencies (CDN, no install)

- [CesiumJS 1.114](https://cesium.com/platform/cesiumjs/)
- [satellite.js](https://github.com/shashwatak/satellite-js) — SGP4/SDP4 orbital propagation
- [Three.js r128](https://threejs.org) — not currently active, reserved for future use

---

## Known limitations

- Road particles are fixed to a default bounding box (configurable in `roads.js` → `initRoads(bbox)`). Dynamic bbox based on camera view is a TODO.
- CCTV texture projection is stubbed — requires CORS-enabled stream URLs.
- Shader overlay captures the Cesium canvas via `texImage2D`; cross-origin restrictions may block this in some hosting environments.
- 3D Tiles requires the **Map Tiles API** to be explicitly enabled in Google Cloud Console — it's not on by default.
