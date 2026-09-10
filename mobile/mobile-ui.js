// Viewport, navigation, modal focus and motion live here; API work stays in the client.
export function createMobileUI({ onSection, onResume } = {}) {
  const $ = selector => document.querySelector(selector);
  const shell = $('.mobile-shell');
  const content = $('.mobile-content');
  const sections = ['overview', 'history', 'models', 'settings'];
  const positions = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = 'overview', modal = null, previousFocus = null, animation = null, resizeFrame = 0;
  let fullHeight = innerHeight, lastWidth = innerWidth;
  const icons = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.5 14a8.7 8.7 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z"/>',
    account: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2"/>',
    overview: '<path d="m3 10 9-7 9 7v11H3zM9 21v-7h6v7"/>',
    history: '<path d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2"/>',
    models: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/>'
  };
  document.querySelectorAll('[data-icon]').forEach(node => {
    node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${icons[node.dataset.icon] || ''}</svg>`;
  });

  // Press feedback is cancelled on scroll/pointer cancellation; no stuck hover on touch screens.
  let press=null;
  const release=()=>{if(press){press.card.classList.remove('is-pressed');press=null;}};
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0 || !event.isPrimary)return;
    const card=event.target.closest('.mobile-card,.model-card');
    if(!card || event.target.closest('button,input,select,a'))return;
    release();press={card,x:event.clientX,y:event.clientY};card.classList.add('is-pressed');
  },{passive:true});
  document.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)release();},{passive:true});
  document.addEventListener('pointerup',release,{passive:true});
  document.addEventListener('pointercancel',release,{passive:true});
  window.addEventListener('blur',release);

  function updateViewport() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const vv = window.visualViewport;
      // Browser zoom must not resize the layout and fight native magnification.
      if (vv && vv.scale !== 1) return;
      const height = Math.round(vv?.height || innerHeight);
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      document.documentElement.style.setProperty('--viewport-top', `${vv?.offsetTop || 0}px`);
      const focused = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
      if (!focused || innerWidth !== lastWidth) fullHeight = height;
      lastWidth = innerWidth;
      const keyboard = focused && (fullHeight - height > 100 || innerHeight - height > 100 || height < 500);
      document.body.classList.toggle('keyboard-open', keyboard);
      if (focused && modal) document.activeElement.scrollIntoView({ block: 'nearest' });
    });
  }
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  document.addEventListener('focusin', updateViewport);
  document.addEventListener('focusout', updateViewport);
  updateViewport();

  function showSection(target, { reset = false } = {}) {
    if (!sections.includes(target)) return;
    if (target === active) {
      if (reset) content.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' });
      return;
    }
    positions.set(active, content.scrollTop);
    animation?.cancel();
    const direction = Math.sign(sections.indexOf(target) - sections.indexOf(active));
    active = target;
    document.querySelectorAll('.mobile-section').forEach(node => {
      node.hidden = node.dataset.section !== target;
      node.classList.toggle('is-active', !node.hidden);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(node => {
      const selected = node.dataset.target === target;
      node.classList.toggle('active', selected);
      if (selected) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    });
    content.scrollTop = reset ? 0 : positions.get(target) || 0;
    if (!reduced.matches) animation = $(`[data-section="${target}"]`).animate([
      { opacity: .4, transform: `translateX(${direction * 12}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' });
    onSection?.(target);
  }
  function openSheet(id) {
    if (modal === id) return;
    if (modal) closeSheet();
    previousFocus = document.activeElement;
    modal = id;
    shell.inert = true;
    const sheet = $(`#${id}`);
    sheet.inert = false;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    $('#mobileToast').classList.remove('show');
    sheet.querySelector('[role="dialog"]').focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!modal) return false;
    const sheet = $(`#${modal}`);
    sheet.querySelectorAll('input[type="password"], #loginPassword').forEach(node => { node.value = ''; node.type = 'password'; });
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); sheet.inert = true;
    sheet.dispatchEvent(new Event('sheet-close'));
    modal = null; shell.inert = false;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    updateViewport();
    return true;
  }
  function back() {
    if (closeSheet()) return true;
    if (active !== 'overview') { showSection('overview'); return true; }
    return false;
  }
  document.querySelectorAll('.mobile-sheet-backdrop').forEach(node => {
    node.inert = true;
    node.addEventListener('click', event => { if (event.target === node) closeSheet(); });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && back()) event.preventDefault();
    if (event.key !== 'Tab' || !modal) return;
    const focusable = [...$(`#${modal}`).querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(n => n.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
  });
  // A dev event lets the same back policy be verified before packaging the native plugin.
  window.addEventListener('mobile-back', () => back());
  const app = globalThis.CapacitorApp;
  if (globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor?.isPluginAvailable?.('App')) {
    app.addListener('backButton', () => { if (!back()) app.minimizeApp(); }).catch(() => {});
    app.addListener('appStateChange', ({ isActive }) => { if (isActive) onResume?.(); }).catch(() => {});
  }
  return { showSection, openSheet, closeSheet, back, get active() { return active; }, get modal() { return modal; } };
}
