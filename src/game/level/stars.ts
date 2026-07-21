/**
 * Star rating for a completed run. Finishing always earns 1 star; pace against the level's par
 * earns the rest — but 3 stars additionally REQUIRES a damage-free run (any crash caps the run
 * at 2). Levels without a par (custom editor levels) still get the single finish star.
 */
export const MAX_STARS = 3;

export function starsForRun(args: {
  elapsedSeconds: number;
  parSeconds?: number;
  /** Accumulated crash-damage points for the run (see vehicle/damage.ts); 0 = clean. */
  damage?: number;
}): number {
  const { elapsedSeconds, parSeconds, damage } = args;
  if (parSeconds === undefined) return 1;
  const byTime = elapsedSeconds <= parSeconds ? 3 : elapsedSeconds <= 1.5 * parSeconds ? 2 : 1;
  return (damage ?? 0) > 0 ? Math.min(byTime, 2) : byTime;
}
