/** Vendored basemap sources (assets/geodata/, public domain). */
export const GEODATA_SOURCES: Record<string, string> = {
  'naturalearth/world-110m': 'ne_110m_world.json',
  'naturalearth/world-50m': 'ne_50m_world.json',
  'naturalearth/europe-110m': 'ne_110m_europe.json',
};

/** Default simplification per source, degrees (50m keeps its detail). */
export const GEODATA_TOLERANCE_DEGREES: Record<string, number> = {
  'naturalearth/world-50m': 0.05,
};
