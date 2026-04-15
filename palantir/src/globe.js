// ── GLOBE ────────────────────────────────────────────────────
// CesiumJS viewer + Google Photorealistic 3D Tiles

import { Config } from './config.js';
import { intel } from './intel.js';

export let viewer = null;

export async function initGlobe() {
  // Set Cesium Ion token (can be empty for anonymous use)
  // Add your Cesium Ion token at https://ion.cesium.com/tokens
  Cesium.Ion.defaultAccessToken = Config.cesiumToken || '';

  viewer = new Cesium.Viewer('cesiumContainer', {
    // Core
    timeline:                false,
    animation:               false,
    baseLayerPicker:         false,
    geocoder:                false,
    homeButton:              false,
    sceneModePicker:         false,
    navigationHelpButton:    false,
    infoBox:                 false,
    selectionIndicator:      false,
    fullscreenButton:        false,
    creditContainer:         document.createElement('div'), // hide credits

    // Imagery — dark base
    imageryProvider: new Cesium.IonImageryProvider({ assetId: 3 }), // Bing aerial
  });

  // Scene quality
  viewer.scene.globe.enableLighting      = true;
  viewer.scene.globe.atmosphereLightIntensity = 10.0;
  viewer.scene.atmosphere.brightnessShift   = 0.0;
  viewer.scene.fog.enabled               = false;
  viewer.scene.highDynamicRange          = true;
  viewer.scene.msaaSamples               = 4;

  // Nice dark sky
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#000000');
  viewer.scene.skyBox.show     = true;
  viewer.scene.sun.show        = true;
  viewer.scene.moon.show       = true;

  // Start from a nice global view
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-98, 38, 12_000_000),
  });

  // Load Google Photorealistic 3D Tiles if key present
  if (Config.hasGoogle()) {
    await loadGoogle3DTiles();
  } else {
    intel.log('No Google Maps key — using Cesium World Terrain', 'init');
    try {
      viewer.terrainProvider = await Cesium.createWorldTerrainAsync({ requestWaterMask: true });
    } catch (e) {
      intel.log('Terrain load failed — bare globe mode', 'alert');
    }
  }

  // Update HUD coords on mouse move
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(e => {
    const cart = viewer.camera.pickEllipsoid(e.endPosition);
    if (!cart) return;
    const carto = Cesium.Cartographic.fromCartesian(cart);
    const lat  = Cesium.Math.toDegrees(carto.latitude).toFixed(4);
    const lon  = Cesium.Math.toDegrees(carto.longitude).toFixed(4);
    const alt  = (viewer.camera.positionCartographic.height / 1000).toFixed(1);
    document.getElementById('coord-lat').textContent = `LAT ${lat}°`;
    document.getElementById('coord-lon').textContent = `LON ${lon}°`;
    document.getElementById('coord-alt').textContent = `ALT ${alt}km`;
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Click to inspect entities
  handler.setInputAction(e => {
    const picked = viewer.scene.pick(e.position);
    if (picked && picked.id) showObjectDetail(picked.id);
    else hideObjectDetail();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  intel.log('Globe initialised', 'init');
  return viewer;
}

export async function loadGoogle3DTiles() {
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(
      `https://tile.googleapis.com/v1/3dtiles/root.json?key=${Config.googleMapsKey}`
    );
    viewer.scene.primitives.add(tileset);

    // Hide the base globe imagery behind photorealistic tiles
    viewer.scene.globe.show = false;
    viewer.scene.globe.baseColor = Cesium.Color.TRANSPARENT;

    intel.log('Google Photorealistic 3D Tiles loaded', 'init');
    document.getElementById('status-msg').textContent =
      'GOOGLE 3D TILES ACTIVE — PHOTOREALISTIC MODE';
    return tileset;
  } catch (e) {
    intel.log(`3D Tiles failed: ${e.message}`, 'alert');
    console.error('Google 3D Tiles error:', e);
    return null;
  }
}

export function setAtmosphere(enabled) {
  if (!viewer) return;
  viewer.scene.fog.enabled       = enabled;
  viewer.scene.skyAtmosphere.show = enabled;
}

function showObjectDetail(entity) {
  const panel = document.getElementById('object-detail');
  const info  = document.getElementById('object-info');
  const props = entity.properties;
  if (!props) return;

  panel.classList.remove('hidden');
  const names = props.propertyNames;
  info.innerHTML = names.map(n =>
    `<div class="field">
       <span class="field-label">${n.toUpperCase()}</span>
       <span class="field-value">${props[n]?.getValue() ?? '—'}</span>
     </div>`
  ).join('');
}

function hideObjectDetail() {
  document.getElementById('object-detail').classList.add('hidden');
}
