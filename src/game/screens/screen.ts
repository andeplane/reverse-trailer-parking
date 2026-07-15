/** A screen owns a slice of the app lifecycle: it renders/updates each frame and cleans up. */
export interface Screen {
  tick(frameMs?: number): void;
  dispose(): void;
}
