const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const bridge = window.kapibala;
if (bridge) {
  document.body.classList.add('electron-window');
  document.documentElement.classList.add('electron-window');
}
const state = {
  data: null,
  modelRange: 'week',
  refreshing: false,
  themePreference: null,
  mode: 'widget',
  alwaysOnTop: false,
  settingsHydrated: false,
  modeFitTimer: null,
  autoFitPending: true,
  tooltipAnchor: null,
  historySummary: null
};

const toast = $('#toast');
const toastText = $('#toastText');
const loginModal = $('#loginModal');
const loginUsername = $('#loginUsername');
const loginPassword = $('#loginPassword');
const loginError = $('#loginError');
const syncText = $('#syncText');
const appShell = $('.app-shell');
const dataTooltip = $('#dataTooltip');
const widgetPin = $('#widgetPin');
const scrollIndicator = $('#scrollIndicator');
const scrollThumb = $('#scrollThumb');

// The native Chromium scrollbar is intentionally hidden in the packaged
// window.  A small overlay thumb keeps the dashboard scrollable while
// matching the translucent, rounded material used by the rest of the UI.
// Keeping the scroll math in the renderer also means it follows a resized
// window and both dashboard modes without affecting the second monitor.
const scrollState = {
  scroller: null,
  trackHeight: 0,
  thumbHeight: 0,
  maxThumbTop: 0,
  frame: 0,
  drag: null,
  resizeObserver: null,
  activityTimer: null
};

// Keep the rail quiet until the user is actually scrolling. A visible-but-
// subdued thumb remains discoverable and hoverable, while the short active
// state gives immediate feedback for wheel, keyboard and drag input.
function markScrollActivity() {
  if (!scrollIndicator) return;
  scrollIndicator.classList.add('is-active');
  clearTimeout(scrollState.activityTimer);
  scrollState.activityTimer = setTimeout(() => {
    scrollIndicator.classList.remove('is-active');
    scrollState.activityTimer = null;
  }, 900);
}

function handleScrollerScroll() {
  markScrollActivity();
  requestScrollIndicatorSync();
}

function getActiveScroller() {
  if (state.mode === 'full') return $('.view-full');
  return $('.widget-stage');
}

function stopScrollBinding() {
  if (scrollState.scroller) scrollState.scroller.removeEventListener('scroll', handleScrollerScroll);
  scrollState.scroller = null;
  scrollState.drag = null;
  clearTimeout(scrollState.activityTimer);
  scrollState.activityTimer = null;
  scrollIndicator?.classList.remove('is-dragging', 'is-active');
}

function syncScrollIndicator() {
  if (!scrollIndicator || !scrollThumb || !appShell) return;
  const scroller = getActiveScroller();
  if (!scroller) {
    stopScrollBinding();
    scrollIndicator.classList.remove('is-visible', 'is-dragging', 'is-active');
    scrollIndicator.setAttribute('aria-hidden', 'true');
    scrollIndicator.setAttribute('tabindex', '-1');
    scrollThumb.style.height = '0px';
    scrollThumb.style.transform = 'translate3d(0, 0, 0)';
    return;
  }
  if (scrollState.scroller !== scroller) {
    stopScrollBinding();
    scrollState.scroller = scroller;
    scroller.addEventListener('scroll', handleScrollerScroll, { passive: true });
  }
  const shellRect = appShell.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const top = Math.max(6, scrollerRect.top - shellRect.top + 5);
  const bottom = Math.min(shellRect.height - 6, scrollerRect.bottom - shellRect.top - 5);
  const trackHeight = Math.max(0, bottom - top);
  const overflow = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  if (trackHeight < 1 || overflow < 1) {
    scrollState.trackHeight = trackHeight;
    scrollState.thumbHeight = trackHeight;
    scrollState.maxThumbTop = 0;
    scrollIndicator.classList.remove('is-visible', 'is-dragging', 'is-active');
    scrollIndicator.setAttribute('aria-hidden', 'true');
    scrollIndicator.setAttribute('tabindex', '-1');
    scrollThumb.style.height = '0px';
    scrollThumb.style.transform = 'translate3d(0, 0, 0)';
    scrollIndicator.style.top = `${top}px`;
    scrollIndicator.style.height = `${trackHeight}px`;
    return;
  }
  const thumbHeight = Math.min(trackHeight, Math.max(38, trackHeight * scroller.clientHeight / scroller.scrollHeight));
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const progress = overflow ? Math.max(0, Math.min(1, scroller.scrollTop / overflow)) : 0;
  scrollState.trackHeight = trackHeight;
  scrollState.thumbHeight = thumbHeight;
  scrollState.maxThumbTop = maxThumbTop;
  scrollIndicator.style.top = `${top}px`;
  scrollIndicator.style.height = `${trackHeight}px`;
  scrollThumb.style.height = `${thumbHeight}px`;
  scrollThumb.style.transform = `translate3d(0, ${Math.round(progress * maxThumbTop)}px, 0)`;
  scrollIndicator.classList.add('is-visible');
  scrollIndicator.setAttribute('aria-hidden', 'false');
  scrollIndicator.setAttribute('tabindex', '0');
  scrollIndicator.setAttribute('aria-valuemin', '0');
  scrollIndicator.setAttribute('aria-valuemax', String(Math.round(overflow)));
  scrollIndicator.setAttribute('aria-valuenow', String(Math.round(scroller.scrollTop)));
  scrollIndicator.setAttribute('aria-controls', scroller.id || (state.mode === 'full' ? 'fullView' : 'widgetStage'));
  scrollIndicator.setAttribute('aria-label', state.mode === 'full' ? '完整版内容滚动条' : '小组件内容滚动条');
}

function requestScrollIndicatorSync() {
  // Update synchronously for scroll events (important for hidden/offscreen
  // preview windows where Chromium may throttle requestAnimationFrame), then
  // repeat after layout settles for mode changes and dynamic content.
  syncScrollIndicator();
  if (scrollState.frame) return;
  // Mode changes update display/overflow in the next style/layout pass. Run
  // once now and once on the following frame so the thumb cannot remain
  // hidden (or retain the previous mode's position) during that hand-off.
  scrollState.frame = requestAnimationFrame(() => {
    scrollState.frame = 0;
    syncScrollIndicator();
    requestAnimationFrame(syncScrollIndicator);
  });
}

function finishScrollDrag(event) {
  if (!scrollState.drag) return;
  if (event?.pointerId !== undefined && scrollState.drag.pointerId !== event.pointerId) return;
  scrollState.drag = null;
  scrollIndicator?.classList.remove('is-dragging');
  try { if (event?.pointerId !== undefined) scrollThumb?.releasePointerCapture(event.pointerId); } catch {}
}

