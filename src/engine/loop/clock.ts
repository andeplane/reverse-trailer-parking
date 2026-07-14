/** Monotonic clock in milliseconds; production code injects this instead of calling performance.now() directly. */
export interface Clock {
  now(): number;
}

export const performanceClock: Clock = {
  now: () => performance.now(),
};
