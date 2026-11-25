import { MusicBrainzApiError, musicBrainzFetch, type MusicBrainzFetcher } from "./client";
import type {
  MusicBrainzReleaseDetail,
  MusicBrainzReleaseGroupDetail,
  MusicBrainzSearchResponse,
  MusicBrainzUrlLookupResponse,
} from "./types";

export type MatchStatus = "matched" | "ambiguous" | "unmatched";

export interface MatchResult {
  status: MatchStatus;
  releaseId: string | null;
  releaseGroupId: string | null;
  label: string | null;
  genres: string[];
  score: number | null;
}

export interface AlbumToMatch {
  id: string;
  name: string;
  totalTracks: number | null;
  primaryArtistName: string | null;
}

const UNMATCHED: MatchResult = {
  status: "unmatched",
  releaseId: null,
  releaseGroupId: null,
  label: null,
  genres: [],
  score: null,
};

/** Confident fuzzy-search score floor for "matched"; below this but ≥AMBIGUOUS_SCORE_FLOOR is "ambiguous". */
const MATCHED_SCORE_FLOOR = 95;
const AMBIGUOUS_SCORE_FLOOR = 80;

/** A matched release whose track count differs from Spotify's by more than this is downgraded to "ambiguous". */
const MAX_TRACK_COUNT_DRIFT = 2;

const MAX_GENRES = 8;

export async function matchAlbum(album: AlbumToMatch, request: MusicBrainzFetcher = musicBrainzFetch): Promise<MatchResult> {
  const urlMatchId = await findReleaseByStreamingUrl(album.id, request);
  if (urlMatchId) {
    return withReleaseDetail(urlMatchId, 100, "matched", request);
  }

  if (!album.primaryArtistName) return UNMATCHED;
  return matchByFuzzySearch(album, request);
}

/**
 * MusicBrainz releases can carry a relationship to the Spotify album page
 * that streamed them — when present, this is an authoritative match with no
 * fuzzy logic needed. A 404 here just means no one has registered that
 * relationship; it's the common case, not an error.
 */
async function findReleaseByStreamingUrl(spotifyAlbumId: string, request: MusicBrainzFetcher): Promise<string | null> {
  const resource = `https://open.spotify.com/album/${spotifyAlbumId}`;
  try {
    const res = await request<MusicBrainzUrlLookupResponse>("/url", {
      searchParams: { resource, inc: "release-rels" },
    });
    const release = res.relations.find((rel) => rel["target-type"] === "release")?.release;
    return release?.id ?? null;
  } catch (error) {
    if (error instanceof MusicBrainzApiError && error.status === 404) return null;
    throw error;
  }
}

async function matchByFuzzySearch(album: AlbumToMatch, request: MusicBrainzFetcher): Promise<MatchResult> {
  const query = `artist:"${escapeLuceneQuery(album.primaryArtistName!)}" AND release:"${escapeLuceneQuery(album.name)}"`;
  const res = await request<MusicBrainzSearchResponse>("/release/", {
    searchParams: { query, limit: 5 },
  });

  const best = res.releases[0];
  if (!best || best.score < AMBIGUOUS_SCORE_FLOOR) return UNMATCHED;

  const titleMatches = normalizeTitle(best.title) === normalizeTitle(album.name);
  const trackCountDrift =
    album.totalTracks != null && best["track-count"] != null
      ? Math.abs(best["track-count"] - album.totalTracks)
      : 0;

  const isConfident = best.score >= MATCHED_SCORE_FLOOR && titleMatches && trackCountDrift <= MAX_TRACK_COUNT_DRIFT;

  if (!isConfident) {
    return {
      status: "ambiguous",
      releaseId: best.id,
      releaseGroupId: null,
      label: null,
      genres: [],
      score: best.score,
    };
  }

  return withReleaseDetail(best.id, best.score, "matched", request);
}

async function withReleaseDetail(releaseId: string, score: number, status: MatchStatus, request: MusicBrainzFetcher): Promise<MatchResult> {
  const release = await request<MusicBrainzReleaseDetail>(`/release/${releaseId}`, {
    searchParams: { inc: "labels+release-groups+genres" },
  });

  const label = release["label-info"]?.find((info) => info.label?.name)?.label?.name ?? null;
  const releaseGroupId = release["release-group"]?.id ?? null;
  let genres = topGenres(release.genres);

  if (genres.length === 0 && releaseGroupId) {
    const releaseGroup = await request<MusicBrainzReleaseGroupDetail>(`/release-group/${releaseGroupId}`, {
      searchParams: { inc: "genres" },
    });
    genres = topGenres(releaseGroup.genres);
  }

  return { status, releaseId, releaseGroupId, label, genres, score };
}

function topGenres(genres: { name: string; count: number }[] | undefined): string[] {
  if (!genres || genres.length === 0) return [];
  return [...genres]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_GENRES)
    .map((g) => g.name);
}

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Escapes Lucene special characters for a MusicBrainz search query term. */
function escapeLuceneQuery(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, (c) => `\\${c}`);
}