scrollThumb?.addEventListener('pointerdown', event => {
  if (!scrollState.scroller || scrollState.maxThumbTop <= 0) return;
  event.preventDefault();
  markScrollActivity();
  scrollState.drag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startTop: scrollState.scroller.scrollTop
  };
  scrollIndicator.classList.add('is-dragging');
  try { scrollThumb.setPointerCapture(event.pointerId); } catch {}
});
scrollThumb?.addEventListener('pointermove', event => {
  const drag = scrollState.drag;
  const scroller = scrollState.scroller;
  if (!drag || !scroller || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const scrollRange = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const delta = event.clientY - drag.startY;
  scroller.scrollTop = Math.max(0, Math.min(scrollRange, drag.startTop + delta * scrollRange / Math.max(1, scrollState.maxThumbTop)));
  requestScrollIndicatorSync();
});
scrollThumb?.addEventListener('pointerup', finishScrollDrag);
scrollThumb?.addEventListener('pointercancel', finishScrollDrag);
scrollThumb?.addEventListener('lostpointercapture', finishScrollDrag);
scrollIndicator?.addEventListener('pointerdown', event => {
  if (event.target === scrollThumb || !scrollState.scroller || scrollState.maxThumbTop <= 0) return;
  markScrollActivity();
  const rect = scrollIndicator.getBoundingClientRect();
  const center = event.clientY - rect.top - scrollState.thumbHeight / 2;
  const progress = Math.max(0, Math.min(1, center / scrollState.maxThumbTop));
  const range = Math.max(0, scrollState.scroller.scrollHeight - scrollState.scroller.clientHeight);
  scrollState.scroller.scrollTop = progress * range;
  requestScrollIndicatorSync();
});
scrollIndicator?.addEventListener('keydown', event => {
  const scroller = scrollState.scroller;
  if (!scroller || scrollState.maxThumbTop <= 0) return;
  const page = Math.max(80, scroller.clientHeight * .82);
  let next = null;
  if (event.key === 'ArrowDown') next = scroller.scrollTop + 48;
  else if (event.key === 'ArrowUp') next = scroller.scrollTop - 48;
  else if (event.key === 'PageDown') next = scroller.scrollTop + page;
  else if (event.key === 'PageUp') next = scroller.scrollTop - page;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = scroller.scrollHeight;
  if (next === null) return;
  event.preventDefault();
  markScrollActivity();
  scroller.scrollTo({ top: next, behavior: 'smooth' });
});

if (typeof ResizeObserver !== 'undefined' && appShell) {
  scrollState.resizeObserver = new ResizeObserver(requestScrollIndicatorSync);
  scrollState.resizeObserver.observe(appShell);
  $('.view-full') && scrollState.resizeObserver.observe($('.view-full'));
  $('.widget-stage') && scrollState.resizeObserver.observe($('.widget-stage'));
}

// ----------------------------------------------------
// 液态玻璃物理光学折射引擎 (WebGL Snell Refraction + Apple Squircle SDF)
// ----------------------------------------------------
let glRefraction = {
  canvas: null,
  gl: null,
  program: null,
  cardRectLoc: null,
  uResLoc: null,
  uRadiusLoc: null,
  uMousePosLoc: null,
  uTimeLoc: null,
  mouseX: window.innerWidth * 0.5,
  mouseY: window.innerHeight * 0.4,
  currentX: window.innerWidth * 0.5,
  currentY: window.innerHeight * 0.4,
  startTime: performance.now(),
  cardRect: [0, 0, 1, 1],
  cardRadius: 0.03
};

function initLiquidGlassWebGL() {
  const canvas = document.getElementById('glCanvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) return;

  glRefraction.canvas = canvas;
  glRefraction.gl = gl;

  function resize() {
    canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    updateGlassMeshBounds();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const vsSource = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform vec4 uCardRect;
    uniform float uRadius;
    uniform vec2 uMousePos;
    uniform float uTime;

    float sdSquircle(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      float dMax = max(q.x, q.y);
      if (dMax <= 0.0) return dMax - r;
      vec2 pMax = max(q, 0.0);
      return pow(pow(pMax.x, 4.0) + pow(pMax.y, 4.0), 0.25) - r;
    }

    vec2 calculateNormal(vec2 p, vec2 b, float r) {
      float eps = 0.003;
      float d = sdSquircle(p, b, r);
      float dx = sdSquircle(p + vec2(eps, 0.0), b, r) - d;
      float dy = sdSquircle(p + vec2(0.0, eps), b, r) - d;
      return normalize(vec2(dx, dy));
    }

    vec3 sampleProceduralBackground(vec2 uv) {
      vec3 col = vec3(0.031, 0.047, 0.078);
      float dMouse = length((uv - uMousePos) * vec2(uResolution.x / uResolution.y, 1.0));
      float mouseGlow = exp(-dMouse * 4.2);
      vec3 mouseColor = vec3(0.39, 0.40, 0.95);
      col += mouseColor * mouseGlow * 0.22;

      vec2 orb1Pos = vec2(0.35 + sin(uTime * 0.15) * 0.08, 0.7 + cos(uTime * 0.2) * 0.08);
      float dOrb1 = length((uv - orb1Pos) * vec2(uResolution.x / uResolution.y, 1.0));
      col += vec3(0.39, 0.40, 0.95) * exp(-dOrb1 * 4.5) * 0.15;

      vec2 orb2Pos = vec2(0.72 + cos(uTime * 0.15) * 0.09, 0.28 + sin(uTime * 0.18) * 0.09);
      float dOrb2 = length((uv - orb2Pos) * vec2(uResolution.x / uResolution.y, 1.0));
      col += vec3(0.39, 0.40, 0.95) * exp(-dOrb2 * 4.2) * 0.12;
      return col;
    }

    void main() {
      vec2 uv = vUv;
      vec2 cardCenter = uCardRect.xy + uCardRect.zw * 0.5;
      vec2 halfSize = uCardRect.zw * 0.5;
      vec2 localP = uv - cardCenter;

      float aspect = uResolution.x / uResolution.y;
      vec2 pAspect = localP * vec2(aspect, 1.0);
      vec2 bAspect = halfSize * vec2(aspect, 1.0);
      float rAspect = uRadius * aspect;

      float dist = sdSquircle(pAspect, bAspect, rAspect);
      float edgeAA = smoothstep(0.002, -0.002, dist);
      if (edgeAA <= 0.001) {
        discard;
        return;
      }

      float edgeDist = clamp(-dist / 0.08, 0.0, 1.0);
      float lensCurvature = pow(1.0 - edgeDist, 2.5);
      vec2 normal = calculateNormal(pAspect, bAspect, rAspect);

      float refractStrength = 0.028 * lensCurvature;
      vec2 refractOffset = -normal * refractStrength;
      vec3 refractedBg = sampleProceduralBackground(uv + refractOffset);
      vec3 glassColor = refractedBg;

      float fresnel = pow(lensCurvature, 2.0) * 0.35;
      glassColor = mix(glassColor, vec3(0.85, 0.90, 1.0), fresnel);

      vec2 lightDir = normalize(vec2(-0.4, 0.8));
      float specular = pow(max(0.0, dot(normal, lightDir)), 6.0) * lensCurvature * 0.28;
      glassColor += vec3(1.0, 1.0, 1.0) * specular;

      float dMouseToCard = length((uv + refractOffset - uMousePos) * vec2(aspect, 1.0));
      float mouseRefractLight = exp(-dMouseToCard * 3.8) * 0.18;
      glassColor += vec3(0.42, 0.45, 0.98) * mouseRefractLight;

      gl_FragColor = vec4(glassColor, edgeAA * 0.92);
    }
  `;

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const prog = gl.createProgram();
  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  glRefraction.program = prog;

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  glRefraction.uResLoc = gl.getUniformLocation(prog, 'uResolution');
  glRefraction.cardRectLoc = gl.getUniformLocation(prog, 'uCardRect');
  glRefraction.uRadiusLoc = gl.getUniformLocation(prog, 'uRadius');
  glRefraction.uMousePosLoc = gl.getUniformLocation(prog, 'uMousePos');
  glRefraction.uTimeLoc = gl.getUniformLocation(prog, 'uTime');

  function renderLoop() {
    const gl = glRefraction.gl;
    if (!gl) return;
    const time = (performance.now() - glRefraction.startTime) * 0.001;

    glRefraction.currentX += (glRefraction.mouseX - glRefraction.currentX) * 0.12;
    glRefraction.currentY += (glRefraction.mouseY - glRefraction.currentY) * 0.12;

    gl.viewport(0, 0, glRefraction.canvas.width, glRefraction.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(glRefraction.program);
    gl.uniform2f(glRefraction.uResLoc, glRefraction.canvas.width, glRefraction.canvas.height);
    gl.uniform4f(glRefraction.cardRectLoc, glRefraction.cardRect[0], glRefraction.cardRect[1], glRefraction.cardRect[2], glRefraction.cardRect[3]);
    gl.uniform1f(glRefraction.uRadiusLoc, glRefraction.cardRadius);
    gl.uniform2f(glRefraction.uMousePosLoc, glRefraction.currentX / window.innerWidth, 1.0 - (glRefraction.currentY / window.innerHeight));
    gl.uniform1f(glRefraction.uTimeLoc, time);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);
}

function updateGlassMeshBounds() {
  if (!appShell) return;
  const rect = appShell.getBoundingClientRect();
  glRefraction.cardRect = [
    rect.left / window.innerWidth,
    (window.innerHeight - rect.bottom) / window.innerHeight,
    rect.width / window.innerWidth,
    rect.height / window.innerHeight
  ];
  glRefraction.cardRadius = 26.0 / window.innerHeight;
}

// The rebuilt renderer is intentionally flat and opaque. Keep the legacy
// implementation below for compatibility with older preview scripts, but do
// not start a WebGL loop in the production UI.
// initLiquidGlassWebGL();

function notify(message, tone = 'ok') {
  if (!toast || !toastText) return;
  toastText.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function measureMode(mode) {
  // The native layer owns the compact widget footprint. Keep the renderer's
  // request identical so content measurements cannot grow it back to the
  // former dashboard-sized window after refresh or a mode transition.
  if (mode === 'widget') return { mode, width: 360, height: 360 };
  // The full dashboard is intentionally roomy, while its scroll container
  // handles smaller user-resized windows. This target is only used on entry.
  return { mode, width: 1080, height: 800 };
}

function scheduleModeFit(mode) {
  if (!bridge?.setModeBounds) return;
  clearTimeout(state.modeFitTimer);
  state.modeFitTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bridge.setModeBounds(measureMode(mode)).catch?.(() => {});
      });
    });
  }, 80);
}

function setMode(mode, { persist = state.settingsHydrated } = {}) {
  mode = mode === 'full' ? 'full' : 'widget';
  hideDataTooltip();
  const previousMode = state.mode;
  state.mode = mode;
  if (persist) bridge?.setWindowSettings?.({ mode });
  if (previousMode !== mode) state.autoFitPending = true;
  document.body.dataset.mode = mode;
  if (appShell && previousMode !== mode) {
    appShell.classList.remove('mode-switching');
    // Force a new animation cycle when the user switches between views.
    void appShell.offsetWidth;
    appShell.classList.add('mode-switching');
    setTimeout(() => appShell.classList.remove('mode-switching'), 420);
  }
  $$('.mode-btn').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.view').forEach(view => {
    const active = view.dataset.view === mode;
    const shouldAnimate = active && (previousMode !== mode || !view.classList.contains('active'));
    view.classList.toggle('active', active);
    view.classList.toggle('view-enter', shouldAnimate);
    if (shouldAnimate) setTimeout(() => view.classList.remove('view-enter'), 420);
  });
  // `setModeBounds` owns the native constraint hand-off.  Do not apply a
  // minimum/maximum size here: doing so before the measured bounds animation
  // would make a widget→full switch jump to the full minimum width (and a
  // full→widget switch snap before the spring begins).
  scheduleModeFit(mode);
  requestScrollIndicatorSync();
}

function setChart(type) {
  hideDataTooltip();
  // The history chart has a content-sized layout of its own. Mark the
  // containing panel explicitly so CSS can release the dashboard row's
  // default stretch and keep the summary directly beneath the heatmap.
  const usagePanel = $('.usage-panel');
  const contentGrid = $('.content-grid');
  usagePanel?.classList.toggle('history-mode', type === 'heatmap');
  contentGrid?.classList.toggle('history-mode', type === 'heatmap');
  if (usagePanel) usagePanel.dataset.chartMode = type;
  $$('.chart-toggle').forEach(button => {
    const active = button.dataset.chart === type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('[data-chart-view]').forEach(view => view.classList.toggle('active', view.dataset.chartView === type));
  // A long history is windowed on demand.  The heatmap may have been
  // rendered while its panel was hidden, so give the virtualizer one layout
  // pass after making the panel visible.
  $('#heatmapGrid')?._heatmapVirtualRender?.();
  const title = $('.usage-panel .panel-header h2');
  const rangeLabel = $('#weekRangeLabel');
  const totalLabel = $('#usageTotalLabel');
  const averageLabel = $('#usageAverageLabel');
  const requestsLabel = $('#usageRequestsLabel');
  const historyStatus = $('#historyStatus');
  if (title) title.textContent = type === 'heatmap' ? '历史消耗' : '本周消耗';
  if (historyStatus && type !== 'heatmap') historyStatus.hidden = true;
  if (historyStatus && type === 'heatmap' && state.data?.historyTruncated) {
    historyStatus.hidden = false;
    historyStatus.textContent = state.historySummary?.requests || state.historySummary?.spent
      ? '历史记录部分同步，点击刷新继续获取'
      : '历史接口暂不可用，热力图等待重新同步';
  }
  if (rangeLabel && state.data?.authenticated) {
    if (type === 'heatmap' && state.data.historyStart) {
      rangeLabel.textContent = `${formatDate(state.data.historyStart, true)} — ${formatDate(state.data.historyEnd || new Date(), true)}`;
      if (state.historySummary) {
        if (totalLabel) totalLabel.textContent = '历史总计';
        if (averageLabel) averageLabel.textContent = '日均';
        if (requestsLabel) requestsLabel.textContent = '请求数';
        $('#weekTotal').textContent = formatMoney(state.historySummary.spent, state.data);
        $('#weekAverage').textContent = formatMoney(state.historySummary.average, state.data);
        $('#weekRequests').textContent = `${formatCount(state.historySummary.requests)} 次`;
      }
    } else {
      const start = startOfWeek();
      rangeLabel.textContent = `${formatDate(start)} — ${formatDate(new Date())}`;
      if (totalLabel) totalLabel.textContent = '本周总计';
      if (averageLabel) averageLabel.textContent = '日均';
      if (requestsLabel) requestsLabel.textContent = '请求数';
      if (state.data?.week) {
        $('#weekTotal').textContent = formatMoney(state.data.week.spent, state.data);
        $('#weekAverage').textContent = formatMoney(Number(state.data.week.spent || 0) / daysSince(start), state.data);
        $('#weekRequests').textContent = `${formatCount(state.data.week.requests)} 次`;
      }
    }
  }
}

function setTheme(mode, announce = false) {
  hideDataTooltip();
  const night = mode === 'night';
  document.body.classList.toggle('night-mode', night);
  if (announce) notify(night ? '已切换到夜晚主题' : '已切换到白天主题');
}

function hideDataTooltip() {
  if (!dataTooltip) return;
  dataTooltip.classList.remove('visible');
  dataTooltip.setAttribute('aria-hidden', 'true');
  dataTooltip.style.visibility = 'hidden';
  state.tooltipAnchor = null;
}

function positionDataTooltip(anchor) {
  if (!dataTooltip || !anchor || !dataTooltip.classList.contains('visible')) return;
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = dataTooltip.getBoundingClientRect();
  const edge = 8;
  const gap = 10;
  let left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);
  let top = anchorRect.top - tooltipRect.height - gap;
  if (top < edge) top = anchorRect.bottom + gap;
  left = Math.max(edge, Math.min(left, window.innerWidth - tooltipRect.width - edge));
  top = Math.max(edge, Math.min(top, window.innerHeight - tooltipRect.height - edge));
  dataTooltip.style.left = `${Math.round(left)}px`;
  dataTooltip.style.top = `${Math.round(top)}px`;
}

function showDataTooltip(text, anchor) {
  if (!dataTooltip || !anchor) return;
  state.tooltipAnchor = anchor;
  dataTooltip.textContent = text || '暂无调用记录';
  dataTooltip.setAttribute('aria-hidden', 'false');
  dataTooltip.classList.add('visible');
  // Keep it out of the paint until dimensions are available, then clamp it
  // against the viewport. This works even when the anchor is inside a scroller.
  dataTooltip.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    if (state.tooltipAnchor !== anchor) return;
    dataTooltip.style.visibility = 'visible';
    positionDataTooltip(anchor);
  });
}

function bindDataTooltip(element, text) {
  if (!element || !text) return;
  element.dataset.tip = text;
  const show = () => showDataTooltip(text, element);
  const hide = () => { if (state.tooltipAnchor === element) hideDataTooltip(); };
  element.addEventListener('pointerenter', show);
  element.addEventListener('pointermove', () => positionDataTooltip(element));
  element.addEventListener('focus', show);
  element.addEventListener('pointerleave', hide);
  element.addEventListener('blur', hide);
}

// Keep interaction feedback flat and quiet: a pointer wash follows the
// cursor, while the surface lifts by only two pixels. Delegation means cells,
// subscription rings and model rows created during every refresh behave the
// same way without accumulating listeners.
const interactiveSurfaceSelector = '.widget-card,.kpi-card,.panel,.balance-tile,.mini-progress,.ring-plan,.table-row';
let hoveredSurface = null;
function getInteractiveSurface(event) {
  const target = event?.target?.closest?.(interactiveSurfaceSelector);
  return target && appShell?.contains(target) ? target : null;
}
function updateAmbientPointer(event) {
  if (!appShell || !Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;
  /* Update the fixed field synchronously.  Deferring these two CSS variables
     to requestAnimationFrame made the first daylight hover frame unreliable
     in a hidden/offscreen preview and could leave the field parked at its
     50vw/50vh fallback.  The writes are tiny and pointer events are already
     coalesced by Chromium, while the card-local wash remains delegated below. */
  appShell.classList.add('pointer-field-active');
  appShell.style.setProperty('--ambient-pointer-x', `${event.clientX}px`);
  appShell.style.setProperty('--ambient-pointer-y', `${event.clientY}px`);
}
function clearAmbientPointer() {
  appShell?.classList.remove('pointer-field-active');
  appShell?.style.removeProperty('--ambient-pointer-x');
  appShell?.style.removeProperty('--ambient-pointer-y');
}
appShell?.addEventListener('pointerenter', updateAmbientPointer);
appShell?.addEventListener('pointerover', event => {
  const surface = getInteractiveSurface(event);
  if (!surface || (event.relatedTarget && surface.contains(event.relatedTarget))) return;
  hoveredSurface?.classList.remove('is-hovered');
  hoveredSurface = surface;
  surface.classList.add('interactive-surface', 'is-hovered');
});
appShell?.addEventListener('pointerout', event => {
  const surface = getInteractiveSurface(event);
  if (!surface || (event.relatedTarget && surface.contains(event.relatedTarget))) return;
  surface.classList.remove('interactive-surface', 'is-hovered', 'is-pressed');
  surface.style.removeProperty('--pointer-x');
  surface.style.removeProperty('--pointer-y');
  if (hoveredSurface === surface) hoveredSurface = null;
});
appShell?.addEventListener('pointermove', event => {
  // A broad, low-opacity field follows the pointer across the whole window.
  // The local card wash below remains stronger, so nearby cards and empty
  // space pick up colour without losing the active surface hierarchy.
  updateAmbientPointer(event);
  const surface = getInteractiveSurface(event);
  if (!surface) return;
  const rect = surface.getBoundingClientRect();
  surface.classList.add('interactive-surface');
  surface.style.setProperty('--pointer-x', `${Math.max(0, Math.min(100, (event.clientX - rect.left) / Math.max(1, rect.width) * 100)).toFixed(1)}%`);
  surface.style.setProperty('--pointer-y', `${Math.max(0, Math.min(100, (event.clientY - rect.top) / Math.max(1, rect.height) * 100)).toFixed(1)}%`);
});
appShell?.addEventListener('pointerdown', event => {
  const surface = getInteractiveSurface(event);
  surface?.classList.add('interactive-surface', 'is-pressed');
});
['pointerup', 'pointercancel'].forEach(type => appShell?.addEventListener(type, event => {
  getInteractiveSurface(event)?.classList.remove('is-pressed');
}));
appShell?.addEventListener('pointerleave', () => {
  hoveredSurface?.classList.remove('interactive-surface', 'is-hovered', 'is-pressed');
  hoveredSurface?.style.removeProperty('--pointer-x');
  hoveredSurface?.style.removeProperty('--pointer-y');
  hoveredSurface = null;
  clearAmbientPointer();
});

window.addEventListener('resize', () => {
  if (state.tooltipAnchor) positionDataTooltip(state.tooltipAnchor);
  requestScrollIndicatorSync();
});
window.addEventListener('scroll', hideDataTooltip, true);
window.addEventListener('blur', () => {
  hideDataTooltip();
  clearAmbientPointer();
});

function formatMoney(value, data = state.data) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const symbol = data?.currencySymbol || '$';
  return `${symbol}${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTokens(value) {
  const number = Number(value) || 0;
  if (number >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return number.toLocaleString('en-US');
}

function formatCount(value) {
  return (Number(value) || 0).toLocaleString('en-US');
}

function formatDate(value, withYear = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', withYear
    ? { year: 'numeric', month: 'numeric', day: 'numeric' }
    : { month: 'numeric', day: 'numeric' }).format(date);
}

// Date-only values from the API are parsed explicitly in local time.  Using
// `new Date('YYYY-MM-DD')` would interpret them as UTC and can shift the cell
// to the previous day for users west/east of UTC.
function parseDayValue(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    return result;
  }
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    result.setHours(0, 0, 0, 0);
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) return null;
  result.setHours(0, 0, 0, 0);
  return result;
}

function dayKey(date) {
  const value = parseDayValue(date);
  if (!value) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function dayOrdinal(date) {
  const value = parseDayValue(date);
  return value ? Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000 : NaN;
}

function dateFromOrdinal(ordinal) {
  const utc = new Date(Number(ordinal) * 86400000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function mondayOnOrBefore(date) {
  const result = parseDayValue(date) || new Date();
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function sundayOnOrAfter(date) {
  const result = parseDayValue(date) || new Date();
  const offset = (7 - result.getDay()) % 7;
  result.setDate(result.getDate() + offset);
  return result;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function updateAccountState(data) {
  const connected = Boolean(data?.authenticated);
  const expired = data?.dataState === 'auth_expired' || data?.errorCode === 'AUTH_EXPIRED';
  $('#accountLabel').textContent = connected
    ? (data.username || 'kapibala.asia')
    : expired
      ? (data.username || '登录已过期')
      : '连接 kapibala.asia';
  const stateLabel = expired
    ? '登录已过期，请重新连接 Kapibala'
    : data?.dataState === 'offline' || data?.stale
    ? '离线缓存 · 已显示最近一次同步数据'
    : data?.historyTruncated || data?.dataState === 'partial'
      ? '部分同步 · 历史日志将在下次刷新继续获取'
      : connected
        ? '账户状态良好，所有数据已同步'
        : '连接 Kapibala 后显示实时数据';
  $('#accountState').textContent = stateLabel;
  $('#accountState').dataset.state = data?.dataState || (connected ? 'fresh' : 'signed_out');
  $('.account-dot')?.classList.toggle('connected', connected);
  $('.account-dot')?.classList.toggle('expired', expired);
}

// Daily history is the only provider payload that spans the complete range.
// Keep the token headline derived from it instead of reusing the short-range
// `week` aggregate, which can be stale or absent when history is partial.
function finiteTokenValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function formatTokensOrDash(value) {
  const number = finiteTokenValue(value);
  return number === null ? '—' : formatTokens(number);
}

function summarizeDailyTokens(daily) {
  const rows = Array.isArray(daily) ? daily : [];
  let total = 0;
  let hasTotal = false;
  let input = 0;
  let output = 0;
  let hasInput = false;
  let hasOutput = false;
  rows.forEach(row => {
    const item = row || {};
    const tokens = finiteTokenValue(item.tokens);
    if (tokens !== null) {
      total += tokens;
      hasTotal = true;
    }
    const inputTokens = finiteTokenValue(item.inputTokens ?? item.input_tokens);
    const outputTokens = finiteTokenValue(item.outputTokens ?? item.output_tokens);
    if (inputTokens !== null) {
      input += inputTokens;
      hasInput = true;
    }
    if (outputTokens !== null) {
      output += outputTokens;
      hasOutput = true;
    }
  });
  return {
    total: hasTotal ? total : null,
    input: hasInput ? input : null,
    output: hasOutput ? output : null
  };
}

function renderDashboard(data) {
  hideDataTooltip();
  state.data = data;
  updateAccountState(data);
  if (!data?.authenticated) return;
  const today = data.today || {};
  const week = data.week || {};
  const account = data.account || {};
  const summary = data.subscriptionSummary || {};
  const historicalTokens = summarizeDailyTokens(data.daily);
  const balanceNumber = Number(account.balance);
  const totalNumber = Number(account.total);
  const balanceKnown = account.balance !== null && account.balance !== undefined && Number.isFinite(balanceNumber);
  const totalKnown = account.total !== null && account.total !== undefined && Number.isFinite(totalNumber);
  const balanceAvailable = balanceKnown && balanceNumber > 0;

  $('#widgetDate').textContent = `TODAY · ${formatDate(new Date())}`;
  $('#widgetCurrency').textContent = data.currencySymbol || '$';
  $('#widgetTodayValue').textContent = Number(today.spent || 0).toFixed(2);
  const freshnessLabel = data.dataState === 'offline' || data.stale
    ? '离线缓存'
    : data.historyTruncated || data.dataState === 'partial'
      ? '部分同步'
      : '实时';
  const stateCaption = `${freshnessLabel} · 今日`;
  $('#widgetTodayTrend').innerHTML = `<span class="muted">${escapeHtml(stateCaption)}</span>`;
  $('#widgetRequests').textContent = formatCount(today.requests);
  $('#widgetRequestBar').style.width = `${Math.min(100, Math.max(0, Number(today.requests || 0) / Math.max(Number(week.requests || today.requests || 1), 1) * 100))}%`;
  $('#widgetToken').textContent = `Token ${formatTokensOrDash(today.tokens)}`;
  $('#widgetRPM').textContent = `峰值 ${Number(today.averageRPM || 0).toFixed(1)} RPM`;
  $('#widgetBalance').textContent = formatMoney(account.balance, data);
  $('#widgetBalanceMeta').textContent = `已用 ${formatMoney(account.used, data)} · 总额度 ${formatMoney(account.total, data)}`;
  $('#widgetBalanceStatus').textContent = !balanceKnown ? '待确认' : balanceAvailable ? '可用' : '不足';
  $('#widgetBalanceStatus').className = `status-chip ${!balanceKnown ? '' : balanceAvailable ? 'good' : 'danger'}`.trim();
  const subscriptionPercent = summary.total > 0 ? (summary.remaining / summary.total) * 100 : 0;
  $('#widgetSubscription').textContent = summary.total > 0 ? `${subscriptionPercent.toFixed(1)}%` : '—';
  $('#widgetSubscriptionStatus').textContent = `${summary.count || 0} 个计划`;

  $('#kpiTodayValue').textContent = formatMoney(today.spent, data);
  $('#kpiTodayRequests').textContent = `${formatCount(today.requests)} 次请求`;
  $('#kpiTodayTokens').textContent = `Token ${formatTokensOrDash(today.tokens)}`;
  $('#kpiTodayTrend').textContent = `● ${freshnessLabel}`;
  $('#kpiBalanceValue').textContent = formatMoney(account.balance, data);
  $('#kpiBalanceStatus').textContent = !balanceKnown ? '● 待确认' : balanceAvailable ? '● 余额可用' : '● 余额不足';
  $('#kpiBalanceBar').style.width = `${balanceKnown && totalKnown && totalNumber > 0 ? Math.min(100, Math.max(0, balanceNumber / totalNumber * 100)) : 0}%`;
  $('#kpiBalanceUsed').textContent = `已用 ${formatMoney(account.used, data)}`;
  $('#kpiBalanceTotal').textContent = `总额度 ${formatMoney(account.total, data)}`;
  $('#kpiSubscriptionValue').textContent = summary.total > 0 ? `${subscriptionPercent.toFixed(1)}%` : '—';
  $('#kpiSubscriptionStatus').textContent = `● ${summary.count || 0} 个有效计划`;
  $('#kpiSubscriptionExpiry').textContent = `最近到期 ${formatDate(summary.nearestExpiry)}`;
  $('#kpiSubscriptionBar').style.width = `${subscriptionPercent}%`;
  $('#kpiSubscriptionUsed').textContent = `已用 ${(100 - subscriptionPercent).toFixed(1)}%`;
  // The headline is intentionally the sum of daily history. `week.tokens`
  // is a rolling aggregate and does not represent the full historical range.
  $('#kpiTokenValue').textContent = formatTokensOrDash(historicalTokens.total);
  $('#kpiInputTokens').textContent = `输入 ${formatTokensOrDash(historicalTokens.input)}`;
  $('#kpiOutputTokens').textContent = `输出 ${formatTokensOrDash(historicalTokens.output)}`;
  const inputValue = historicalTokens.input ?? 0;
  const outputValue = historicalTokens.output ?? 0;
  const tokenBreakdownTotal = inputValue + outputValue;
  $('#kpiInputBar').style.width = `${tokenBreakdownTotal > 0 && historicalTokens.input !== null ? Math.min(100, inputValue / tokenBreakdownTotal * 100) : 0}%`;
  $('#kpiOutputBar').style.width = `${tokenBreakdownTotal > 0 && historicalTokens.output !== null ? Math.min(100, outputValue / tokenBreakdownTotal * 100) : 0}%`;

  const start = startOfWeek();
  $('#weekRangeLabel').textContent = `${formatDate(start)} — ${formatDate(new Date())}`;
  $('#weekTotal').textContent = formatMoney(week.spent, data);
  $('#weekAverage').textContent = formatMoney(Number(week.spent || 0) / daysSince(start), data);
  $('#weekRequests').textContent = `${formatCount(week.requests)} 次`;
  renderBars(data);
  renderHeatmap(data.daily || []);
  renderSubscriptions(data);
  renderModels(data.models?.[state.modelRange] || []);
  // Preserve the selected chart while refreshing its range label/title.
  setChart($('.chart-toggle.active')?.dataset.chart || 'bars');
  // Rendering the dashboard can change the scroll height without changing
  // the observed container's own box size. Refresh the overlay thumb after
  // the DOM mutation so it appears immediately on first load and after a
  // refresh, rather than waiting for a window resize.
  requestScrollIndicatorSync();
  const syncTime = new Date(data.fetchedAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  syncText.textContent = data.dataState === 'offline' || data.stale
    ? `离线缓存 · ${syncTime}`
    : data.historyTruncated || data.dataState === 'partial'
      ? `部分同步 · ${syncTime}`
      : `刚刚同步 · ${syncTime}`;
  if (state.mode === 'widget' && state.autoFitPending) {
    state.autoFitPending = false;
    scheduleModeFit('widget');
  }
  // A brief, low-key pulse makes a completed refresh legible without moving
  // the layout or stealing focus from the user's current view.
  $$('.widget-card,.kpi-card,.panel').forEach(card => {
    card.classList.remove('data-updated');
    void card.offsetWidth;
    card.classList.add('data-updated');
  });
}

function daysSince(date) {
  return Math.max(1, Math.floor((Date.now() - date.getTime()) / 86400000) + 1);
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function renderBars(data) {
  const container = $('#barsContainer');
  if (!container) return;
  const daily = (data.daily || []).slice(-7);
  const values = daily.map(item => Number(item.spent || 0));
  const max = Math.max(1, ...values);
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '今天'];
  container.innerHTML = daily.map((item, index) => {
    const isToday = index === daily.length - 1;
    const height = Math.max(2, values[index] / max * 100);
    const label = isToday ? '今天' : (labels[index] || formatDate(item.date));
    const tip = `${formatDate(item.date, true)}\n${formatMoney(item.spent, data)} · ${formatCount(item.requests)} 次调用`;
    return `<div class="bar-col ${isToday ? 'today' : ''}" data-tip="${escapeHtml(tip)}"><div class="bar-tooltip" aria-hidden="true">${escapeHtml(formatMoney(item.spent, data))}<br><small>${formatCount(item.requests)} 次调用</small></div><span class="bar" style="height:${height.toFixed(1)}%"></span><small>${escapeHtml(label)}</small></div>`;
  }).join('') || '<div class="empty-state">暂无本周消耗记录</div>';
  $$('.bar-col[data-tip]', container).forEach(element => bindDataTooltip(element, element.dataset.tip));
  const axis = $('#chartYAxis');
  if (axis) axis.innerHTML = [1, .75, .5, .25, 0].map(factor => `<span>${escapeHtml(formatMoney(max * factor, data))}</span>`).join('');
}

// Heatmap intensity uses the most informative available usage measure. Token
// counts are preferred; providers that omit them fall back to requests and
// finally spend so an active day is still visible without inventing data.
function heatmapActivity(item) {
  const row = item || {};
  const tokens = finiteTokenValue(row.tokens);
  if (tokens !== null && tokens > 0) return tokens;
  const requests = finiteTokenValue(row.requests);
  if (requests !== null && requests > 0) return requests;
  const spent = finiteTokenValue(row.spent);
  return spent !== null && spent > 0 ? spent : 0;
}

function renderHeatmap(daily) {
  const grid = $('#heatmapGrid');
  if (!grid) return;
  // A previous long-history render may have attached a scroll/resize
  // virtualizer. Tear it down before replacing the data so refreshes do not
  // accumulate listeners or retain stale cell closures.
  grid._heatmapVirtualCleanup?.();
  grid._heatmapVirtualCleanup = null;
  grid._heatmapVirtualRender = null;
  grid.dataset.virtualized = 'false';
  const entries = (Array.isArray(daily) ? daily : [])
    .map(item => ({ item: item || {}, date: parseDayValue(item?.date) }))
    .filter(entry => entry.date)
    .sort((a, b) => a.date - b.date);
  const monthLabels = $('#heatmapMonths');
  const historyStatus = $('#historyStatus');
  if (!entries.length) {
    grid.innerHTML = '<div class="empty-state">暂无可用历史记录</div>';
    grid.style.removeProperty('--heat-columns');
    grid.closest('.heatmap-body')?.style.removeProperty('--heat-cell');
    grid.closest('.heatmap-body')?.style.removeProperty('--heat-gap');
    grid.closest('.heatmap-body')?.removeAttribute('data-fit');
    delete grid.dataset.selectedDate;
    monthLabels && (monthLabels.innerHTML = '');
    const selectedSummary = $('#heatmapSelected');
    if (selectedSummary) selectedSummary.textContent = '暂无可用历史记录';
    state.historySummary = null;
    if (historyStatus) {
      historyStatus.hidden = false;
      historyStatus.textContent = state.data?.historyTruncated
        ? '历史接口暂不可用，热力图等待重新同步'
        : '暂无可用历史记录';
    }
    return;
  }

  const firstOrdinal = dayOrdinal(entries[0].date);
  const lastOrdinal = dayOrdinal(entries[entries.length - 1].date);
  // Align the first and last cells to complete Monday–Sunday columns.  This
  // keeps the weekday labels truthful while still showing every available
  // date, including years of history when the provider retains them.
  const start = mondayOnOrBefore(entries[0].date);
  const finish = sundayOnOrAfter(entries[entries.length - 1].date);
  const startOrdinal = dayOrdinal(start);
  const finishOrdinal = dayOrdinal(finish);
  const columns = Math.max(1, Math.ceil((finishOrdinal - startOrdinal + 1) / 7));
  const byDate = new Map(entries.map(({ item, date }) => [dayKey(date), item]));
  const values = entries
    .map(({ item }) => heatmapActivity(item))
    .filter(value => value > 0)
    .sort((a, b) => a - b);
  const quantile = factor => values.length
    ? values[Math.min(values.length - 1, Math.floor(values.length * factor))]
    : 1;
  const level25 = quantile(.25);
  const level50 = quantile(.5);
  const level80 = quantile(.8);
  const maxActivity = values.at(-1) || 0;
  const heatLevel = value => {
    if (!(value > 0)) return 0;
    // A single active day (or a tied distribution) should still communicate
    // that it is the highest observed usage rather than looking like a
    // low-frequency neutral cell.
    if (value >= maxActivity) return 4;
    if (value <= level25) return 1;
    if (value <= level50) return 2;
    if (value <= level80) return 3;
    return 4;
  };
  const historySpent = entries.reduce((sum, { item }) => sum + (Number(item.spent) || 0), 0);
  const historyRequests = entries.reduce((sum, { item }) => sum + (Number(item.requests) || 0), 0);
  const hasActivity = entries.some(({ item }) => heatmapActivity(item) > 0);

  // A refreshed account can contain trailing zero-value days. Select the
  // latest day with activity by default so the detail row is useful as soon
  // as the history view opens. Preserve an existing user selection when it
  // still belongs to the refreshed range.
  const latestActiveEntry = [...entries].reverse().find(({ item }) => (
    heatmapActivity(item) > 0
  )) || entries[entries.length - 1];
  const previousSelectedKey = grid.dataset.selectedDate;
  const previousSelectedEntry = previousSelectedKey
    ? entries.find(({ date }) => dayKey(date) === previousSelectedKey)
    : null;
  const selectedEntry = previousSelectedEntry || latestActiveEntry;
  const selectedKey = dayKey(selectedEntry.date);
  grid.dataset.selectedDate = selectedKey;
  if (historyStatus) {
    historyStatus.hidden = !(state.data?.historyTruncated || (!hasActivity && state.data?.dataState === 'partial'));
    historyStatus.textContent = state.data?.historyTruncated
      ? (hasActivity ? '历史记录部分同步，点击刷新继续获取' : '历史接口暂不可用，热力图等待重新同步')
      : '';
  }
  state.historySummary = {
    spent: historySpent,
    requests: historyRequests,
    average: historySpent / Math.max(1, entries.length)
  };
  grid.style.setProperty('--heat-columns', String(columns));
  // Short histories should use the available panel width instead of leaving
  // a tiny grid stranded in a large empty card. Long histories stay compact
  // and scroll horizontally inside the heatmap body.
  const heatmapBody = grid.closest('.heatmap-body');
  const heatCell = columns <= 18 ? 16 : columns <= 30 ? 13 : 11;
  const heatGap = columns <= 18 ? 4 : 3;
  // Compact recent histories use the available panel width. Longer histories
  // retain fixed cell geometry and horizontal scrolling for readability.
  if (heatmapBody) {
    heatmapBody.dataset.fit = entries.length >= 21 && columns <= 60 ? 'wide' : 'natural';
  }
  heatmapBody?.style.setProperty('--heat-cell', `${heatCell}px`);
  heatmapBody?.style.setProperty('--heat-gap', `${heatGap}px`);
  grid.dataset.historyStart = dayKey(entries[0].date);
  grid.dataset.historyEnd = dayKey(entries[entries.length - 1].date);
  grid.innerHTML = '';

  const selectedItem = byDate.get(selectedKey) || { tokens: 0, requests: 0, spent: 0 };
  const selectedSummary = $('#heatmapSelected');
  if (selectedSummary) {
    selectedSummary.innerHTML = `<strong>${escapeHtml(formatDate(selectedEntry.date, true))}</strong> · ${escapeHtml(formatTokens(selectedItem.tokens))} tokens · ${escapeHtml(formatCount(selectedItem.requests))} 次调用 · ${escapeHtml(formatMoney(selectedItem.spent, state.data))}`;
  }

  // The month track lives in the same horizontal scroller as the cells, so
  // labels stay aligned even when a long account history exceeds the panel
  // width.
  if (monthLabels) {
    monthLabels.style.setProperty('--heat-columns', String(columns));
    monthLabels.innerHTML = '';
    let monthOrdinal = dayOrdinal(new Date(entries[0].date.getFullYear(), entries[0].date.getMonth(), 1));
    const lastMonthOrdinal = dayOrdinal(new Date(entries[entries.length - 1].date.getFullYear(), entries[entries.length - 1].date.getMonth(), 1));
    let occupiedColumn = 0;
    while (monthOrdinal <= lastMonthOrdinal) {
      const monthDate = dateFromOrdinal(monthOrdinal);
      const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const nextMonthOrdinal = dayOrdinal(nextMonth);
      // A week can straddle two months.  Keep labels on one visual row by
      // assigning each month the next free column; exact day cells remain
      // aligned below while the month text never creates implicit grid rows.
      const colStart = Math.max(occupiedColumn, Math.max(0, Math.floor((monthOrdinal - startOrdinal) / 7)));
      const colEnd = Math.min(columns, Math.max(colStart + 1, Math.ceil((nextMonthOrdinal - startOrdinal) / 7)));
      const span = document.createElement('span');
      // Use a compact year/month label so adjacent months remain readable in
      // a narrow panel and across long histories.
      span.textContent = `${monthDate.getFullYear()}/${monthDate.getMonth() + 1}`;
      span.style.gridColumn = `${colStart + 1} / span ${Math.max(1, colEnd - colStart)}`;
      span.style.gridRow = '1';
      monthLabels.appendChild(span);
      occupiedColumn = colEnd;
      monthOrdinal = nextMonthOrdinal;
    }
  }

  const firstInRange = firstOrdinal;
  const lastInRange = lastOrdinal;
  const makeCell = (column, row) => {
    const ordinal = startOrdinal + column * 7 + row;
    const date = dateFromOrdinal(ordinal);
    const key = dayKey(date);
    const item = byDate.get(key) || { tokens: 0, requests: 0, spent: 0 };
    const inRange = ordinal >= firstInRange && ordinal <= lastInRange;
    const value = heatmapActivity(item);
    const level = !inRange ? 0 : heatLevel(value);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `heat-cell level-${level}${inRange ? '' : ' is-outside'}`;
    cell.dataset.date = key;
    if (!inRange) {
      cell.disabled = true;
      cell.setAttribute('aria-hidden', 'true');
      cell.tabIndex = -1;
    } else {
      cell.dataset.tip = `${formatDate(date, true)}\n${formatTokens(item.tokens)} tokens · ${formatCount(item.requests)} 次调用\n${formatMoney(item.spent, state.data)}`;
      cell.setAttribute('aria-label', cell.dataset.tip.replace(/\n/g, '，'));
      bindDataTooltip(cell, cell.dataset.tip);
      if (grid.dataset.selectedDate === key) cell.classList.add('selected');
      cell.addEventListener('click', () => {
        $('#heatmapSelected').innerHTML = `<strong>${escapeHtml(formatDate(date, true))}</strong> · ${escapeHtml(formatTokens(item.tokens))} tokens · ${escapeHtml(formatCount(item.requests))} 次调用 · ${escapeHtml(formatMoney(item.spent, state.data))}`;
        grid.dataset.selectedDate = key;
        $$('.heat-cell.selected').forEach(selected => selected.classList.remove('selected'));
        cell.classList.add('selected');
      });
    }
    return cell;
  };

  // Histories longer than roughly one year can contain many thousands of
  // cells. Keep the scroll track at its full width, but only materialize the
  // columns around the visible viewport (plus a small overscan). The normal
  // one-year view stays on the stable full-render path for hidden-panel
  // tooltip compatibility, while older histories get true windowing.
  const VIRTUALIZE_AFTER_COLUMNS = 60;
  if (columns > VIRTUALIZE_AFTER_COLUMNS && heatmapBody) {
    const gridWrap = grid.closest('.heatmap-grid-wrap');
    const step = heatCell + heatGap;
    const fullWidth = Math.max(heatCell, columns * step - heatGap);
    const overscan = 8;
    grid.dataset.virtualized = 'true';
    grid.setAttribute('aria-label', '历史消耗热力图');
    grid.setAttribute('aria-colcount', String(columns));
    gridWrap?.style.setProperty('width', `${fullWidth}px`);
    gridWrap?.style.setProperty('min-width', `${fullWidth}px`);
    grid.style.setProperty('width', `${heatCell}px`);
    grid.style.setProperty('grid-auto-flow', 'column');
    grid.style.setProperty('grid-template-rows', `repeat(7, ${heatCell}px)`);
    grid.style.setProperty('column-gap', `${heatGap}px`);
    grid.style.setProperty('row-gap', `${heatGap}px`);

    const renderVirtualWindow = () => {
      if (!grid.isConnected || !heatmapBody) return;
      const inset = gridWrap
        ? Math.max(0, gridWrap.offsetLeft - heatmapBody.offsetLeft)
        : 0;
      const viewportWidth = Math.max(1, heatmapBody.clientWidth);
      const viewportStart = Math.max(0, heatmapBody.scrollLeft - inset);
      const firstVisible = Math.max(0, Math.floor(viewportStart / step));
      const visibleColumns = Math.max(1, Math.ceil(viewportWidth / step));
      const startColumn = Math.max(0, firstVisible - overscan);
      const endColumn = Math.min(columns, firstVisible + visibleColumns + overscan);
      const windowColumns = Math.max(1, endColumn - startColumn);
      const windowWidth = Math.max(heatCell, windowColumns * step - heatGap);
      if (state.tooltipAnchor && grid.contains(state.tooltipAnchor)) hideDataTooltip();
      grid.style.setProperty('width', `${windowWidth}px`);
      grid.style.setProperty('grid-template-columns', `repeat(${windowColumns}, ${heatCell}px)`);
      grid.style.setProperty('transform', `translate3d(${startColumn * step}px, 0, 0)`);
      grid.innerHTML = '';
      for (let column = startColumn; column < endColumn; column += 1) {
        for (let row = 0; row < 7; row += 1) grid.appendChild(makeCell(column, row));
      }
      grid.dataset.virtualStart = String(startColumn);
      grid.dataset.virtualEnd = String(endColumn);
    };
    const scheduleVirtualWindow = () => {
      if (grid._heatmapVirtualFrame) return;
      grid._heatmapVirtualFrame = requestAnimationFrame(() => {
        grid._heatmapVirtualFrame = 0;
        renderVirtualWindow();
      });
    };
    heatmapBody.addEventListener('scroll', scheduleVirtualWindow, { passive: true });
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleVirtualWindow);
      resizeObserver.observe(heatmapBody);
    }
    grid._heatmapVirtualRender = renderVirtualWindow;
    grid._heatmapVirtualCleanup = () => {
      heatmapBody.removeEventListener('scroll', scheduleVirtualWindow);
      resizeObserver?.disconnect();
      if (grid._heatmapVirtualFrame) cancelAnimationFrame(grid._heatmapVirtualFrame);
      grid._heatmapVirtualFrame = 0;
      grid.style.removeProperty('transform');
      grid.style.removeProperty('grid-template-columns');
      grid.style.removeProperty('grid-template-rows');
      grid.style.removeProperty('grid-auto-flow');
      grid.style.removeProperty('width');
      grid.style.removeProperty('column-gap');
      grid.style.removeProperty('row-gap');
      gridWrap?.style.removeProperty('width');
      gridWrap?.style.removeProperty('min-width');
    };
    renderVirtualWindow();
    return;
  }

  grid.style.removeProperty('transform');
  grid.style.removeProperty('grid-template-columns');
  grid.style.removeProperty('grid-template-rows');
  grid.style.removeProperty('grid-auto-flow');
  grid.style.removeProperty('width');
  grid.style.removeProperty('column-gap');
  grid.style.removeProperty('row-gap');
  const gridWrap = grid.closest('.heatmap-grid-wrap');
  gridWrap?.style.removeProperty('width');
  gridWrap?.style.removeProperty('min-width');
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < 7; row += 1) grid.appendChild(makeCell(column, row));
  }
}

function renderSubscriptions(data) {
  const container = $('#subscriptionPlans');
  if (!container) return;
  const subscriptions = data.subscriptions || [];
  $('#subscriptionCount').textContent = `${subscriptions.length} 个有效`;
  if (!subscriptions.length) {
    container.innerHTML = '<div class="empty-state">当前没有有效 Coding Plan</div>';
    return;
  }
  // Keep every plan ring in the single dark-red accent family. Provider
  // identity is communicated by the model table's grayscale logos, while
  // dashboard chrome stays limited to neutral tones plus this one accent.
  const accentColor = 'var(--accent)';
  container.innerHTML = subscriptions.map((plan, index) => {
    const percent = Math.max(0, Math.min(100, Number(plan.remainingPercent || 0) * 100));
    return `<div class="ring-plan ring-accent"><div class="ring-chart" style="--value:${percent.toFixed(1)}%;--ring:${accentColor}"><div class="ring-center"><strong>${percent.toFixed(1)}<span>%</span></strong><small>剩余</small></div></div><div class="ring-info"><div class="ring-title"><span class="plan-dot"></span><strong>${escapeHtml(plan.title)}</strong><span class="plan-status">使用中</span></div><small>${escapeHtml(plan.id)} · 已用 ${escapeHtml(formatMoney(plan.used, data))}</small><div class="ring-date">${escapeHtml(plan.endDate ? `${formatDate(plan.endDate)} 到期` : '未设置到期日')}</div></div><div class="ring-stats"><div><span>总额度</span><strong>${escapeHtml(formatMoney(plan.total, data))}</strong></div><div><span>剩余余额</span><strong>${escapeHtml(formatMoney(plan.remaining, data))}</strong></div></div></div>`;
  }).join('');
}

const MODEL_LOGO_RULES = [
  ['anthropic', /anthropic|claude|sonnet|opus|haiku/],
  ['gemini', /gemini|google|palm|flash|pro-vision/],
  ['deepseek', /deepseek/],
  ['glm', /(^|[-_ .])glm|chatglm|zhipu|智谱/],
  ['qwen', /qwen|tongyi|通义/],
  ['mistral', /mistral|mixtral/],
  ['meta', /meta|llama/],
  ['openai', /openai|gpt-|(^|[-_ .])o[134](?:[-_ .]|$)|davinci|codex/]
];

function resolveModelLogo(model) {
  const source = `${model?.logo || ''} ${model?.provider || ''} ${model?.model || ''}`.toLowerCase();
  const match = MODEL_LOGO_RULES.find(([, pattern]) => pattern.test(source));
  return match?.[0] || 'generic';
}

function renderModels(models) {
  const table = $('#modelsTable');
  if (!table) return;
  const header = '<div class="table-row table-head"><span>模型</span><span>请求次数</span><span>Token 用量</span><span>费用</span><span>占比</span></div>';
  const totalSpent = models.reduce((sum, model) => sum + Number(model.spent || 0), 0) || 1;
  const rows = models.slice(0, 12).map(model => {
    const share = Number(model.share ?? (Number(model.spent || 0) / totalSpent));
    const logo = resolveModelLogo(model);
    const extension = logo === 'glm' ? 'png' : 'svg';
    return `<div class="table-row"><span class="model-name"><i class="model-icon"><img src="assets/logos/${logo}.${extension}" alt="${escapeHtml(logo)}"></i>${escapeHtml(model.model)}</span><span>${formatCount(model.requests)}</span><span>${formatTokens(model.tokens)}</span><span>${escapeHtml(formatMoney(model.spent))}</span><span class="share"><i><b style="width:${Math.min(100, share * 100).toFixed(1)}%"></b></i>${(share * 100).toFixed(1)}%</span></div>`;
  }).join('');
  table.innerHTML = header + (rows || '<div class="empty-state">暂无模型调用记录</div>');
}

function updateWidgetPinButton() {
  if (!widgetPin) return;
  const pinned = Boolean(state.alwaysOnTop);
  widgetPin.setAttribute('aria-pressed', String(pinned));
  widgetPin.textContent = pinned ? '取消置顶' : '置顶';
  widgetPin.title = pinned ? '取消置顶小组件' : '置顶小组件';
  widgetPin.classList.toggle('is-active', pinned);
}

async function toggleWidgetPin() {
  if (!bridge) {
    notify('浏览器预览模式无法设置窗口置顶', 'error');
    return;
  }
  const next = !state.alwaysOnTop;
  widgetPin?.classList.add('is-loading');
  try {
    // Keep a dedicated bridge method for the native action.  The fallback
    // preserves compatibility with older preload bundles during an in-place
    // update, where only setWindowSettings may be present.
    const result = bridge.setAlwaysOnTop
      ? await bridge.setAlwaysOnTop(next)
      : await bridge.setWindowSettings?.({ alwaysOnTop: next });
    state.alwaysOnTop = typeof result === 'boolean'
      ? result
      : Boolean(result?.alwaysOnTop ?? next);
    updateWidgetPinButton();
    notify(state.alwaysOnTop ? '小组件已置顶' : '已取消小组件置顶');
  } catch (error) {
    notify(error?.message || '无法设置窗口置顶', 'error');
  } finally {
    widgetPin?.classList.remove('is-loading');
  }
}

function setLoading(loading) {
  ['#refreshWidget', '#refreshFull', '#loginSubmit'].forEach(selector => $(selector)?.classList.toggle('is-loading', loading));
  if ($('#loginSubmit')) $('#loginSubmit').disabled = loading;
}

async function refresh(button, silent = false) {
  if (state.refreshing) return;
  state.refreshing = true;
  button?.classList.add('is-loading');
  if (syncText) syncText.textContent = '正在同步…';
  try {
    if (!bridge) {
      if (!silent) notify('浏览器预览模式：安装应用后可连接实时账户');
      return;
    }
    const data = await bridge.refresh();
    if (!data?.authenticated) {
      updateAccountState(data);
      if (syncText) {
        syncText.textContent = data?.dataState === 'auth_expired'
          ? '登录已过期'
          : data?.dataState === 'offline'
            ? '离线缓存'
            : '尚未同步';
      }
      // Manual refresh should take the user directly to re-authentication.
      // Background refreshes retain the explicit expired state without
      // repeatedly stealing focus or reopening the modal every minute.
      if (!silent) openLogin();
      return;
    }
    renderDashboard(data);
    if (!silent) notify('Kapibala 数据已更新');
  } catch (error) {
    const message = error?.message || '刷新失败，请检查网络连接';
    if (syncText) syncText.textContent = '同步失败';
    if (!silent) notify(message, 'error');
  } finally {
    state.refreshing = false;
    button?.classList.remove('is-loading');
  }
}

async function openLogin() {
  hideDataTooltip();
  loginError.textContent = '';
  try { await bridge?.ensurePrimaryDisplay?.(); } catch {}
  loginModal.classList.add('open');
  loginModal.setAttribute('aria-hidden', 'false');
  loginUsername.focus();
}

function closeLogin() {
  loginModal.classList.remove('open');
  loginModal.setAttribute('aria-hidden', 'true');
}

async function submitLogin() {
  if (!bridge) {
    closeLogin();
    notify('浏览器预览模式无法登录，请运行安装后的 ApiUsageBar', 'error');
    return;
  }
  loginError.textContent = '';
  setLoading(true);
  try {
    const data = await bridge.login(loginUsername.value, loginPassword.value);
    loginPassword.value = '';
    closeLogin();
    renderDashboard(data);
    notify('登录成功，数据已安全同步');
  } catch (error) {
    loginError.textContent = error?.message || '登录失败，请检查账号和密码';
  } finally {
    setLoading(false);
  }
}

$$('.mode-btn,.open-full').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('#refreshWidget')?.addEventListener('click', event => refresh(event.currentTarget));
$('#refreshFull')?.addEventListener('click', event => refresh(event.currentTarget));
widgetPin?.addEventListener('click', toggleWidgetPin);
$('#themeBtn')?.addEventListener('click', () => {
  state.themePreference = document.body.classList.contains('night-mode') ? 'day' : 'night';
  localStorage.setItem('apiusagebar-theme-v2', state.themePreference);
  setTheme(state.themePreference, true);
  bridge?.setWindowSettings?.({ theme: state.themePreference });
});
$('#windowMinimize')?.addEventListener('click', () => bridge?.minimizeWindow());
$('#windowMaximize')?.addEventListener('click', () => bridge?.toggleMaximizeWindow());
$('#windowClose')?.addEventListener('click', () => bridge?.closeWindow());

// Window movement continues to use Chromium's app-region drag on the title
// bar.  Resizing is delegated to the Windows native WS_THICKFRAME hit-test
// frame (see main.cjs); no renderer-side pointer tracking is required.
$('#accountBtn')?.addEventListener('click', openLogin);
$('#closeModal')?.addEventListener('click', closeLogin);
loginModal?.addEventListener('click', event => { if (event.target === loginModal) closeLogin(); });
$('.show-pass')?.addEventListener('click', event => {
  const input = event.currentTarget.previousElementSibling;
  input.type = input.type === 'password' ? 'text' : 'password';
  event.currentTarget.textContent = input.type === 'password' ? '显示' : '隐藏';
});
$('#loginSubmit')?.addEventListener('click', submitLogin);
[loginUsername, loginPassword].forEach(input => input?.addEventListener('keydown', event => { if (event.key === 'Enter') submitLogin(); }));
$$('.chart-toggle').forEach(button => button.addEventListener('click', () => setChart(button.dataset.chart)));
$$('.range-btn').forEach(button => button.addEventListener('click', () => {
  state.modelRange = button.dataset.range;
  $$('.range-btn').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  $('#modelSubtitle').textContent = state.modelRange === 'today' ? '按模型聚合今日请求、Token 与费用' : '按模型聚合本周请求、Token 与费用';
  if (state.data) renderModels(state.data.models?.[state.modelRange] || []);
}));

const savedTheme = localStorage.getItem('apiusagebar-theme-v2');
state.themePreference = savedTheme || null;
const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
setTheme(savedTheme || (systemTheme?.matches ? 'night' : 'day'));
systemTheme?.addEventListener?.('change', event => { if (!state.themePreference) setTheme(event.matches ? 'night' : 'day', true); });
setMode('widget', { persist: false });
setChart('bars');
updateWidgetPinButton();

bridge?.getWindowSettings?.().then(settings => {
  state.settingsHydrated = true;
  if (!settings) return;
  if (typeof settings.alwaysOnTop === 'boolean') {
    state.alwaysOnTop = settings.alwaysOnTop;
    updateWidgetPinButton();
  }
  if (settings.theme) { state.themePreference = settings.theme; setTheme(settings.theme); }
  if (settings.mode) setMode(settings.mode, { persist: false });
}).catch(() => { state.settingsHydrated = true; });

function renderPreviewDemo() {
  // Keep the local prototype visually identical to the packaged opaque window:
  // the same animated material and native-window-safe layout can then be
  // reviewed directly from index.html without a second styling path.
  document.body.classList.add('electron-window');
  document.documentElement.classList.add('electron-window');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Keep a full year in the local prototype so the historical heatmap is
  // visible without requiring a live account.  Real data uses the earliest
  // date returned by Kapibala in exactly the same shape.
  const daily = Array.from({ length: 366 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (365 - index));
    const recent = index > 357 ? [102, 186, 74, 245, 318, 198, 274][index % 7] : 0;
    const periodic = index % 11 === 0 ? 34 + ((index * 17) % 120) : index % 7 === 0 ? 18 + ((index * 13) % 70) : 0;
    const requests = recent || periodic;
    return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, spent: requests * 0.0053, tokens: requests * 2020, requests };
  });
  const demo = {
    authenticated: true, username: '预览账户', currency: 'USD', currencySymbol: '$', fetchedAt: new Date().toISOString(),
    account: { balance: 248.6, used: 71.4, total: 320, requests: 2418, status: 'enabled' },
    today: { spent: 12.84, tokens: 4820000, inputTokens: 3070000, outputTokens: 1750000, requests: 2418, averageRPM: 3.1 },
    week: { spent: 88.3, tokens: 4820000, inputTokens: 3070000, outputTokens: 1750000, requests: 2418 }, daily,
    historyStart: daily[0].date, historyEnd: daily[daily.length - 1].date, historyComplete: true,
    subscriptionSummary: { count: 2, total: 200, remaining: 147.76, nearestExpiry: new Date(today.getTime() + 15 * 86400000).toISOString() },
    subscriptions: [
      { id: 'KP-240831', title: 'Pro · Coding Plan', total: 120, used: 37.92, remaining: 82.08, remainingPercent: .684, endDate: new Date(today.getTime() + 15 * 86400000).toISOString() },
      { id: 'KP-240824', title: 'Team · Coding Plan', total: 80, used: 14.32, remaining: 65.68, remainingPercent: .821, endDate: new Date(today.getTime() + 26 * 86400000).toISOString() }
    ],
    models: {
      week: [
        { model: 'gpt-4o', logo: 'openai', requests: 1102, tokens: 2380000, spent: 41.26, share: .467 },
        { model: 'claude-3-5-sonnet', logo: 'anthropic', requests: 684, tokens: 1460000, spent: 28.8, share: .326 },
        { model: 'gemini-1.5-pro', logo: 'gemini', requests: 425, tokens: 720000, spent: 11.62, share: .132 },
        { model: 'deepseek-chat', logo: 'deepseek', requests: 207, tokens: 260000, spent: 6.62, share: .075 },
        { model: 'glm-4-plus', logo: 'glm', requests: 178, tokens: 190000, spent: 4.18, share: .051 },
        { model: 'qwen-plus', logo: 'qwen', requests: 126, tokens: 150000, spent: 2.74, share: .033 },
        { model: 'mistral-large', logo: 'mistral', requests: 84, tokens: 80000, spent: 1.86, share: .02 }
      ], today: []
    }
  };
  renderDashboard(demo);
  updateAccountState({ authenticated: false });
  $('#accountState').textContent = '浏览器预览模式 · 安装应用后连接实时数据';
}

(async () => {
  if (!bridge) {
    renderPreviewDemo();
    return;
  }
  try {
    const stored = await bridge.getStoredStatus();
    updateAccountState({ authenticated: stored.authenticated, username: stored.username });
    if (stored.authenticated) await refresh(null, true);
  } catch {
    notify('无法读取本地安全存储', 'error');
  }
})();
// Background polling is intentionally paused while the tray window is hidden
// or the OS has backgrounded its WebContents.  This avoids needless network,
// JSON parsing and DOM work without changing the one-minute refresh cadence
// while the dashboard is visible.  A single catch-up refresh runs on restore.
const refreshTimer = setInterval(() => {
  if (bridge && state.data?.authenticated && document.visibilityState !== 'hidden') refresh(null, true);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && bridge && state.data?.authenticated) refresh(null, true);
});
