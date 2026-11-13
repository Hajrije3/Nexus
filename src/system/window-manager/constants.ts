/** Height of the global menu bar at the top of the screen. */
export const MENU_BAR_HEIGHT = 30;
/** Vertical space reserved for the dock at the bottom of the screen. */
export const DOCK_RESERVED_HEIGHT = 84;
/** Height of a window's title bar. */
export const TITLE_BAR_HEIGHT = 40;

/** Minimum horizontal strip of a window that must stay on screen. */
export const MIN_VISIBLE_PX = 96;
/** Distance from a work-area edge at which a drag offers a snap zone. */
export const SNAP_EDGE_THRESHOLD = 12;
/** Offset between successively opened windows. */
export const CASCADE_STEP = 28;
/** Gap kept around maximised and tiled windows. */
export const TILE_GAP = 6;

/** Base z-index for the window layer; desktop chrome sits above WINDOW_Z_CEILING. */
export const WINDOW_Z_BASE = 100;
export const WINDOW_Z_CEILING = 5_000;

export const DEFAULT_MIN_SIZE = { width: 320, height: 200 } as const;
