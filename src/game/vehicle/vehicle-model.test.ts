import { describe, expect, it } from "vitest";
import type { Radians } from "../../engine/math/angles";
import type { MPerS, Seconds } from "../../engine/math/units";
import type { ControlInput } from "../../engine/input/input-source";
import { deriveCarGeometry, deriveTrailerGeometry } from "./vehicle-geometry";
import { caravanTrailerVariant, createVariantCatalog, sedanCarVariant } from "./variants";
import type { CarState, Rig, TrailerState } from "./vehicle-types";
import { stepRig } from "./vehicle-model";

const catalog = createVariantCatalog();
const DT = 1 / 60;

function restCar(overrides: Partial<CarState> = {}): CarState {
  return {
    variantId: "sedan",
    role: "drivable",
    rearAxle: { x: 0, y: 0 },
    heading: 0 as Radians,
    speed: 0 as MPerS,
    steer: 0 as Radians,
    trailer: null,
    ...overrides,
  };
}

function inLineTrailer(): TrailerState {
  return { variantId: "caravan", heading: 0 as Radians };
}

function noInput(): ControlInput {
  return { throttle: 0, steer: 0 };
}

function runSteps(rig: Rig, input: ControlInput, steps: number): Rig {
  let current = rig;
  for (let i = 0; i < steps; i++) {
    current = stepRig({ rig: current, input, dt: DT as Seconds, catalog });
  }
  return current;
}

function assertFinite(rig: Rig): void {
  expect(Number.isFinite(rig.car.rearAxle.x)).toBe(true);
  expect(Number.isFinite(rig.car.rearAxle.y)).toBe(true);
  expect(Number.isFinite(rig.car.heading)).toBe(true);
  expect(Number.isFinite(rig.car.speed)).toBe(true);
  expect(Number.isFinite(rig.car.steer)).toBe(true);
  if (rig.trailer) expect(Number.isFinite(rig.trailer.heading)).toBe(true);
}

describe("speed: accelerate / brake / reverse", () => {
  it("accelerates gradually, not teleporting to max speed", () => {
    const rig: Rig = { car: restCar(), trailer: null };
    const result = stepRig({ rig, input: { throttle: 1, steer: 0 }, dt: DT as Seconds, catalog });
    expect(result.car.speed).toBeCloseTo(sedanCarVariant.accel * DT);
    expect(result.car.speed).toBeLessThan(sedanCarVariant.maxSpeedForward);
  });

  it("clamps speed at maxSpeedForward under sustained throttle", () => {
    const rig: Rig = { car: restCar(), trailer: null };
    const result = runSteps(rig, { throttle: 1, steer: 0 }, 10_000);
    expect(result.car.speed).toBeCloseTo(sedanCarVariant.maxSpeedForward);
  });

  it("brakes to exactly 0 when throttle releases (no overshoot into reverse)", () => {
    const rig: Rig = { car: restCar({ speed: 0.05 as MPerS }), trailer: null };
    const result = stepRig({ rig, input: noInput(), dt: DT as Seconds, catalog });
    expect(result.car.speed).toBe(0);
  });

  it("brakes a large speed toward 0 gradually then snaps at exactly 0", () => {
    const rig: Rig = { car: restCar({ speed: sedanCarVariant.maxSpeedForward as MPerS }), trailer: null };
    const result = runSteps(rig, noInput(), 10_000);
    expect(result.car.speed).toBe(0);
  });

  it("is symmetric between forward and reverse acceleration", () => {
    const forward = runSteps({ car: restCar(), trailer: null }, { throttle: 1, steer: 0 }, 5);
    const reverse = runSteps({ car: restCar(), trailer: null }, { throttle: -1, steer: 0 }, 5);
    expect(reverse.car.speed).toBeCloseTo(-forward.car.speed);
  });

  it("clamps reverse speed at maxSpeedReverse", () => {
    const result = runSteps({ car: restCar(), trailer: null }, { throttle: -1, steer: 0 }, 10_000);
    expect(result.car.speed).toBeCloseTo(-sedanCarVariant.maxSpeedReverse);
  });
});

