// Spotify's published genre seed list (from /recommendations/available-genre-seeds
// before deprecation). Stable, curated vocabulary used as the base whitelist.
const STATIC_GENRES_RAW = [
  'acoustic', 'afrobeat', 'alt-rock', 'alternative', 'ambient', 'anime',
  'black-metal', 'bluegrass', 'blues', 'bossanova', 'brazil', 'breakbeat',
  'british', 'cantopop', 'chicago-house', 'children', 'chill', 'classical',
  'club', 'comedy', 'country', 'dance', 'dancehall', 'death-metal',
  'deep-house', 'detroit-techno', 'disco', 'disney', 'drum-and-bass', 'dub',
  'dubstep', 'edm', 'electro', 'electronic', 'emo', 'folk', 'forro', 'french',
  'funk', 'garage', 'german', 'gospel', 'goth', 'grindcore', 'groove',
  'grunge', 'guitar', 'happy', 'hard-rock', 'hardcore', 'hardstyle',
  'heavy-metal', 'hip-hop', 'holidays', 'honky-tonk', 'house', 'idm', 'indian',
  'indie', 'indie-pop', 'industrial', 'iranian', 'j-dance', 'j-idol', 'j-pop',
  'j-rock', 'jazz', 'k-pop', 'kids', 'latin', 'latino', 'malay', 'mandopop',
  'metal', 'metal-misc', 'metalcore', 'minimal-techno', 'movies', 'mpb',
  'new-age', 'new-release', 'opera', 'pagode', 'party', 'philippines-opm',
  'piano', 'pop', 'pop-film', 'post-dubstep', 'power-pop', 'progressive-house',
  'psych-rock', 'punk', 'punk-rock', 'r-n-b', 'rainy-day', 'reggae',
  'reggaeton', 'road-trip', 'rock', 'rock-n-roll', 'rockabilly', 'romance',
  'sad', 'salsa', 'samba', 'sertanejo', 'show-tunes', 'singer-songwriter',
  'ska', 'sleep', 'songwriter', 'soul', 'soundtracks', 'spanish', 'study',
  'summer', 'swedish', 'synth-pop', 'tango', 'techno', 'trance', 'trip-hop',
  'turkish', 'work-out', 'world-music',
] as const

// Normalize for matching: lowercase, replace dashes/underscores with spaces,
// collapse whitespace, trim. Last.fm returns "Indie Rock", Spotify uses "indie-rock";
// both normalize to "indie rock".
export function normalizeGenre(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const STATIC_GENRES: ReadonlySet<string> = new Set(
  STATIC_GENRES_RAW.map(normalizeGenre)
)

export function buildWhitelist(libraryGenres: Iterable<string>): ReadonlySet<string> {
  const out = new Set<string>(STATIC_GENRES)
  for (const g of libraryGenres) out.add(normalizeGenre(g))
  return out
}
