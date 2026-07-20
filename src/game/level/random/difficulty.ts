/**
 * Difficulty knobs for random level generation. See `specs/003-random-levels/design.md` for the
 * rationale behind each number (grid size, exit gap, corridor margins, pinch points, floors).
 */
export type Difficulty = "easy" | "medium" | "hard";

export const ALL_DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export function isDifficulty(value: string): value is Difficulty {
  return (ALL_DIFFICULTIES as readonly string[]).includes(value);
}

export interface DifficultyParams {
  cols: number;
  rows: number;
  /** Width of the opening in the boundary wall, metres. */
  exitGapWidth: number;
  waypointsMin: number;
  waypointsMax: number;
  /** Upper bound on the heading change per waypoint segment, radians (feasibility-capped too). */
  maxTurn: number;
  /** Corridor clearance around the swept solution path, metres (tapers near the player start). */
  baseMargin: number;
  /** Extra inflation of the CAR's swept footprint — forward-shunt room for recoveries, metres. */
  carCorrectionAllowance: number;
  /** Pinch points (tight squeezes along the corridor) the level must contain. */
  requiredPinches: number;
  /** Minimum solution-path arc length, metres. */
  minArcLength: number;
  /** Minimum straight-line distance from the player start to the exit, metres. */
  minStartExitDistance: number;
  /** Extra straight driven after the rig is fully inside the lot, metres. */
  extraStraight: number;
  islandsMin: number;
  islandsMax: number;
  looseCarsMin: number;
  looseCarsMax: number;
}

const DEG = Math.PI / 180;

const PARAMS: Record<Difficulty, DifficultyParams> = {
  easy: {
    cols: 13,
    rows: 15,
    exitGapWidth: 7.5,
    waypointsMin: 1,
    waypointsMax: 2,
    maxTurn: 35 * DEG,
    baseMargin: 2.0,
    carCorrectionAllowance: 0,
    requiredPinches: 0,
    minArcLength: 15,
    minStartExitDistance: 10,
    extraStraight: 4,
    islandsMin: 1,
    islandsMax: 2,
    looseCarsMin: 0,
    looseCarsMax: 0,
  },
  medium: {
    cols: 14,
    rows: 16,
    exitGapWidth: 6.0,
    waypointsMin: 2,
    waypointsMax: 3,
    maxTurn: 70 * DEG,
    baseMargin: 1.3,
    carCorrectionAllowance: 0.2,
    requiredPinches: 2,
    minArcLength: 25,
    minStartExitDistance: 14,
    extraStraight: 1,
    islandsMin: 1,
    islandsMax: 2,
    looseCarsMin: 0,
    looseCarsMax: 1,
  },
  hard: {
    cols: 16,
    rows: 19,
    exitGapWidth: 5.0,
    waypointsMin: 3,
    waypointsMax: 5,
    maxTurn: 100 * DEG,
    baseMargin: 1.0,
    carCorrectionAllowance: 0.4,
    requiredPinches: 3,
    minArcLength: 35,
    minStartExitDistance: 18,
    extraStraight: 0,
    islandsMin: 2,
    islandsMax: 3,
    looseCarsMin: 1,
    looseCarsMax: 3,
  },
};

export function difficultyParams(difficulty: Difficulty): DifficultyParams {
  return PARAMS[difficulty];
}

/** The corridor margin tapers down to this near the player start so flanking cars fit. */
export const START_TAPER_MARGIN = 0.3;
/** Arc-length window (from the player start) over which the margin tapers, metres. */
export const START_TAPER_ARC = 12;

/** Local clearance margin at a point `distFromStart` metres of arc from the player start. */
export function localMargin(args: { baseMargin: number; distFromStart: number }): number {
  const { baseMargin, distFromStart } = args;
  const t = Math.min(1, Math.max(0, distFromStart / START_TAPER_ARC));
  return START_TAPER_MARGIN + (baseMargin - START_TAPER_MARGIN) * t;
}
