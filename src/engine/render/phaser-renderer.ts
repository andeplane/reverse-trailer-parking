import type { Vec2 } from "../math/vec2";
import type { Entity, Renderer } from "./renderer";
import type { PhaserSurface } from "./phaser-surface";

export function createPhaserRenderer(args: { surface: PhaserSurface }): Renderer {
  const { surface } = args;
  const liveIds = new Set<string>();

  function create(entity: Entity): void {
    if (entity.visual.kind === "sprite") {
      surface.addSprite(entity.id, entity.visual.texture, {
        width: entity.size.width,
        length: entity.size.length,
      });
    } else {
      surface.addRect(entity.id, {
        width: entity.size.width,
        length: entity.size.length,
        fillColor: entity.visual.style.fillColor,
        strokeColor: entity.visual.style.strokeColor,
        strokeWidth: entity.visual.style.strokeWidth,
        cornerRadius: entity.visual.style.cornerRadius,
        fillAlpha: entity.visual.style.fillAlpha ?? 1,
      });
    }
  }

  return {
    sync(entities: Entity[]): void {
      const nextIds = new Set(entities.map((e) => e.id));

      for (const id of liveIds) {
        if (!nextIds.has(id)) {
          surface.remove(id);
          liveIds.delete(id);
        }
      }

      for (const entity of entities) {
        if (!liveIds.has(entity.id)) {
          create(entity);
          liveIds.add(entity.id);
        }
        surface.setTransform(entity.id, entity.position.x, entity.position.y, entity.rotation);
      }
    },

    follow(target: Vec2): void {
      surface.centerCamera(target.x, target.y);
    },

    dispose(): void {
      for (const id of liveIds) surface.remove(id);
      liveIds.clear();
    },
  };
}
