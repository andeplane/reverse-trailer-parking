import { describe, expect, it } from "vitest";
import {
  bayLineEdges,
  bayMarkedSides,
  cellCenter,
  curbAt,
  curbRuns,
  edgeSegment,
  filledGrid,
  gridHeight,
  gridWidth,
  inBounds,
  isSolidTile,
  nearestEdge,
  resizeGrid,
  tileAt,
  withCurb,
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
    const g2 = withTile(g, 1, 0, { type: "hedge", rot: 2 });
    expect(tileAt(g2, 1, 0)).toEqual({ type: "hedge", rot: 2 });
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
  it("marks hedge/tree solid and asphalt/grass/bay passable", () => {
    expect((["hedge", "tree"] as const).every(isSolidTile)).toBe(true);
    expect((["asphalt", "grass", "bay", "bay-open"] as const).some(isSolidTile)).toBe(false);
  });
});

describe("edge curbs", () => {
  it("sets and reads an edge curb immutably", () => {
    const g = filledGrid(3, 2, 4);
    const e = { o: "h", col: 1, row: 1 } as const;
    const g2 = withCurb(g, e, true);
    expect(curbAt(g2, e)).toBe(true);
    expect(curbAt(g, e)).toBe(false);
    expect(withCurb(g, { o: "v", col: 9, row: 0 }, true)).toBe(g); // out of range ignored
  });

  it("maps an edge to its world segment", () => {
    const g = filledGrid(4, 4, 5); // 20x20 centre-origin
    expect(edgeSegment(g, { o: "h", col: 0, row: 0 })).toEqual({ a: { x: -10, y: 10 }, b: { x: -5, y: 10 } });
    expect(edgeSegment(g, { o: "v", col: 4, row: 3 })).toEqual({ a: { x: 10, y: -5 }, b: { x: 10, y: -10 } });
  });

  it("finds the nearest edge to a world point", () => {
    const g = filledGrid(4, 4, 5);
    // Just below the top-left cell's top edge, nearer to it than to any vertical line.
    expect(nearestEdge(g, { x: -7.5, y: 9.6 })).toEqual({ o: "h", col: 0, row: 0 });
    // Near the vertical line between cols 1 and 2, mid-row 2.
    expect(nearestEdge(g, { x: -0.2, y: -2.5 })).toEqual({ o: "v", col: 2, row: 2 });
    expect(nearestEdge(g, { x: 100, y: 0 })).toBeNull();
  });

  it("merges consecutive curbed edges into straight runs", () => {
    let g = filledGrid(4, 4, 5);
    g = withCurb(g, { o: "h", col: 1, row: 2 }, true);
    g = withCurb(g, { o: "h", col: 2, row: 2 }, true);
    g = withCurb(g, { o: "v", col: 1, row: 2 }, true);
    const runs = curbRuns(g);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ a: { x: -5, y: 0 }, b: { x: 5, y: 0 } }); // two edges merged
  });
});

describe("resizeGrid", () => {
  it("preserves overlapping tiles and curbs, fills new cells with asphalt", () => {
    let g = filledGrid(3, 3, 4, "grass");
    g = withCurb(g, { o: "v", col: 1, row: 1 }, true);
    const bigger = resizeGrid(g, 5, 4);
    expect(bigger.cols).toBe(5);
    expect(tileAt(bigger, 1, 1)?.type).toBe("grass");
    expect(tileAt(bigger, 4, 3)?.type).toBe("asphalt");
    expect(curbAt(bigger, { o: "v", col: 1, row: 1 })).toBe(true);
    const smaller = resizeGrid(g, 2, 2);
    expect(smaller.cells).toHaveLength(4);
    expect(curbAt(smaller, { o: "v", col: 1, row: 1 })).toBe(true);
  });
});

describe("bay line markings", () => {
  it("marks all sides but the opening for a closed bay, and both flanks for an open bay", () => {
    expect(bayMarkedSides("bay", 0).sort()).toEqual(["E", "N", "W"]); // rot 0 opens south
    expect(bayMarkedSides("bay", 2).sort()).toEqual(["E", "S", "W"]); // rot 2 opens north
    expect(bayMarkedSides("bay-open", 0).sort()).toEqual(["E", "W"]);
    expect(bayMarkedSides("bay-open", 1).sort()).toEqual(["N", "S"]);
    expect(bayMarkedSides("asphalt", 0)).toEqual([]);
  });

  it("deduplicates the shared line between adjacent bays", () => {
    let g = filledGrid(3, 1, 4);
    g = withTile(g, 0, 0, { type: "bay", rot: 0 });
    g = withTile(g, 1, 0, { type: "bay", rot: 0 });
    // Each bay wants N,E,W → 6 edges, but the line between cols 0 and 1 is shared.
    expect(bayLineEdges(g)).toHaveLength(5);
  });
});
