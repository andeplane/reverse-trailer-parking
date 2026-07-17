import { describe, expect, it } from "vitest";
import * as engine from "./index";

describe("engine barrel", () => {
  it("re-exports the public runtime helpers", () => {
    expect(typeof engine.normaliseAngle).toBe("function");
    expect(typeof engine.clamp).toBe("function");
    expect(typeof engine.vec2).toBe("function");
    expect(typeof engine.obbOverlap).toBe("function");
    expect(typeof engine.createFixedStepLoop).toBe("function");
    expect(typeof engine.performanceClock.now).toBe("function");
    expect(typeof engine.clampControlInput).toBe("function");
  });

  it("the re-exported helpers behave like the originals", () => {
    expect(engine.clamp(5, 0, 3)).toBe(3);
    expect(engine.vec2(1, 2)).toEqual({ x: 1, y: 2 });
  });
});
