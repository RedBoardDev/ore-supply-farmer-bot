export interface LatencySnapshot {
  prepMs: number;
  prepP95Ms: number | null;
  execPerPlacementMs: number;
  execP95Ms: number | null;
}