describe("steer: slew + clamp", () => {
  it("moves steer gradually toward the target, not instantly", () => {
    const rig: Rig = { car: restCar(), trailer: null };
    const result = stepRig({ rig, input: { throttle: 0, steer: 1 }, dt: DT as Seconds, catalog });
    expect(result.car.steer).toBeCloseTo(sedanCarVariant.steerRate * DT);
    expect(result.car.steer).toBeLessThan(sedanCarVariant.steerMax);
  });

  it("clamps steer at steerMax under a sustained full-lock input", () => {
    const result = runSteps({ car: restCar(), trailer: null }, { throttle: 0, steer: 1 }, 10_000);
    expect(result.car.steer).toBeCloseTo(sedanCarVariant.steerMax);
  });

  it("recentres steer toward 0 when steer input returns to 0", () => {
    const held = runSteps({ car: restCar(), trailer: null }, { throttle: 0, steer: 1 }, 100);
    const released = stepRig({ rig: held, input: noInput(), dt: DT as Seconds, catalog });
    expect(released.car.steer).toBeLessThan(held.car.steer);
  });
});

describe("stationary steering does not move the car (FR-010)", () => {
  it("keeps position and heading fixed while steering at v=0", () => {
    const rig: Rig = { car: restCar(), trailer: null };
    const result = runSteps(rig, { throttle: 0, steer: 1 }, 200);
    expect(result.car.rearAxle).toEqual({ x: 0, y: 0 });
    expect(result.car.heading).toBe(0);
  });
});

describe("car bicycle equation θ̇ = (v/L)·tan(δ)", () => {
  it("matches the analytic heading-rate for one step, using this step's post-update speed+steer", () => {
    const steerBefore = 0.2 as Radians;
    const speedBefore = 3 as MPerS;
    const rig: Rig = { car: restCar({ speed: speedBefore, steer: steerBefore }), trailer: null };
    // input.steer already equals the current steer/steerMax ⇒ no slew this step.
    const input: ControlInput = { throttle: 1, steer: steerBefore / sedanCarVariant.steerMax };
    const result = stepRig({ rig, input, dt: DT as Seconds, catalog });

    const expectedSpeed = speedBefore + 1 * sedanCarVariant.accel * DT;
    const { wheelbase } = deriveCarGeometry(sedanCarVariant);
    const expectedHeadingRate = (expectedSpeed / wheelbase) * Math.tan(steerBefore);

    expect(result.car.steer).toBeCloseTo(steerBefore, 10);
    expect(result.car.speed).toBeCloseTo(expectedSpeed, 10);
    expect(result.car.heading).toBeCloseTo(expectedHeadingRate * DT, 6);
  });

  it("moves the rear axle forward along the pre-step heading at the post-update speed", () => {
    const speedBefore = 2 as MPerS;
    const heading = 0.3 as Radians;
    const rig: Rig = { car: restCar({ speed: speedBefore, heading }), trailer: null };
    const input: ControlInput = { throttle: 1, steer: 0 };
    const result = stepRig({ rig, input, dt: DT as Seconds, catalog });
    const expectedSpeed = speedBefore + 1 * sedanCarVariant.accel * DT;
    expect(result.car.rearAxle.x).toBeCloseTo(expectedSpeed * Math.cos(heading) * DT);
    expect(result.car.rearAxle.y).toBeCloseTo(expectedSpeed * Math.sin(heading) * DT);
  });
});

