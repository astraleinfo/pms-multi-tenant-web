import * as React from "react";

/* ==========================================================================
   One icon family: 24px grid, 1.6 stroke, round caps. Everything in the app
   draws from here so no stray icon set can dilute the look.
   ========================================================================== */

export type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...rest}
    >
      {children}
    </svg>
  );
}

const mk = (path: React.ReactNode) => {
  const C = (p: IconProps) => <Svg {...p}>{path}</Svg>;
  return C;
};

export const IconPulse = mk(<><path d="M3 12h3.5l2-5 3.5 11 2.5-6H21" /></>);
export const IconUsers = mk(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.3M18 20a6 6 0 0 0-1.6-4.1" /></>);
export const IconUser = mk(<><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></>);
export const IconCalendar = mk(<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconQueue = mk(<><path d="M4 7h.01M4 12h.01M4 17h.01M9 7h11M9 12h11M9 17h7" /></>);
export const IconStethoscope = mk(<><path d="M6 3v5a4 4 0 0 0 8 0V3" /><path d="M4.5 3h3M12.5 3h3" /><path d="M10 12v2.5a5.5 5.5 0 0 0 9 4.2" /><circle cx="19.5" cy="16.5" r="2.2" /></>);
export const IconRx = mk(<><path d="M5 20V6h4.2a3.2 3.2 0 0 1 0 6.4H5" /><path d="M9.6 12.4 19 21M19 12.6 12 20" /></>);
export const IconPill = mk(<g transform="rotate(-45 12 12)"><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" /><line x1="12" y1="8.5" x2="12" y2="15.5" /></g>);
export const IconFlask = mk(<><path d="M9.5 3v6.2L4.6 17.4A2 2 0 0 0 6.3 20.5h11.4a2 2 0 0 0 1.7-3.1L14.5 9.2V3" /><path d="M8.5 3h7M7.4 14.5h9.2" /></>);
export const IconBox = mk(<><path d="M3.5 7.6 12 3.4l8.5 4.2v8.8L12 20.6 3.5 16.4V7.6Z" /><path d="m3.5 7.6 8.5 4.3 8.5-4.3M12 11.9v8.7" /></>);
export const IconReceipt = mk(<><path d="M5 3.6 7 5l2-1.4L11 5l2-1.4L15 5l2-1.4v16.8L17 19l-2 1.4L13 19l-2 1.4L9 19l-2 1.4L5 19V3.6Z" /><path d="M8.5 9h7M8.5 13h4.5" /></>);
export const IconChart = mk(<><path d="M4 20V4M4 20h16" /><rect x="7.5" y="12" width="3" height="5" rx="1" /><rect x="12.5" y="8" width="3" height="9" rx="1" /><rect x="17.5" y="14" width="3" height="3" rx="1" /></>);
export const IconSettings = mk(<><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h7M15 17h5" /><circle cx="16" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="13" cy="17" r="2" /></>);
export const IconGauge = mk(<><path d="M12 13.5 16 9" /><circle cx="12" cy="13.5" r="1.4" /><path d="M4.2 17a9 9 0 1 1 15.6 0" /></>);
export const IconMonitor = mk(<><rect x="2.5" y="4" width="19" height="12.5" rx="2" /><path d="M8.5 20.5h7M12 16.5v4" /></>);
export const IconSearch = mk(<><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.4 15.4 4.1 4.1" /></>);
export const IconBell = mk(<><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.2-2 6.2h16S18 14 18 9Z" /><path d="M13.7 19a2 2 0 0 1-3.4 0" /></>);
export const IconSun = mk(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" /></>);
export const IconMoon = mk(<><path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" /></>);
export const IconChevronDown = mk(<><path d="m6 9.5 6 6 6-6" /></>);
export const IconChevronRight = mk(<><path d="m9.5 6 6 6-6 6" /></>);
export const IconChevronLeft = mk(<><path d="m14.5 6-6 6 6 6" /></>);
export const IconPlus = mk(<><path d="M12 5v14M5 12h14" /></>);
export const IconMinus = mk(<><path d="M5 12h14" /></>);
export const IconCheck = mk(<><path d="m5 12.5 4.5 4.5L19 7" /></>);
export const IconX = mk(<><path d="M6 6l12 12M18 6 6 18" /></>);
export const IconArrowRight = mk(<><path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5" /></>);
export const IconArrowUp = mk(<><path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" /></>);
export const IconArrowDown = mk(<><path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" /></>);
export const IconMore = mk(<><circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" /></>);
export const IconClock = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2V12l3.2 2" /></>);
export const IconFilter = mk(<><path d="M3.5 5.5h17l-6.6 7.6V19l-3.8 2v-7.9L3.5 5.5Z" /></>);
export const IconPrint = mk(<><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="7.5" rx="2" /><path d="M7 14h10v6.5H7V14Z" /></>);
export const IconEdit = mk(<><path d="M4 20h4l10.5-10.5a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6 4 20Z" /><path d="m14.5 7.5 2.5 2.5" /></>);
export const IconTrash = mk(<><path d="M4.5 6.5h15M9.5 6.5V4.6h5v1.9M6.5 6.5 7.4 20h9.2l.9-13.5" /><path d="M10.5 10v6M13.5 10v6" /></>);
export const IconAlert = mk(<><path d="M12 4.2 21 19.5H3L12 4.2Z" /><path d="M12 10v4.2M12 17.2h.01" /></>);
export const IconInfo = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11.2v5M12 8h.01" /></>);
export const IconLock = mk(<><rect x="4.5" y="10" width="15" height="10.5" rx="2.4" /><path d="M8 10V7.6a4 4 0 0 1 8 0V10" /><path d="M12 14v3" /></>);
export const IconUnlock = mk(<><rect x="4.5" y="10" width="15" height="10.5" rx="2.4" /><path d="M8 10V7.6a4 4 0 0 1 7.7-1.6" /><path d="M12 14v3" /></>);
export const IconKey = mk(<><circle cx="8" cy="15.5" r="4" /><path d="m10.9 12.6 8-8" /><path d="m16.4 7.1 2.2 2.2M14.2 9.3l2.2 2.2" /></>);
export const IconSpark = mk(<><path d="M12 3.5 13.8 9 19 10.8 13.8 12.6 12 18l-1.8-5.4L5 10.8 10.2 9 12 3.5Z" /><path d="M18.6 16.4 19.4 18.6 21.6 19.4 19.4 20.2 18.6 22.4 17.8 20.2 15.6 19.4 17.8 18.6 18.6 16.4Z" /></>);
export const IconLogout = mk(<><path d="M14.5 8V5.5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V16" /><path d="M10 12h10.5M17.5 8.5 21 12l-3.5 3.5" /></>);
export const IconPhone = mk(<><path d="M6.4 3.6h3.2l1.6 4-2 1.4a12 12 0 0 0 5.8 5.8l1.4-2 4 1.6v3.2a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.4 5.8a2 2 0 0 1 2-2.2Z" /></>);
export const IconMail = mk(<><rect x="3" y="5.5" width="18" height="13" rx="2.4" /><path d="m3.8 7 8.2 6 8.2-6" /></>);
export const IconPin = mk(<><path d="M12 21s6.8-6.1 6.8-11A6.8 6.8 0 0 0 5.2 10c0 4.9 6.8 11 6.8 11Z" /><circle cx="12" cy="10" r="2.4" /></>);
export const IconEye = mk(<><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = mk(<><path d="M3.5 3.5l17 17" /><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c5 0 8.5 4.3 9.5 6.5a12.6 12.6 0 0 1-2.8 3.7M6.6 6.9C4.6 8.2 3.2 10.2 2.5 12c1 2.2 4.5 6.5 9.5 6.5a9.2 9.2 0 0 0 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IconDroplet = mk(<><path d="M12 3.2s6 6.3 6 10.2a6 6 0 0 1-12 0c0-3.9 6-10.2 6-10.2Z" /></>);
export const IconTooth = mk(<><path d="M7.8 3.4C5.4 3.4 4 5.3 4 7.9c0 2.4 1 3.6 1.4 6.2.3 2 .3 6.4 2.2 6.4 1.7 0 1.6-4.6 2.9-4.6h3c1.3 0 1.2 4.6 2.9 4.6 1.9 0 1.9-4.4 2.2-6.4.4-2.6 1.4-3.8 1.4-6.2 0-2.6-1.4-4.5-3.8-4.5-1.6 0-2.4.9-4.2.9s-2.6-.9-4.2-.9Z" /></>);
/* the tooth, a little smaller, with a pair of arcs either side — it rocks in its socket */
export const IconToothMobility = mk(<><g transform="translate(2.4 2.4) scale(.8)"><path vectorEffect="non-scaling-stroke" d="M7.8 3.4C5.4 3.4 4 5.3 4 7.9c0 2.4 1 3.6 1.4 6.2.3 2 .3 6.4 2.2 6.4 1.7 0 1.6-4.6 2.9-4.6h3c1.3 0 1.2 4.6 2.9 4.6 1.9 0 1.9-4.4 2.2-6.4.4-2.6 1.4-3.8 1.4-6.2 0-2.6-1.4-4.5-3.8-4.5-1.6 0-2.4.9-4.2.9s-2.6-.9-4.2-.9Z" /></g><path d="M3.4 9.2c-.9 1.2-.9 3.4 0 4.6M20.6 9.2c.9 1.2.9 3.4 0 4.6" /></>);
/* the tooth with a crack running down from the biting edge */
export const IconToothFracture = mk(<><path d="M7.8 3.4C5.4 3.4 4 5.3 4 7.9c0 2.4 1 3.6 1.4 6.2.3 2 .3 6.4 2.2 6.4 1.7 0 1.6-4.6 2.9-4.6h3c1.3 0 1.2 4.6 2.9 4.6 1.9 0 1.9-4.4 2.2-6.4.4-2.6 1.4-3.8 1.4-6.2 0-2.6-1.4-4.5-3.8-4.5-1.6 0-2.4.9-4.2.9s-2.6-.9-4.2-.9Z" /><path d="M12.6 4.3 10.6 8.2l3 1.9-2.2 4" /></>);
export const IconLayers = mk(<><path d="m12 3.5 8.5 4.3L12 12 3.5 7.8 12 3.5Z" /><path d="m3.5 12.2 8.5 4.3 8.5-4.3M3.5 16.4l8.5 4.2 8.5-4.2" /></>);
export const IconShield = mk(<><path d="M12 3.2 19.5 6v6c0 4.6-3.2 7.4-7.5 8.8C7.7 19.4 4.5 16.6 4.5 12V6L12 3.2Z" /><path d="m9 12 2.2 2.2L15.2 10" /></>);
export const IconGrid = mk(<><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></>);
export const IconList = mk(<><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></>);
export const IconRefresh = mk(<><path d="M20 11.5a8 8 0 1 0-.7 4.3" /><path d="M20.5 5v5h-5" /></>);
export const IconChevronCircleLeft = mk(<><circle cx="12" cy="12" r="8.5" /><path d="m13.5 8.5-3.5 3.5 3.5 3.5" /></>);
export const IconSidebar = mk(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.4" /><path d="M9.5 4.5v15" /></>);
export const IconPlay = mk(<><path d="M8 5.5 18 12 8 18.5v-13Z" /></>);
export const IconBookmark = mk(<><path d="M6 4.5h12v16l-6-4-6 4v-16Z" /></>);
export const IconNote = mk(<><path d="M6.5 3.5h8l3 3v14h-11v-17Z" /><path d="M14.5 3.5v3h3M9 11h6M9 14.5h6M9 18h3.5" /></>);
export const IconCard = mk(<><rect x="2.5" y="5" width="19" height="14" rx="2.6" /><path d="M2.5 9.8h19M6 15h4" /></>);
export const IconDownload = mk(<><path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>);
export const IconUpload = mk(<><path d="M12 15V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 19.5h15" /></>);
/* a pair: the same open tray, the arrow going in or coming out */
export const IconImport = mk(<><path d="M4.5 14v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14" /><path d="M12 3.5v11M8 10.5l4 4 4-4" /></>);
export const IconExport = mk(<><path d="M4.5 14v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14" /><path d="M12 14.5v-11M8 7.5l4-4 4 4" /></>);
export const IconSheet = mk(<><rect x="4" y="3.5" width="16" height="17" rx="2.2" /><path d="M4 9h16M4 14.5h16M10 9v11.5" /></>);
export const IconExternal = mk(<><path d="M14 4.5h5.5V10" /><path d="m19.5 4.5-8 8" /><path d="M18.5 14v4.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2H10" /></>);
