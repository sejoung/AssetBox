/** Shared overlay styling constants for all floating UI elements.
 *  High opacity + blur ensures readability on any background color. */

export const OVERLAY_BG = "var(--overlay-bg)";
export const OVERLAY_BORDER = "1px solid var(--border)";
export const OVERLAY_BACKDROP = "blur(20px)";

export type BgMode = "dark" | "light" | "neutral";

export const BG_COLORS: Record<BgMode, string> = {
  dark: "#171c26",
  neutral: "#404040",
  light: "#d0d0d0",
};