describe("trailer articulation", () => {
  it("matches the analytic φ̇ formula for one step", () => {
    const speedBefore = 2 as MPerS;
    const steer = 0 as Radians;
    const heading = 0 as Radians;
    const trailerHeading = 0.4 as Radians;
    const rig: Rig = {
      car: restCar({ speed: speedBefore, steer, heading }),
      trailer: { variantId: "caravan", heading: trailerHeading },
    };
    const input: ControlInput = { throttle: 1, steer: 0 };
    const result = stepRig({ rig, input, dt: DT as Seconds, catalog });

    const expectedSpeed = speedBefore + 1 * sedanCarVariant.accel * DT;
    const { wheelbase, hitchOffset } = deriveCarGeometry(sedanCarVariant);
    const { trailerLength } = deriveTrailerGeometry(caravanTrailerVariant);
    const headingRate = (expectedSpeed / wheelbase) * Math.tan(steer);
    const psi0 = heading - trailerHeading;
    const trailerHeadingRate =
      (expectedSpeed / trailerLength) * Math.sin(psi0) - (hitchOffset / trailerLength) * headingRate * Math.cos(psi0);
    const expected = trailerHeading + trailerHeadingRate * DT;

    expect(result.trailer?.heading).toBeCloseTo(expected, 5);
  });

  it("settles the trailer in line behind the car when driving straight forward (FR-012)", () => {
    const misaligned: TrailerState = { variantId: "caravan", heading: 0.6 as Radians };
    const rig: Rig = { car: restCar({ trailer: misaligned }), trailer: misaligned };
    const result = runSteps(rig, { throttle: 1, steer: 0 }, 2000);
    expect(result.trailer).not.toBeNull();
    expect(Math.abs(result.car.heading - (result.trailer?.heading ?? 0))).toBeLessThan(0.01);
  });

  it("grows articulation then clamps at jackknifeMax when reversing with steer (FR-013/014)", () => {
    const rig: Rig = { car: restCar({ trailer: inLineTrailer() }), trailer: inLineTrailer() };
    const result = runSteps(rig, { throttle: -1, steer: 1 }, 3000);
    const rawPsi = (result.car.heading as number) - (result.trailer?.heading as number);
    const wrapped = Math.abs(Math.atan2(Math.sin(rawPsi), Math.cos(rawPsi)));
    expect(wrapped).toBeLessThanOrEqual(sedanCarVariant.jackknifeMax + 1e-6);
    expect(wrapped).toBeGreaterThan(sedanCarVariant.jackknifeMax - 0.05);
  });

  it("leaves trailer null through the no-trailer path", () => {
    const rig: Rig = { car: restCar(), trailer: null };
    const result = runSteps(rig, { throttle: 1, steer: 0.5 }, 50);
    expect(result.trailer).toBeNull();
    expect(result.car.trailer).toBeNull();
  });
});

describe("determinism", () => {
  it("produces identical output for identical (rig, input, dt) repeated", () => {
    const rig: Rig = { car: restCar({ trailer: inLineTrailer() }), trailer: inLineTrailer() };
    const a = stepRig({ rig, input: { throttle: 0.7, steer: -0.3 }, dt: DT as Seconds, catalog });
    const b = stepRig({ rig, input: { throttle: 0.7, steer: -0.3 }, dt: DT as Seconds, catalog });
    expect(a).toEqual(b);
  });

  it("produces identical trajectories for identical input scripts", () => {
    const script: ControlInput[] = [
      { throttle: 1, steer: 0 },
      { throttle: 1, steer: 0.5 },
      { throttle: -1, steer: -1 },
      { throttle: 0, steer: 0 },
    ];
    function run(): Rig {
      let rig: Rig = { car: restCar({ trailer: inLineTrailer() }), trailer: inLineTrailer() };
      for (const input of script) {
        for (let i = 0; i < 50; i++) {
          rig = stepRig({ rig, input, dt: DT as Seconds, catalog });
        }
      }
      return rig;
    }
    expect(run()).toEqual(run());
  });
});

describe("stability: no NaN/Infinity across a long varied script", () => {
  it("stays finite through forward/steer/reverse/jackknife/brake", () => {
    const script: ControlInput[] = [
      { throttle: 1, steer: 0 },
      { throttle: 1, steer: 1 },
      { throttle: -1, steer: -1 },
      { throttle: -1, steer: 1 },
      { throttle: 0, steer: 0 },
    ];
    let rig: Rig = { car: restCar({ trailer: inLineTrailer() }), trailer: inLineTrailer() };
    for (const input of script) {
      for (let i = 0; i < 400; i++) {
        rig = stepRig({ rig, input, dt: DT as Seconds, catalog });
        assertFinite(rig);
        expect(Math.abs(rig.car.steer)).toBeLessThanOrEqual(sedanCarVariant.steerMax + 1e-9);
        expect(rig.car.speed).toBeGreaterThanOrEqual(-sedanCarVariant.maxSpeedReverse - 1e-9);
        expect(rig.car.speed).toBeLessThanOrEqual(sedanCarVariant.maxSpeedForward + 1e-9);
        expect(rig.car.heading).toBeGreaterThan(-Math.PI - 1e-9);
        expect(rig.car.heading).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});
