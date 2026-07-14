export type Metres = number & { readonly __brand: "Metres" };
export type Seconds = number & { readonly __brand: "Seconds" };
/** Signed speed; negative means reverse. */
export type MPerS = number & { readonly __brand: "MPerS" };

export function metres(value: number): Metres {
  return value as Metres;
}

export function seconds(value: number): Seconds {
  return value as Seconds;
}

export function mPerS(value: number): MPerS {
  return value as MPerS;
}
