export interface LoseOverlay {
  dispose(): void;
}

/**
 * A "rig wrecked" overlay with Retry / Menu, shown when crash damage depletes the health pool.
 * Pure DOM (in-app UI, never a native popup); shares the win overlay's panel styling.
 */
export function createLoseOverlay(args: {
  parent: HTMLElement;
  levelName: string;
  onRetry: () => void;
  onMenu: () => void;
}): LoseOverlay {
  const { parent, levelName, onRetry, onMenu } = args;

  const root = document.createElement("div");
  root.className = "win-overlay lose-overlay";

  const panel = document.createElement("div");
  panel.className = "win-panel";

  const title = document.createElement("h2");
  title.className = "win-title lose-title";
  title.textContent = "Wrecked! 💥";
  const subtitle = document.createElement("p");
  subtitle.className = "win-subtitle";
  subtitle.textContent = `Too much damage — ${levelName}`;
  panel.append(title, subtitle);

  const buttons = document.createElement("div");
  buttons.className = "win-buttons";

  function addButton(label: string, className: string, onClick: () => void): void {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.addEventListener("click", onClick);
    buttons.appendChild(b);
  }

  addButton("Retry", "win-retry", onRetry);
  addButton("Menu", "win-menu", onMenu);
  panel.appendChild(buttons);
  root.appendChild(panel);
  parent.appendChild(root);

  return {
    dispose(): void {
      root.remove();
    },
  };
}
