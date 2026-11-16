// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Original inline SVG icons (24x24, stroke = currentColor). Constant strings only.

const wrap = (body: string, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const icons = {
  gate: wrap('<path d="M4 20V8M20 20V8M4 12.5q8-4 16 0M4 19h16M8 11v8M12 10.2V19M16 11v8"/>'),
  car: wrap('<path d="M5 16v2.5M19 16v2.5M3.5 16h17v-3.6a2 2 0 0 0-.6-1.4L18 9l-1.6-3.2A1.5 1.5 0 0 0 15 5H9a1.5 1.5 0 0 0-1.4.8L6 9l-1.9 2a2 2 0 0 0-.6 1.4Z"/><path d="M6 9h12"/><circle cx="7.5" cy="13" r=".6" fill="currentColor"/><circle cx="16.5" cy="13" r=".6" fill="currentColor"/>'),
  home: wrap('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>'),
  building: wrap('<path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V20M14 10h4.5A1.5 1.5 0 0 1 20 11.5V20M2.5 20h19M7.5 8h3M7.5 11.5h3M7.5 15h3M17 14h0M17 17h0"/>'),
  door: wrap('<path d="M6 20V4.8A.8.8 0 0 1 6.8 4h10.4a.8.8 0 0 1 .8.8V20M3.5 20h17"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor"/>'),
  tree: wrap('<path d="M12 21v-5M12 3 6.5 10H9l-3.5 5h13L15 10h2.5Z"/>'),
  hand: wrap('<path d="M9 11.5V5.8a1.6 1.6 0 0 1 3.2 0V11M12.2 10V4.6a1.6 1.6 0 0 1 3.2 0V11M15.4 9.5V6.6a1.6 1.6 0 0 1 3.2 0v6.9a7 7 0 0 1-7 7h-.8a6 6 0 0 1-4.6-2.2L3.6 14.8a1.5 1.5 0 0 1 2.2-2L9 15"/>'),
  check: wrap('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  x: wrap('<path d="M6 6l12 12M18 6 6 18"/>', ' stroke-width="2.4"'),
  alert: wrap('<path d="M12 8.5v4.5M12 16.5h0"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'),
  wifiOff: wrap('<path d="m3 3 18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.8M2 9.5a15 15 0 0 1 4.6-2.9M22 9.5A15 15 0 0 0 11 5.6"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/>'),
  pin: wrap('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>'),
  locate: wrap('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5"/>'),
  more: wrap('<circle cx="5.5" cy="12" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="18.5" cy="12" r="1.1" fill="currentColor"/>'),
  list: wrap('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="18" r=".9" fill="currentColor"/>'),
  clock: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  sliders: wrap('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  share: wrap('<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>'),
  copy: wrap('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  ticket: wrap('<path d="M3.5 8.5V7A1.5 1.5 0 0 1 5 5.5h14A1.5 1.5 0 0 1 20.5 7v1.5a2.5 2.5 0 0 0 0 5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-1.5a2.5 2.5 0 0 0 0-5Z"/><path d="M14 5.5v2M14 11v2M14 16.5v2"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.2"'),
  chevron: wrap('<path d="m9 5 7 7-7 7"/>'),
  chevronDown: wrap('<path d="m6 9 6 6 6-6"/>'),
  user: wrap('<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  logout: wrap('<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h9"/>'),
  map: wrap('<path d="m9 4.5-5 2v13l5-2 6 2 5-2v-13l-5 2-6-2ZM9 4.5v13M15 6.5v13"/>'),
  trash: wrap('<path d="M4.5 6.5h15M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7M6.5 6.5l.9 12.6a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12.6"/>'),
  download: wrap('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>'),
  upload: wrap('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>'),
  shield: wrap('<path d="M12 3.5 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6Z"/>'),
  link: wrap('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  ban: wrap('<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'),
  phone: wrap('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
} as const;

export type IconName = keyof typeof icons;

export const GATE_ICON_NAMES = ["gate", "car", "home", "building", "door", "tree"] as const;
export type GateIconName = (typeof GATE_ICON_NAMES)[number];

export function gateIcon(name: string | undefined, gateName: string): string {
  if (name && (GATE_ICON_NAMES as readonly string[]).includes(name)) return icons[name as GateIconName];
  // Guess from the gate's name so a fresh setup already looks right.
  const n = gateName.toLowerCase();
  if (/garag|car|carro/.test(n)) return icons.car;
  if (/house|casa|home|chac|sitio|farm/.test(n)) return icons.home;
  if (/build|condo|predio|prédio|entr|lobby|portaria/.test(n)) return icons.building;
  if (/door|porta/.test(n)) return icons.door;
  return icons.gate;
}
