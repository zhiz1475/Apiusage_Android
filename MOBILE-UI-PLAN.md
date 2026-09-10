# Android / phone UI review (360×800 and 412×915)

This document is a non-invasive handoff for the Android build. It does not
change the Windows renderer. The current desktop stylesheet is already
responsive at 600px, but several rules are still desktop-first (`100vw`, the
650px model table, a fixed 390px login dialog, and 27–34px controls). The
mobile shell should opt into the rules below with `body.mobile-app` (or a
native `data-platform="android"` attribute) so the Electron widget geometry
stays untouched.

## Geometry and safe areas

Use `100dvh` for the phone viewport and reserve status/navigation bar insets.
The current `width:100vw` can create a horizontal strip when the WebView has a
scrollbar.

```css
body.mobile-app {
  min-width: 0;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--bg);
}
body.mobile-app .app-shell {
  width: 100%;
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 8px)
           max(12px, env(safe-area-inset-right))
           calc(env(safe-area-inset-bottom) + 16px)
           max(12px, env(safe-area-inset-left));
}
body.mobile-app .view-full,
body.mobile-app .view-widget {
  height: calc(100dvh - 62px);
  max-height: none;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}
```

## Top bar and touch targets

At 360px, the capybara mark, wordmark, two-mode switch, theme and account
controls must fit in one row. Hide desktop window controls on Android, shorten
the wordmark, and keep every actionable control at least 44px high. The
account button may show only the dot/person glyph while retaining its full
accessible label.

```css
body.mobile-app .topbar {
  position: sticky;
  top: 0;
  z-index: 15;
  height: 54px;
  margin: -8px -12px 12px;
  padding: 0 12px;
  gap: 6px;
  background: var(--bg);
}
body.mobile-app .brand-lockup { gap: 5px; min-width: 0; }
body.mobile-app .brand-lockup .brand-mark,
body.mobile-app .brand-lockup .capybara-logo { width: 32px; height: 32px; }
body.mobile-app .brand-wordmark { width: 92px; height: 26px; }
body.mobile-app .mode-switch { flex: 0 0 auto; height: 44px; margin-left: auto; }
body.mobile-app .mode-btn { min-width: 46px; height: 42px; padding: 0 6px; font-size: 11px; }
body.mobile-app .topbar-actions { flex: 0 0 auto; gap: 4px; }
body.mobile-app .topbar-actions .icon-btn,
body.mobile-app .topbar-actions .account-pill { min-width: 44px; width: 44px; height: 44px; padding: 0; justify-content: center; }
body.mobile-app .account-pill > span:nth-child(2) { display: none; }
body.mobile-app .account-pill::after { content: '⌄'; font-size: 14px; }
body.mobile-app .window-controls { display: none; }
body.mobile-app button,
body.mobile-app .account-pill,
body.mobile-app input { touch-action: manipulation; }
```

For 412px, the wordmark can be widened to 116px with a media query. Do not
use the existing Electron compact rule (`body.electron-window[data-mode]`) for
the phone build; it intentionally uses 24–30px controls for the fixed Windows
widget.

## Widget and KPI hierarchy

The phone dashboard should use two compact KPI columns; one-column cards make
the first screen unnecessarily long. Keep the first four metrics visible in a
2×2 grid, with a minimum 126px card height and 12–14px inner padding.

```css
body.mobile-app .full-toolbar { display: block; margin: 8px 0 14px; }
body.mobile-app .full-toolbar h1 { font-size: 24px; }
body.mobile-app .toolbar-right { width: 100%; margin-top: 10px; justify-content: space-between; }
body.mobile-app .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
body.mobile-app .kpi-grid > .kpi-card { min-height: 126px; padding: 13px; }
body.mobile-app .kpi-main { margin: 16px 0 12px; font-size: 24px; }
body.mobile-app .kpi-meta { display: grid; gap: 3px; line-height: 1.3; }
body.mobile-app .content-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; margin-top: 12px; }
body.mobile-app .panel { padding: 14px; }
```

