import type { Vec2 } from "../../engine/math/vec2";
import type { ExitLine, Level, LevelCar, LevelProp, PropKind } from "./level-types";

class ParseError extends RangeError {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function num(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ParseError(`${where}: expected a finite number`);
  return v;
}
function str(v: unknown, where: string): string {
  if (typeof v !== "string") throw new ParseError(`${where}: expected a string`);
  return v;
}
function vec2(v: unknown, where: string): Vec2 {
  if (!isObject(v)) throw new ParseError(`${where}: expected {x,y}`);
  return { x: num(v.x, `${where}.x`), y: num(v.y, `${where}.y`) };
}

function parseCar(v: unknown, where: string): LevelCar {
  if (!isObject(v)) throw new ParseError(`${where}: expected an object`);
  const car: LevelCar = {
    variantId: str(v.variantId, `${where}.variantId`),
    position: vec2(v.position, `${where}.position`),
    heading: num(v.heading, `${where}.heading`),
  };
  if (v.trailerVariantId !== undefined) car.trailerVariantId = str(v.trailerVariantId, `${where}.trailerVariantId`);
  return car;
}

function parseProp(v: unknown, where: string): LevelProp {
  if (!isObject(v)) throw new ParseError(`${where}: expected an object`);
  if (!isObject(v.size)) throw new ParseError(`${where}.size: expected {width,length}`);
  return {
    kind: str(v.kind, `${where}.kind`) as PropKind,
    position: vec2(v.position, `${where}.position`),
    rotation: num(v.rotation, `${where}.rotation`),
    size: { width: num(v.size.width, `${where}.size.width`), length: num(v.size.length, `${where}.size.length`) },
  };
}

function parseExit(v: unknown): ExitLine {
  if (!isObject(v)) throw new ParseError("exit: expected an object");
  return { a: vec2(v.a, "exit.a"), b: vec2(v.b, "exit.b"), outward: vec2(v.outward, "exit.outward") };
}

/** Parses untrusted JSON data into a structurally-valid `Level` (semantic checks live in validateLevel). */
export function parseLevel(data: unknown): Level {
  if (!isObject(data)) throw new ParseError("level: expected an object");
  if (!isObject(data.size)) throw new ParseError("level.size: expected {width,height}");
  if (!Array.isArray(data.placedCars)) throw new ParseError("level.placedCars: expected an array");
  if (!Array.isArray(data.props)) throw new ParseError("level.props: expected an array");
  const level: Level = {
    id: str(data.id, "level.id"),
    name: str(data.name, "level.name"),
    size: { width: num(data.size.width, "level.size.width"), height: num(data.size.height, "level.size.height") },
    drivable: parseCar(data.drivable, "level.drivable"),
    placedCars: data.placedCars.map((c, i) => parseCar(c, `level.placedCars[${i}]`)),
    props: data.props.map((p, i) => parseProp(p, `level.props[${i}]`)),
    exit: parseExit(data.exit),
  };
  if (data.parSeconds !== undefined) level.parSeconds = num(data.parSeconds, "level.parSeconds");
  return level;
}

export function parseLevels(data: unknown): Level[] {
  if (!Array.isArray(data)) throw new ParseError("levels: expected an array");
  return data.map((d) => parseLevel(d));
}

export function parseLevelsJson(text: string): Level[] {
  return parseLevels(JSON.parse(text));
}

export function serializeLevel(level: Level): string {
  return JSON.stringify(level, null, 2);
}

export function serializeLevels(levels: Level[]): string {
  return JSON.stringify(levels, null, 2);
}
