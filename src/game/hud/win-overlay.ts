export interface WinOverlay {
  dispose(): void;
}

/**
 * A "level complete" overlay with Retry / Menu (and Next, when a next level exists). Pure DOM.
 */
export function createWinOverlay(args: {
  parent: HTMLElement;
  levelName: string;
  /** True when there is no next level — celebrate finishing the list. */
  isLastLevel?: boolean;
  onNext?: () => void;
  onRetry: () => void;
  onMenu: () => void;
}): WinOverlay {
  const { parent, levelName, isLastLevel, onNext, onRetry, onMenu } = args;

  const root = document.createElement("div");
  root.className = "win-overlay";

  const panel = document.createElement("div");
  panel.className = "win-panel";

  const title = document.createElement("h2");
  title.className = "win-title";
  title.textContent = "Level complete!";
  const subtitle = document.createElement("p");
  subtitle.className = "win-subtitle";
  subtitle.textContent = levelName;
  panel.append(title, subtitle);
  if (isLastLevel) {
    const finished = document.createElement("p");
    finished.className = "win-finished";
    finished.textContent = "You finished every level! 🎉";
    panel.appendChild(finished);
  }

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

  if (onNext) addButton("Next ▸", "win-next", onNext);
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
