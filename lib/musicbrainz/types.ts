/** Minimal shapes for the MusicBrainz JSON API (`fmt=json`) — only fields this app reads. */

export interface MusicBrainzGenre {
  id: string;
  name: string;
  count: number;
}

export interface MusicBrainzLabelInfo {
  label: {
    id: string;
    name: string;
  } | null;
}

export interface MusicBrainzReleaseGroupRef {
  id: string;
}

/** Response of `GET /ws/2/url?resource=...&inc=release-rels`. */
export interface MusicBrainzUrlLookupResponse {
  id: string;
  resource: string;
  relations: MusicBrainzUrlRelation[];
}

export interface MusicBrainzUrlRelation {
  type: string;
  "target-type": string;
  release?: {
    id: string;
    title: string;
  };
}

/** One hit of `GET /ws/2/release/?query=...`. */
export interface MusicBrainzSearchRelease {
  id: string;
  score: number;
  title: string;
  "track-count"?: number;
}

export interface MusicBrainzSearchResponse {
  count: number;
  releases: MusicBrainzSearchRelease[];
}

/** Response of `GET /ws/2/release/{id}?inc=labels+release-groups+genres`. */
export interface MusicBrainzReleaseDetail {
  id: string;
  title: string;
  "label-info"?: MusicBrainzLabelInfo[];
  "release-group"?: MusicBrainzReleaseGroupRef;
  genres?: MusicBrainzGenre[];
}

/** Response of `GET /ws/2/release-group/{id}?inc=genres`. */
export interface MusicBrainzReleaseGroupDetail {
  id: string;
  genres?: MusicBrainzGenre[];
}
