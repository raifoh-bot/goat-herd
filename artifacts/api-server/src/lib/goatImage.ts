// Resolve a goat's default photo: use `imageUrls[defaultPhotoIndex]` when the
// stored index is a valid position, otherwise fall back to the newest photo
// (last entry). Populates the deprecated `imageUrl` alias so older clients and
// the herd-list cards keep working without changes.
export function withImageAlias<
  T extends { imageUrls?: string[] | null; defaultPhotoIndex?: number | null },
>(goat: T): T & { imageUrl: string | null } {
  const urls = goat.imageUrls ?? [];
  const index = goat.defaultPhotoIndex;
  const resolved =
    index != null && index >= 0 && index < urls.length
      ? urls[index]
      : urls[urls.length - 1];
  return { ...goat, imageUrl: resolved ?? null };
}
