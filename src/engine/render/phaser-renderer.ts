import type { Vec2 } from "../math/vec2";
import type { Entity, Renderer } from "./renderer";
import type { PhaserSurface } from "./phaser-surface";

/** A signature of an entity's visual + size; if it changes, the drawn item must be recreated. */
function visualKey(entity: Entity): string {
  const s = entity.size;
  if (entity.visual.kind === "sprite") return `sprite:${entity.visual.texture}:${s.width}:${s.length}`;
  const st = entity.visual.style;
  return `rect:${st.fillColor}:${st.strokeColor}:${st.strokeWidth}:${st.cornerRadius}:${st.fillAlpha ?? 1}:${s.width}:${s.length}`;
}

export function createPhaserRenderer(args: { surface: PhaserSurface }): Renderer {
  const { surface } = args;
  const live = new Map<string, string>(); // id → visualKey

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

      for (const id of live.keys()) {
        if (!nextIds.has(id)) {
          surface.remove(id);
          live.delete(id);
        }
      }

      entities.forEach((entity, index) => {
        const key = visualKey(entity);
        const current = live.get(entity.id);
        if (current !== key) {
          // New, or its texture/style/size changed — (re)create the drawn item.
          if (current !== undefined) surface.remove(entity.id);
          create(entity);
          live.set(entity.id, key);
        }
        // Depth = position in the entity list, so z-order stays correct even after a recreate.
        surface.setTransform(entity.id, entity.position.x, entity.position.y, entity.rotation, index);
      });
    },

    follow(target: Vec2): void {
      surface.centerCamera(target.x, target.y);
    },

    setCamera(center: Vec2, zoom: number): void {
      surface.setCamera(center.x, center.y, zoom);
    },

    screenToWorld(clientX: number, clientY: number): Vec2 {
      return surface.clientToWorld(clientX, clientY);
    },

    worldToScreen(p: Vec2): { x: number; y: number } {
      return surface.worldToClient(p.x, p.y);
    },

    dispose(): void {
      for (const id of live.keys()) surface.remove(id);
      live.clear();
    },
  };
}
