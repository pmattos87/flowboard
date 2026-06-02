/** Palette used for auto-assigned identity colors (people avatars, project squares). */
export const IDENTITY_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6",
];

/** Picks a random color from {@link IDENTITY_COLORS}. */
export const randomIdentityColor = () =>
  IDENTITY_COLORS[Math.floor(Math.random() * IDENTITY_COLORS.length)];
