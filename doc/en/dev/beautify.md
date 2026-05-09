# WP Monitor Frontend Beautification Plan

## 1. Current State Analysis

**Tech Stack**: React 18 + TypeScript + Ant Design v6 + ApexCharts + Vite

The current design already has a basic visual system (CSS variables, card shadows, responsive layout), but there is clear room for improvement in the following areas.

---

## 2. Beautification Directions

### 2.1 Top Title Bar (`.title-wrap`)

**Current state**: "WP MONITOR" is plain text with no decoration, lacking visual hierarchy between the title and the right toolbar.

**Proposal**:
- Add a brand-colored left border decoration (`border-left: 4px solid #3b82f6`) to the title as a visual anchor.
- Add a subtitle below the title (e.g., "Log Traffic Real-time Monitor"), font size 12px, color `#64748b`.
- Add a 1px separator between the title area and the toolbar on the right (`border-right: 1px solid #e2e8f0`).
- Change the entire `.title-wrap` area to an independent top bar with a light background (`#ffffff`) and bottom border, giving it a "navigation bar" feel rather than floating on the page.

---

### 2.2 Real-time Refresh Status Indicator

**Current state**: Auto-refresh status is only indicated by the input number, with no visual feedback for "refreshing".

**Proposal**:
- Add a pulsing dot inside the auto-refresh chip (`@keyframes pulse`, green `#22c55e`) to indicate "real-time online" status.
- When `autoRefreshEnabled` is false, the dot turns gray and static.
- Trigger a brief rotation animation (`rotate 0.3s linear`) each time `refreshMetricsOnly` is called.

---

### 2.3 Node Cards (`.node`, `.package`, `.group`, `.log-item`, `.sink-item`)

**Current state**: Basic card visuals are acceptable, but hover/selected state changes are not prominent enough, and metric numbers are stacked with `<br>` line breaks.

**Proposal**:
- **Hover animation**: The existing `transform: translateY(-1px)` works well; add enhanced `box-shadow` from `--shadow` to `0 8px 20px rgba(0,0,0,0.12)` for a stronger 3D effect.
- **Selected state**: Add a 4px blue left border for selected nodes (package and group already have it, but `node`/`log-item`/`sink-item` lack it).
- **Metric layout**: Change rate and count to horizontally arranged badges instead of stacked text. Use `.metric-inline` with a semi-transparent background (e.g., `rgba(59,130,246,0.08)`).
- **Node name**: Increase `.node-name` font size from 14px to 15px, add `letter-spacing: 0.2px` for better readability.
- **MISS nodes**: When `miss-alert` state, add a blinking border animation (`@keyframes blink-border`, 0.5s cycle, subtle); `miss-muted` state stays static with `opacity: 0.7`.

---

### 2.4 Loading State (`<p>Loading...</p>`)

**Current state**: Plain text "Loading..." — very basic.

**Proposal**:
- Replace with skeleton screens (Skeleton Cards): display 2-3 gray gradient rectangles in each of the 3 columns (using `@keyframes shimmer` animation, left-to-right sweep effect).
- Colors from `#f1f5f9` to `#e2e8f0` gradient sweep.
- Height should approximate real card height to avoid layout shift (CLS).

---

### 2.5 Detail Panel (`.detail-panel`)

**Current state**: The detail panel header is plain, and the drag handle is not visually prominent enough.

**Proposal**:
- **Drag handle** `.detail-drag-handle`: Increase width from 36px to 48px, hover color changes from `#94a3b8` to `#3b82f6` (`cursor: ns-resize` already exists, no change needed).
- **Header gradient background** `.detail-panel-head`: Slightly increase blue saturation from `linear-gradient(180deg, #f8fbff 0%, #f2f7ff 100%)` to `linear-gradient(180deg, #f0f7ff 0%, #e8f2ff 100%)`.
- **Node Pill** `.detail-node-pill`: Add a prefix color dot "●" corresponding to node type (source = blue, parse = purple, sink = cyan). Add corresponding class names in JSX (e.g., `detail-node-pill--source`), then set colors via CSS `::before`.
- **Close button** `.drawer-close`: Add hover state `background: #fee2e2; color: #b91c1c` (red warning) for better discoverability.

---

### 2.6 Sparkline Chart Container (`.spark`)

**Current state**: ApexCharts chart container has a light gradient background and blends well, but the chart area is relatively small (132px height).

**Proposal**:
- Increase `.spark-chart` default height from 132px to 160px for more breathing room.

---

### 2.7 Toolbar Button Visual Unification

**Current state**: `.mini-btn` border color `#c8d2dc` and background `#f6f9fb` look a bit dull.

**Proposal**:
- Change `.mini-btn` to white background + `#d1d9e8` border + hover becomes `#eff6ff` background + `#2563eb` border, aligning with the overall blue theme.
- Quick time-range buttons (`.wd-time-quick-btn`): In addition to existing `font-weight: 700`, add a 2px blue bottom underline `border-bottom: 2px solid #2563eb`.
- Query button `.btn-wow-primary`: Change gradient angle from 135° to 160°, gradient end color from `#60a5fa` to `#3b82f6` (more stable button color), add `transform: translateY(-1px)` + shadow on hover.

---

### 2.8 Error Toast Improvements

**Current state**: Toast already has a basic red design, but the icon is just text "!".

**Proposal**:
- Replace error icon with an SVG warning triangle (via `clip-path` or inline), more semantically appropriate than a circular "!".
- Add entrance animation: from top `translateY(-20px) + opacity: 0` to normal position, duration `0.2s ease-out` (pure CSS).
- Add exit animation: reverse fade-out, duration `0.15s`. Note: the current implementation uses `setToastVisible(false)` to unmount directly, which cannot be intercepted by CSS alone. Needs JS-based approach: trigger CSS `animation` first, then clear state after animation ends (listen to `animationend` event).

---

### 2.9 Scrollbar Beautification

**Current state**: Scrollable areas (`.lane-scroll`, `.log-list`, `.sink-list`) use system default scrollbars, inconsistent across macOS/Windows.

**Proposal** (Webkit + Firefox):

```css
* {
    scrollbar-width: thin;
    scrollbar-color: #c1cad6 transparent;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #c1cad6; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
```

---

### 2.10 Dark Mode Support (Optional / Advanced)

**Current state**: No dark mode, light-only design.

**Proposal**:
- Use `@media (prefers-color-scheme: dark)` to redefine CSS variables:
  - `--page-bg: #0f172a`
  - `--card-bg: #1e293b`
  - `--text-main: #f1f5f9`
  - `--text-sub: #94a3b8`
  - Darken lane package/group/miss border colors accordingly.
- Use Ant Design `ConfigProvider` with `theme: { algorithm: theme.darkAlgorithm }` for component dark mode.

---

## 3. Priority Suggestions

| Priority | Item | Effort | Visual Impact |
|----------|------|--------|---------------|
| P0 High  | Scrollbar unification + skeleton loading | Small | Medium |
| P0 High  | Node card selected/hover refinement | Small | High |
| P1 Medium| Real-time refresh pulse indicator | Small | Medium |
| P1 Medium| Title bar + subtitle | Small | High |
| P1 Medium| Toolbar button visual unification | Small | Medium |
| P2 Low   | Detail panel header optimization | Small | Medium |
| P2 Low   | Error Toast animation | Small | Medium |
| P3 Optional| Dark mode | Large | High |

All proposals **do not involve component structure refactoring** — they can be implemented primarily through CSS variable extensions, new CSS rules, and minor JSX structural adjustments, with controllable risk.
