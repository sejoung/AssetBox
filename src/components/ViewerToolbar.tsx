import { OVERLAY_BG, OVERLAY_BORDER, OVERLAY_BACKDROP, type BgMode } from "../lib/overlayStyle";

export type ViewMode = "default" | "wireframe" | "normals" | "normalmap" | "uv";

interface ViewerToolbarProps {
  viewMode: ViewMode;
  bgMode: BgMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBgModeChange: (mode: BgMode) => void;
  hasModel: boolean;
}

const VIEW_MODES: { mode: ViewMode; label: string; shortcut: string; icon: string }[] = [
  {
    mode: "default",
    label: "Solid",
    shortcut: "1",
    icon: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25",
  },
  {
    mode: "wireframe",
    label: "Wire",
    shortcut: "2",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    mode: "normals",
    label: "Normals",
    shortcut: "3",
    icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
  },
  {
    mode: "normalmap",
    label: "Normal Map",
    shortcut: "4",
    icon: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
  },
  {
    mode: "uv",
    label: "UV",
    shortcut: "5",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h12A2.25 2.25 0 0120.25 15.75V18A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z",
  },
];

const BG_MODES: { mode: BgMode; color: string }[] = [
  { mode: "dark", color: "#1a1a2e" },
  { mode: "neutral", color: "#404040" },
  { mode: "light", color: "#d0d0d0" },
];

export function ViewerToolbar({
  viewMode,
  bgMode,
  onViewModeChange,
  onBgModeChange,
  hasModel,
}: ViewerToolbarProps) {
  if (!hasModel) return null;

  return (
    <div className="absolute bottom-5 left-5 right-5 z-20 flex items-center gap-1.5 flex-wrap justify-start">
      {/* View mode — separate pill buttons */}
      {VIEW_MODES.map(({ mode, label, shortcut, icon }) => {
        const isActive = viewMode === mode;
        return (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className="flex items-center gap-2.5 min-w-[90px] px-5 py-3 rounded-xl text-sm font-semibold leading-relaxed whitespace-nowrap transition-all duration-150 cursor-pointer hover:brightness-125 shrink-0"
            style={{
              backgroundColor: isActive ? "rgba(233, 69, 96, 0.25)" : OVERLAY_BG,
              border: isActive ? "1px solid #e94560" : OVERLAY_BORDER,
              color: isActive ? "#e94560" : "#a0a0b0",
              backdropFilter: OVERLAY_BACKDROP,
            }}
            title={`${label} (${shortcut})`}
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
            {label}
          </button>
        );
      })}

      {/* Divider */}
      <div
        className="w-px h-6 mx-0.5 shrink-0"
        style={{ backgroundColor: "rgba(60, 60, 100, 0.5)" }}
      />

      {/* Background color picker */}
      <div
        className="flex items-center gap-2.5 px-5 py-3 rounded-xl shrink-0"
        style={{
          backgroundColor: OVERLAY_BG,
          border: OVERLAY_BORDER,
          backdropFilter: OVERLAY_BACKDROP,
        }}
      >
        {BG_MODES.map(({ mode, color }) => (
          <button
            key={mode}
            onClick={() => onBgModeChange(mode)}
            className="w-5 h-5 rounded-full cursor-pointer transition-transform hover:scale-110"
            style={{
              backgroundColor: color,
              outline: bgMode === mode ? "2px solid #e94560" : "2px solid rgba(60, 60, 100, 0.4)",
              outlineOffset: "1px",
            }}
            title={mode}
          />
        ))}
      </div>
    </div>
  );
}
