export interface WinOverlay {
  dispose(): void;
}

/**
 * A "level complete" overlay with Retry / Menu (and Next, when a next level exists). Pure DOM.
 */
export function createWinOverlay(args: {
  parent: HTMLElement;
  levelName: string;
  /** Stars earned this run (0–3); omitted for levels that don't track stars. */
  stars?: number;
  /** Pre-formatted run time line, e.g. "Time 0:42 · par 1:30". */
  timeText?: string;
  /** True when there is no next level — celebrate finishing the list. */
  isLastLevel?: boolean;
  onNext?: () => void;
  /** Label for the Next button (default "Next ▸"; random levels use "Play another ▸"). */
  nextLabel?: string;
  onRetry: () => void;
  onMenu: () => void;
}): WinOverlay {
  const { parent, levelName, stars, timeText, isLastLevel, onNext, onRetry, onMenu } = args;

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
  if (stars !== undefined) {
    const row = document.createElement("div");
    row.className = "win-stars";
    for (let i = 0; i < 3; i++) {
      const star = document.createElement("span");
      star.className = i < stars ? "win-star earned" : "win-star";
      star.textContent = "★";
      row.appendChild(star);
    }
    panel.appendChild(row);
    if (stars < 3) {
      const hint = document.createElement("p");
      hint.className = "win-star-hint";
      hint.textContent = "Beat par without a scratch for 3 stars";
      panel.appendChild(hint);
    }
  }
  if (timeText) {
    const time = document.createElement("p");
    time.className = "win-time";
    time.textContent = timeText;
    panel.appendChild(time);
  }
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

  if (onNext) addButton(args.nextLabel ?? "Next ▸", "win-next", onNext);
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
