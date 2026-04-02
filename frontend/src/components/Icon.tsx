/**
 * Lightweight inline SVG icons replacing the ~150 KB Google Material Symbols
 * web font.  Each icon is a single <svg> with the same 24×24 viewBox so they
 * drop in wherever `<span className="material-symbols-outlined">name</span>`
 * was used before.
 *
 * Adding a new icon: grab the SVG path from https://fonts.google.com/icons,
 * add a case below, done.
 */

interface IconProps {
  name: string;
  className?: string;
}

const paths: Record<string, string> = {
  info: "M11 17h2v-6h-2zm1-8q.425 0 .713-.288T13 8t-.288-.712T12 7t-.712.288T11 8t.288.713T12 9m0 13q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22",
  group_add:
    "M15 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4m0-2c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5s-3.5 1.57-3.5 3.5S13.07 12 15 12M6 15v-3h3v-2H6V7H4v3H1v2h3v3z",
  admin_panel_settings:
    "M17 11c.34 0 .67.04 1 .09V6.27L10 2 2 6.27v5.55C2 16.04 5.31 19.92 10 21c.35-.08.7-.18 1.04-.3A5.98 5.98 0 0 1 11 17c0-3.31 2.69-6 6-6m0 2c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4m0 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M17 20c-.73 0-1.38-.3-1.86-.77.56-.5 1.14-.82 1.86-.82s1.3.32 1.86.82A2.49 2.49 0 0 1 17 20",
  lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z",
  description:
    "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z",
  grid_view:
    "M3 3v8h8V3zm6 6H5V5h4zm-6 4v8h8v-8zm6 6H5v-4h4zm4-16v8h8V3zm6 6h-4V5h4zm-6 4v8h8v-8zm6 6h-4v-4h4z",
  key: "M12.65 10a6 6 0 1 0 0 4H17v4h4v-4h3v-4zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4",
  terminal:
    "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2M7.71 14.29 5.41 12l2.3-2.29 1.42 1.42L8.24 12l.89.88-1.42 1.41M13 16h-2v-2h2zm7-4h-4v-2h4z",
  verified_user:
    "M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z",
  article:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-5 14H7v-2h7zm3-4H7v-2h10zm0-4H7V7h10z",
  verified:
    "m23 12-2.44-2.78.34-3.63-3.61-.82L15.4 1.5 12 2.96 8.6 1.5 6.71 4.77l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.2 3.61-.82-.34-3.68zm-12.91 4.72-3.8-3.8 1.42-1.41 2.38 2.39 5.96-5.96 1.41 1.41z",
  database:
    "M12 3C7 3 3 4.79 3 7v10c0 2.21 4 4 9 4s9-1.79 9-4V7c0-2.21-4-4-9-4m0 2c4.42 0 7 1.42 7 2s-2.58 2-7 2-7-1.42-7-2 2.58-2 7-2M5 17V14.43c1.57.89 4.08 1.57 7 1.57s5.43-.68 7-1.57V17c0 .58-2.58 2-7 2s-7-1.42-7-2m0-5V9.43C6.57 10.32 9.08 11 12 11s5.43-.68 7-1.57V12c0 .58-2.58 2-7 2s-7-1.42-7-2",
  check_circle:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z",
  inbox:
    "M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2m0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19z",
  apartment:
    "M17 11V3H7v4H3v14h8v-4h2v4h8V11zM7 19H5v-2h2zm0-4H5v-2h2zm0-4H5V9h2zm4 4H9v-2h2zm0-4H9V9h2zm0-4H9V5h2zm4 8h-2v-2h2zm0-4h-2V9h2zm0-4h-2V5h2zm4 12h-2v-2h2zm0-4h-2v-2h2z",
  add_circle:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m5 11h-4v4h-2v-4H7v-2h4V7h2v4h4z",
  delete_forever:
    "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM8.46 11.88l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14zM15.5 4l-1-1h-5l-1 1H5v2h14V4z",
  monitoring:
    "M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2v14H3v3c0 1.66 1.34 3 3 3h12c1.66 0 3-1.34 3-3V2zM15 20H6c-.55 0-1-.45-1-1v-1h10zm4-1c0 .55-.45 1-1 1s-1-.45-1-1v-3H8V5h11z",
};

export default function Icon({ name, className = "" }: IconProps) {
  const d = paths[name];
  if (!d) {
    // Fallback: render the name as text so nothing breaks if an icon is missing
    return <span className={className}>{name}</span>;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      width="1em"
      height="1em"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