The compact widget remains available as a mode, but its card should be
content-sized in the WebView rather than locked to the Windows 360×360 native
window:

```css
body.mobile-app[data-mode="widget"] .widget-stage { padding: 8px 0 16px; }
body.mobile-app[data-mode="widget"] .widget-card { padding: 16px; }
body.mobile-app[data-mode="widget"] .widget-card .widget-footer { margin-top: 14px; }
```

## Charts and history heatmap

Chart controls are full-width segmented controls with a 44px hit area. The
heatmap remains horizontally scrollable inside its panel; the page itself
must never acquire horizontal scrolling.

```css
body.mobile-app .usage-panel .panel-header { display: block; }
body.mobile-app .usage-panel .panel-header > div:last-child,
body.mobile-app .models-panel .panel-header > div:last-child { display: flex; width: 100%; margin-top: 12px; }
body.mobile-app .chart-toggle,
body.mobile-app .range-btn { flex: 1 1 0; min-height: 44px; padding: 0 8px; }
body.mobile-app .chart-heatmap .heatmap-body { max-width: 100%; touch-action: pan-x; overscroll-behavior-x: contain; }
body.mobile-app .heatmap-selected { min-height: 48px; padding: 11px 0; font-size: 12px; }
```

## Model list (avoid a 650px horizontal table)

The current `.models-table` intentionally has `min-width:650px`; that is
usable on desktop but poor on a phone. Hide the heading row and turn each
model row into a two-column card. The `nth-child` labels below map to the
existing renderer markup, so no data API change is required.

```css
body.mobile-app .models-panel { overflow: visible; }
body.mobile-app .models-table { min-width: 0; overflow: visible; }
body.mobile-app .models-table .table-head { display: none; }
body.mobile-app .models-table .table-row:not(.table-head) {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  min-width: 0;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--line);
}
body.mobile-app .models-table .table-row > .model-name { grid-column: 1 / -1; min-width: 0; font-size: 13px; }
body.mobile-app .models-table .table-row > span:nth-child(2)::before { content: '请求 '; }
body.mobile-app .models-table .table-row > span:nth-child(3)::before { content: 'Token '; }
body.mobile-app .models-table .table-row > span:nth-child(4)::before { content: '费用 '; }
body.mobile-app .models-table .table-row > span:nth-child(2),
body.mobile-app .models-table .table-row > span:nth-child(3),
body.mobile-app .models-table .table-row > span:nth-child(4) { color: var(--muted); font-size: 11px; }
body.mobile-app .models-table .table-row > .share { grid-column: 1 / -1; }
body.mobile-app .models-table .share i { width: calc(100% - 42px); max-width: none; }
```

## Login dialog and tooltip

The current 390px dialog overflows a 360px viewport. Use the safe area and a
scrollable dialog. Tooltips must remain fixed to the viewport and wrap text on
touch devices; heatmap cells should show their detail on tap (the existing
click selection already provides this persistent detail).

```css
body.mobile-app .modal-backdrop { padding: 16px; place-items: center; }
body.mobile-app .login-modal {
  width: min(100%, 390px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 22px 18px;
}
body.mobile-app .login-modal input { min-height: 46px; font-size: 16px; }
body.mobile-app .data-tooltip {
  max-width: calc(100vw - 24px);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

## Theme, accent and interaction performance

Keep the existing grayscale/dark-red tokens. On a phone there is no hover, so
the full-window ambient red gradient should be disabled to avoid repainting on
every touch move; use a short pressed border instead. This does not affect the
desktop pointer field.

```css
@media (hover: none), (pointer: coarse) {
  body.mobile-app .app-shell::after { display: none; }
  body.mobile-app .interactive-surface.is-hovered {
    transform: none;
    box-shadow: none;
    background-image: none;
  }
  body.mobile-app .interactive-surface.is-pressed {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
}
```

Set `body.mobile-app` in the Android shell and adapt the existing
`window.kapibala` bridge to a Capacitor/native API. The visual rules above are
independent of that bridge, so the same HTML can remain the renderer while
secure token storage, refresh locking, and offline cache move to Android's
Keystore-backed storage.

