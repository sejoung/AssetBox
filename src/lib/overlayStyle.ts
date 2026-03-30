/** Shared overlay styling constants for all floating UI elements.
 *  High opacity + blur ensures readability on any background color. */

export const OVERLAY_BG = "rgba(16, 24, 48, 0.94)";
export const OVERLAY_BORDER = "1px solid rgba(60, 60, 100, 0.5)";
export const OVERLAY_BACKDROP = "blur(20px)";

export type BgMode = "dark" | "light" | "neutral";

export const BG_COLORS: Record<BgMode, string> = {
  dark: "#1a1a2e",
  neutral: "#404040",
  light: "#d0d0d0",
};
