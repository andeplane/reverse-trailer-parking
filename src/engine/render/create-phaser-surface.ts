import Phaser from "phaser";
import type { Footprint, PhaserSurface, RectSpec } from "./phaser-surface";

/** World units are metres; positions/sizes are scaled to pixels by this factor. */
const PIXELS_PER_METRE = 32;

/**
 * Sprite art is authored nose-up (forward = image top). Our heading convention is 0 rad = +x with
 * +y up (maths). The screen is +y down, so we flip y and map heading θ to a Phaser (clockwise)
 * rotation of `π/2 − θ` for sprites, and `−θ` for +x-forward rectangles.
 */
const SPRITE_ROTATION_OFFSET = Math.PI / 2;

interface Placed {
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  rotationOffset: number;
}

export function createPhaserSurface(args: {
  parent: HTMLElement;
  textures: Record<string, string>;
  background?: { texture: string; widthMetres: number; heightMetres: number };
}): Promise<PhaserSurface> {
  const { parent, textures, background } = args;

  return new Promise<PhaserSurface>((resolve) => {
    const placed = new Map<string, Placed>();
    let scene: Phaser.Scene | undefined;

    function onSceneReady(readyScene: Phaser.Scene): void {
      scene = readyScene;
      readyScene.cameras.main.setBackgroundColor("#1b3a1e");
      if (background) {
        const bg = readyScene.add.image(0, 0, background.texture);
        bg.setDisplaySize(background.widthMetres * PIXELS_PER_METRE, background.heightMetres * PIXELS_PER_METRE);
        bg.setDepth(-1000);
      }
      resolve(surface);
    }

    class WorldScene extends Phaser.Scene {
      constructor() {
        super("world");
      }
      preload(): void {
        for (const [key, url] of Object.entries(textures)) this.load.image(key, url);
      }
      create(): void {
        onSceneReady(this);
      }
    }

    function drawRect(g: Phaser.GameObjects.Graphics, spec: RectSpec): void {
      const forwardPx = spec.length * PIXELS_PER_METRE;
      const sidePx = spec.width * PIXELS_PER_METRE;
      const radius = Math.min(spec.cornerRadius * PIXELS_PER_METRE, forwardPx / 2, sidePx / 2);
      g.fillStyle(spec.fillColor, 1);
      g.fillRoundedRect(-forwardPx / 2, -sidePx / 2, forwardPx, sidePx, radius);
      if (spec.strokeWidth > 0) {
        g.lineStyle(spec.strokeWidth * PIXELS_PER_METRE, spec.strokeColor, 1);
        g.strokeRoundedRect(-forwardPx / 2, -sidePx / 2, forwardPx, sidePx, radius);
      }
    }

    const surface: PhaserSurface = {
      addSprite(id: string, texture: string, footprint: Footprint): void {
        if (!scene) return;
        const sprite = scene.add.sprite(0, 0, texture);
        // Nose-up art: image width → side extent, image height → nose-tail extent.
        sprite.setDisplaySize(footprint.width * PIXELS_PER_METRE, footprint.length * PIXELS_PER_METRE);
        placed.set(id, { obj: sprite, rotationOffset: SPRITE_ROTATION_OFFSET });
      },
      addRect(id: string, spec: RectSpec): void {
        if (!scene) return;
        const g = scene.add.graphics();
        drawRect(g, spec);
        placed.set(id, { obj: g, rotationOffset: 0 });
      },
      setTransform(id: string, x: number, y: number, rotation: number): void {
        const item = placed.get(id);
        if (!item) return;
        item.obj.setPosition(x * PIXELS_PER_METRE, -y * PIXELS_PER_METRE);
        item.obj.setRotation(-rotation + item.rotationOffset);
      },
      remove(id: string): void {
        placed.get(id)?.obj.destroy();
        placed.delete(id);
      },
      centerCamera(x: number, y: number): void {
        scene?.cameras.main.centerOn(x * PIXELS_PER_METRE, -y * PIXELS_PER_METRE);
      },
    };

    new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth,
        height: window.innerHeight,
      },
      scene: [WorldScene],
    });
  });
}
