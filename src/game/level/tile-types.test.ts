import { describe, expect, it } from "vitest";
import {
  cellCenter,
  filledGrid,
  gridHeight,
  gridWidth,
  inBounds,
  isSolidTile,
  tileAt,
  withTile,
  worldToCell,
} from "./tile-types";

describe("filledGrid", () => {
  it("makes a uniform grid of the requested size", () => {
    const g = filledGrid(3, 2, 5, "grass");
    expect(g.cells).toHaveLength(6);
    expect(g.cells.every((c) => c.type === "grass" && c.rot === 0)).toBe(true);
    expect(gridWidth(g)).toBe(15);
    expect(gridHeight(g)).toBe(10);
  });
});

describe("withTile / tileAt", () => {
  it("sets a single cell immutably", () => {
    const g = filledGrid(2, 2, 4);
    const g2 = withTile(g, 1, 0, { type: "curb", rot: 2 });
    expect(tileAt(g2, 1, 0)).toEqual({ type: "curb", rot: 2 });
    expect(tileAt(g, 1, 0)?.type).toBe("asphalt"); // original untouched
  });
  it("ignores out-of-range writes", () => {
    const g = filledGrid(2, 2, 4);
    expect(withTile(g, 5, 5, { type: "grass", rot: 0 })).toBe(g);
  });
});

describe("cellCenter / worldToCell round-trip", () => {
  const g = filledGrid(4, 4, 5); // 20 x 20, centre-origin
  it("maps a cell to its centre and back", () => {
    for (const [col, row] of [[0, 0], [3, 3], [1, 2], [2, 1]] as const) {
      const c = cellCenter(g, col, row);
      expect(worldToCell(g, c)).toEqual({ col, row });
    }
  });
  it("centre cell of an even grid straddles the origin corner", () => {
    // 4x4 grid of 5m: columns centres at -7.5,-2.5,2.5,7.5
    expect(cellCenter(g, 0, 0)).toEqual({ x: -7.5, y: 7.5 });
  });
  it("returns null for points outside the grid", () => {
    expect(worldToCell(g, { x: 100, y: 0 })).toBeNull();
    expect(inBounds(g, -1, 0)).toBe(false);
  });
});

describe("isSolidTile", () => {
  it("marks curb/hedge/tree solid and asphalt/grass/bay passable", () => {
    expect((["curb", "hedge", "tree"] as const).every(isSolidTile)).toBe(true);
    expect((["asphalt", "grass", "bay"] as const).some(isSolidTile)).toBe(false);
  });
});
