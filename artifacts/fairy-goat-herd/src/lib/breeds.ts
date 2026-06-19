/**
 * The master catalog of goat breeds the app knows about. Each farm chooses
 * which of these actually exist on their farm (see farm settings), but this is
 * the universe of selectable breeds. The list is ordered alphabetically by
 * display label so any UI that iterates it renders in alphabetical order.
 */
export const BREED_CATALOG = [
  { slug: "alpine", label: "Alpine" },
  { slug: "angora", label: "Angora" },
  { slug: "boer", label: "Boer" },
  { slug: "guernsey", label: "Guernsey" },
  { slug: "kiko", label: "Kiko" },
  { slug: "lamancha", label: "LaMancha" },
  { slug: "mixed", label: "Mixed" },
  { slug: "myotonic", label: "Myotonic" },
  { slug: "nigerian-dwarf", label: "Nigerian Dwarf" },
  { slug: "nubian", label: "Nubian" },
  { slug: "oberhasli", label: "Oberhasli" },
  { slug: "pygmy", label: "Pygmy" },
  { slug: "recorded-grade", label: "Recorded Grade" },
  { slug: "saanen", label: "Saanen" },
  { slug: "sable", label: "Sable" },
  { slug: "savanna", label: "Savanna" },
  { slug: "spanish", label: "Spanish" },
  { slug: "texmaster", label: "Texmaster" },
  { slug: "toggenburg", label: "Toggenburg" },
] as const;

export type BreedSlug = (typeof BREED_CATALOG)[number]["slug"];

/** All catalog slugs as a tuple, suitable for `z.enum(...)`. */
export const BREED_SLUGS = BREED_CATALOG.map((b) => b.slug) as [
  BreedSlug,
  ...BreedSlug[],
];

/** slug → display label for every catalog breed. */
export const breedLabels: Record<string, string> = Object.fromEntries(
  BREED_CATALOG.map((b) => [b.slug, b.label]),
);

/** The display label for a breed slug, falling back to the raw slug. */
export function breedLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return breedLabels[slug] ?? slug;
}

export interface BreedOption {
  slug: string;
  label: string;
}

/**
 * The breed options a farm should be able to pick from, in alphabetical order.
 *
 * - Falls back to the full catalog when the farm has no explicit selection
 *   (new farms or while settings are still loading).
 * - When `currentBreed` is supplied (e.g. editing a goat) it is always included
 *   even if the farm has since disabled that breed, so the goat's stored breed
 *   isn't silently lost from the picker.
 */
export function getBreedOptions(
  enabledBreeds: string[] | undefined | null,
  currentBreed?: string | null,
): BreedOption[] {
  const enabled =
    enabledBreeds && enabledBreeds.length > 0 ? enabledBreeds : BREED_SLUGS;
  const allowed = new Set<string>(enabled);
  if (currentBreed) allowed.add(currentBreed);

  const options: BreedOption[] = BREED_CATALOG.filter((b) =>
    allowed.has(b.slug),
  ).map((b) => ({ slug: b.slug, label: b.label }));

  // Preserve a stored breed that is somehow outside the catalog entirely.
  if (currentBreed && !BREED_CATALOG.some((b) => b.slug === currentBreed)) {
    options.push({ slug: currentBreed, label: breedLabel(currentBreed) });
  }

  return options;
}
