import { BG_COLORS, type BgMode } from "../lib/overlayStyle";

export type ViewMode = "default" | "wireframe" | "normals" | "normalmap" | "uv" | "retopo";

interface ViewerToolbarProps {
  viewMode: ViewMode;
  bgMode: BgMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBgModeChange: (mode: BgMode) => void;
  hasModel: boolean;
  onFocusModel?: () => void;
  gridVisible?: boolean;
  gridDisabled?: boolean;
  onGridChange?: (visible: boolean) => void;
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
  {
    mode: "retopo",
    label: "Retopo",
    shortcut: "6",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z",
  },
];

const BG_MODES: { mode: BgMode; color: string }[] = [
  { mode: "dark", color: BG_COLORS.dark },
  { mode: "neutral", color: BG_COLORS.neutral },
  { mode: "light", color: BG_COLORS.light },
];

export function ViewerToolbar({
  viewMode,
  bgMode,
  onViewModeChange,
  onBgModeChange,
  hasModel,
  onFocusModel,
  gridVisible = false,
  gridDisabled = false,
  onGridChange,
}: ViewerToolbarProps) {
  if (!hasModel) return null;
  return (
    <div className="viewer-toolbar" aria-label="Preview controls">
      <div className="view-modes" role="group" aria-label="View mode">
        {VIEW_MODES.map(({ mode, label, shortcut, icon }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className="view-mode"
            aria-pressed={viewMode === mode}
            title={`${label} (${shortcut})`}
          >
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
            {label}
            <kbd>{shortcut}</kbd>
          </button>
        ))}
      </div>
      <div className="viewer-utilities">
        {onFocusModel && (
          <button className="ui-button" onClick={onFocusModel} title="Fit model to view (F)">
            Fit model <kbd>F</kbd>
          </button>
        )}
        {onGridChange && (
          <button
            className="ui-button"
            aria-pressed={gridVisible}
            disabled={gridDisabled}
            onClick={() => onGridChange(!gridVisible)}
            title={
              gridDisabled ? "Grid is hidden while inspecting a finding" : "Toggle reference grid"
            }
          >
            Grid
          </button>
        )}
        <div className="background-picker" role="group" aria-label="Background color">
          <span>Background</span>
          {BG_MODES.map(({ mode, color }) => (
            <button
              key={mode}
              className="background-swatch"
              onClick={() => onBgModeChange(mode)}
              aria-label={`${mode} background`}
              aria-pressed={bgMode === mode}
              title={mode}
            >
              <span style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
        <span className="navigation-hint">Drag to orbit · Scroll to zoom</span>
      </div>
    </div>
  );
}
