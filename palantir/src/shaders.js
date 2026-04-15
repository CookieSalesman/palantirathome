// ── SHADER EFFECTS ───────────────────────────────────────────
// Post-process view modes: NORMAL | NVG | FLIR | RADAR
// Rendered as a full-screen WebGL canvas over the Cesium view.

let gl       = null;
let program  = null;
let texLoc   = null;
let canvas   = null;
let srcCanvas = null;
let animId   = null;
let mode     = 'normal';

// ── GLSL SHADERS ────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// NVG — green phosphor night vision
const FRAG_NVG = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;

  // Barrel distortion
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  uv += d * r2 * 0.15;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 col = texture(u_tex, uv);

  // Luminance
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));

  // Boost darks
  lum = pow(lum, 0.6) * 1.4;

  // Scanlines
  float scan = 0.85 + 0.15 * sin(uv.y * 600.0);

  // Grain
  float noise = rand(uv + u_time * 0.01) * 0.06;

  // Vignette
  float vig = 1.0 - r2 * 2.5;

  float final = clamp((lum + noise) * scan * vig, 0.0, 1.0);
  fragColor = vec4(final * 0.05, final * 1.0, final * 0.3, 0.92);
}`;

// FLIR — thermal infrared false-colour
const FRAG_FLIR = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;

vec3 thermalPalette(float t) {
  // Black → Purple → Red → Orange → Yellow → White
  t = clamp(t, 0.0, 1.0);
  vec3 c;
  if (t < 0.2)      c = mix(vec3(0.0), vec3(0.3,0.0,0.5), t / 0.2);
  else if (t < 0.4) c = mix(vec3(0.3,0.0,0.5), vec3(0.8,0.0,0.0), (t-0.2)/0.2);
  else if (t < 0.6) c = mix(vec3(0.8,0.0,0.0), vec3(1.0,0.5,0.0), (t-0.4)/0.2);
  else if (t < 0.8) c = mix(vec3(1.0,0.5,0.0), vec3(1.0,1.0,0.0), (t-0.6)/0.2);
  else              c = mix(vec3(1.0,1.0,0.0), vec3(1.0,1.0,1.0), (t-0.8)/0.2);
  return c;
}

void main() {
  vec2 uv = v_uv;
  vec4 col = texture(u_tex, uv);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));

  // Invert (hot objects are bright)
  float heat = 1.0 - lum;

  // Boost contrast
  heat = pow(heat, 1.5);

  // Add slight temporal flicker (sensor noise)
  float t = u_time * 0.5;
  heat += (fract(sin(dot(uv, vec2(127.1,311.7)) + t) * 43758.5) - 0.5) * 0.03;

  vec3 thermal = thermalPalette(clamp(heat, 0.0, 1.0));

  // CRT scanlines
  float scan = 0.92 + 0.08 * sin(uv.y * 500.0);

  fragColor = vec4(thermal * scan, 0.9);
}`;

// RADAR — green radial sweep
const FRAG_RADAR = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;

#define PI 3.14159265

void main() {
  vec2 uv  = v_uv;
  vec2 ctr = vec2(0.5, 0.5);
  vec2 d   = uv - ctr;
  float r  = length(d);
  float a  = atan(d.y, d.x);

  vec4 col = texture(u_tex, uv);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));

  // Sweep angle
  float sweep = mod(u_time * 0.8, PI * 2.0);
  float angleDiff = mod(sweep - a + PI * 2.0, PI * 2.0);
  float trail = exp(-angleDiff * 1.2) * 0.6;

  // Rings
  float rings = 0.0;
  rings += 0.08 * (1.0 - smoothstep(0.0, 0.01, abs(r - 0.25)));
  rings += 0.08 * (1.0 - smoothstep(0.0, 0.01, abs(r - 0.40)));
  rings += 0.08 * (1.0 - smoothstep(0.0, 0.01, abs(r - 0.48)));

  // Sweep beam
  float beam = exp(-angleDiff * 8.0) * 0.5 * smoothstep(0.5, 0.0, r);

  float final = lum * 0.3 + trail * 0.4 + rings + beam;
  fragColor = vec4(final * 0.1, final * 1.0, final * 0.35, 0.88);
}`;

// ── INIT ─────────────────────────────────────────────────────

export function initShaders() {
  canvas = document.getElementById('shader-overlay');
  gl     = canvas.getContext('webgl2', { premultipliedAlpha: false });
  if (!gl) { console.warn('WebGL2 not available — shader effects disabled'); return; }

  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

export function setMode(newMode) {
  mode = newMode;
  if (animId) cancelAnimationFrame(animId);
  animId = null;

  if (mode === 'normal') {
    canvas.classList.remove('active');
    canvas.style.opacity = '0';
    return;
  }

  canvas.classList.add('active');
  canvas.style.opacity = '1';

  const fragSrc = {
    nvg:   FRAG_NVG,
    flir:  FRAG_FLIR,
    radar: FRAG_RADAR,
  }[mode];

  if (!fragSrc) return;
  buildProgram(fragSrc);
  startRender();
}

function buildProgram(fragSrc) {
  if (!gl) return;
  if (program) gl.deleteProgram(program);

  const vert = compile(gl.VERTEX_SHADER,   VERT);
  const frag = compile(gl.FRAGMENT_SHADER, fragSrc);

  program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Shader link error:', gl.getProgramInfoLog(program));
    program = null;
    return;
  }

  // Full-screen quad
  const quad = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  const buf  = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  texLoc = gl.getUniformLocation(program, 'u_tex');
}

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
  }
  return s;
}

let tex = null;

function startRender() {
  // Grab the Cesium canvas as texture source
  srcCanvas = document.querySelector('#cesiumContainer canvas');
  if (!srcCanvas || !gl || !program) return;

  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let t = 0;
  function frame() {
    if (mode === 'normal') return;
    animId = requestAnimationFrame(frame);
    t += 0.016;

    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    } catch (e) { return; }

    gl.uniform1i(texLoc, 0);
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    gl.uniform1f(timeLoc, t);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  animId = requestAnimationFrame(frame);
}
