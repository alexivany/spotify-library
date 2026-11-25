export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      album_artists: {
        Row: {
          album_id: string
          artist_id: string
          position: number
        }
        Insert: {
          album_id: string
          artist_id: string
          position?: number
        }
        Update: {
          album_id?: string
          artist_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "album_artists_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "album_genres"
            referencedColumns: ["album_id"]
          },
          {
            foreignKeyName: "album_artists_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          album_type: string
          id: string
          image_url: string | null
          label: string | null
          musicbrainz_checked_at: string | null
          musicbrainz_genres: string[]
          musicbrainz_label: string | null
          musicbrainz_match_score: number | null
          musicbrainz_match_status: string | null
          musicbrainz_release_group_id: string | null
          musicbrainz_release_id: string | null
          name: string
          popularity: number | null
          raw: Json
          release_date: string | null
          release_date_precision: string | null
          resolved_label: string | null
          saved_at: string | null
          total_tracks: number | null
          upc: string | null
          updated_at: string
        }
        Insert: {
          album_type: string
          id: string
          image_url?: string | null
          label?: string | null
          musicbrainz_checked_at?: string | null
          musicbrainz_genres?: string[]
          musicbrainz_label?: string | null
          musicbrainz_match_score?: number | null
          musicbrainz_match_status?: string | null
          musicbrainz_release_group_id?: string | null
          musicbrainz_release_id?: string | null
          name: string
          popularity?: number | null
          raw?: Json
          release_date?: string | null
          release_date_precision?: string | null
          resolved_label?: string | null
          saved_at?: string | null
          total_tracks?: number | null
          upc?: string | null
          updated_at?: string
        }
        Update: {
          album_type?: string
          id?: string
          image_url?: string | null
          label?: string | null
          musicbrainz_checked_at?: string | null
          musicbrainz_genres?: string[]
          musicbrainz_label?: string | null
          musicbrainz_match_score?: number | null
          musicbrainz_match_status?: string | null
          musicbrainz_release_group_id?: string | null
          musicbrainz_release_id?: string | null
          name?: string
          popularity?: number | null
          raw?: Json
          release_date?: string | null
          release_date_precision?: string | null
          resolved_label?: string | null
          saved_at?: string | null
          total_tracks?: number | null
          upc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      artists: {
        Row: {
          followers: number | null
          genres: string[]
          id: string
          image_url: string | null
          name: string
          popularity: number | null
          raw: Json
          updated_at: string
        }
        Insert: {
          followers?: number | null
          genres?: string[]
          id: string
          image_url?: string | null
          name: string
          popularity?: number | null
          raw?: Json
          updated_at?: string
        }
        Update: {
          followers?: number | null
          genres?: string[]
          id?: string
          image_url?: string | null
          name?: string
          popularity?: number | null
          raw?: Json
          updated_at?: string
        }
        Relationships: []
      }
      musicbrainz_enrichment_state: {
        Row: {
          id: boolean
          lease_token: string | null
          lease_expires_at: string
          heartbeat_at: string
          retry_after: string
          no_progress_chunks: number
        }
        Insert: {
          id?: boolean
          lease_token?: string | null
          lease_expires_at?: string
          heartbeat_at?: string
          retry_after?: string
          no_progress_chunks?: number
        }
        Update: {
          id?: boolean
          lease_token?: string | null
          lease_expires_at?: string
          heartbeat_at?: string
          retry_after?: string
          no_progress_chunks?: number
        }
        Relationships: []
      }
      enrichment_runs: {
        Row: {
          counts: Json
          cursor: Json | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          counts?: Json
          cursor?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          counts?: Json
          cursor?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      folder_items: {
        Row: {
          created_at: string
          folder_id: string
          item_id: string
          item_type: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          item_id: string
          item_type: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          item_id?: string
          item_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      item_tags: {
        Row: {
          created_at: string
          item_id: string
          item_type: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          item_type: string
          tag_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          item_type?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          counts: Json
          cursor: Json | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          counts?: Json
          cursor?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          counts?: Json
          cursor?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      track_artists: {
        Row: {
          artist_id: string
          position: number
          track_id: string
        }
        Insert: {
          artist_id: string
          position?: number
          track_id: string
        }
        Update: {
          artist_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_artists_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "track_genres"
            referencedColumns: ["track_id"]
          },
          {
            foreignKeyName: "track_artists_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          album_id: string | null
          disc_number: number | null
          duration_ms: number | null
          explicit: boolean
          id: string
          isrc: string | null
          name: string
          popularity: number | null
          preview_url: string | null
          raw: Json
          saved_at: string | null
          track_number: number | null
          updated_at: string
        }
        Insert: {
          album_id?: string | null
          disc_number?: number | null
          duration_ms?: number | null
          explicit?: boolean
          id: string
          isrc?: string | null
          name: string
          popularity?: number | null
          preview_url?: string | null
          raw?: Json
          saved_at?: string | null
          track_number?: number | null
          updated_at?: string
        }
        Update: {
          album_id?: string | null
          disc_number?: number | null
          duration_ms?: number | null
          explicit?: boolean
          id?: string
          isrc?: string | null
          name?: string
          popularity?: number | null
          preview_url?: string | null
          raw?: Json
          saved_at?: string | null
          track_number?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "album_genres"
            referencedColumns: ["album_id"]
          },
          {
            foreignKeyName: "tracks_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      album_genres: {
        Row: {
          album_id: string | null
          genres: string[] | null
        }
        Relationships: []
      }
      track_genres: {
        Row: {
          genres: string[] | null
          track_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
