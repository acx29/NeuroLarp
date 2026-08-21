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
    PostgrestVersion: "14.15"
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
      ai_usage: {
        Row: {
          byok: boolean
          cost_usd: number
          created_at: string
          id: number
          input_tokens: number
          kind: string
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Insert: {
          byok?: boolean
          cost_usd?: number
          created_at?: string
          id?: never
          input_tokens?: number
          kind: string
          model: string
          output_tokens?: number
          provider: string
          user_id: string
        }
        Update: {
          byok?: boolean
          cost_usd?: number
          created_at?: string
          id?: never
          input_tokens?: number
          kind?: string
          model?: string
          output_tokens?: number
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      attempt_answers: {
        Row: {
          attempt_id: string
          correct: boolean | null
          created_at: string
          feedback: string
          id: string
          partial: number | null
          question_id: string
          response: string
          time_ms: number
          user_id: string
        }
        Insert: {
          attempt_id: string
          correct?: boolean | null
          created_at?: string
          feedback?: string
          id?: string
          partial?: number | null
          question_id: string
          response?: string
          time_ms?: number
          user_id: string
        }
        Update: {
          attempt_id?: string
          correct?: boolean | null
          created_at?: string
          feedback?: string
          id?: string
          partial?: number | null
          question_id?: string
          response?: string
          time_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      note_sources: {
        Row: {
          note_id: string
          source_id: string
          user_id: string
        }
        Insert: {
          note_id: string
          source_id: string
          user_id: string
        }
        Update: {
          note_id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_sources_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: Json
          content_text: string
          created_at: string
          embedding: string | null
          fts: unknown
          id: string
          last_analyzed_at: string | null
          provenance: Json
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          content_text?: string
          created_at?: string
          embedding?: string | null
          fts?: unknown
          id?: string
          last_analyzed_at?: string | null
          provenance?: Json
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          content_text?: string
          created_at?: string
          embedding?: string | null
          fts?: unknown
          id?: string
          last_analyzed_at?: string | null
          provenance?: Json
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          created_at: string
          due_date: string
          id: string
          kind: string
          plan_id: string
          rationale: string
          source_section_id: string | null
          status: string
          title: string
          topic_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          kind: string
          plan_id: string
          rationale?: string
          source_section_id?: string | null
          status?: string
          title: string
          topic_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          kind?: string
          plan_id?: string
          rationale?: string
          source_section_id?: string | null
          status?: string
          title?: string
          topic_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_source_section_id_fkey"
            columns: ["source_section_id"]
            isOneToOne: false
            referencedRelation: "source_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          due_date: string | null
          goal_topic_id: string | null
          id: string
          meta: Json
          name: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          goal_topic_id?: string | null
          id?: string
          meta?: Json
          name: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          goal_topic_id?: string | null
          id?: string
          meta?: Json
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_goal_topic_id_fkey"
            columns: ["goal_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          settings: Json
          username: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          settings?: Json
          username: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          settings?: Json
          username?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          quiz_id: string
          score: number | null
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          quiz_id: string
          score?: number | null
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          quiz_id?: string
          score?: number | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          answer: string
          created_at: string
          difficulty: number
          edge_id: string | null
          explanation: string
          format: string
          id: string
          options: Json
          ordinal: number
          prompt: string
          quiz_id: string
          source_section_id: string | null
          topic_id: string | null
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          difficulty?: number
          edge_id?: string | null
          explanation?: string
          format: string
          id?: string
          options?: Json
          ordinal?: number
          prompt: string
          quiz_id: string
          source_section_id?: string | null
          topic_id?: string | null
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          difficulty?: number
          edge_id?: string | null
          explanation?: string
          format?: string
          id?: string
          options?: Json
          ordinal?: number
          prompt?: string
          quiz_id?: string
          source_section_id?: string | null
          topic_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_edge_id_fkey"
            columns: ["edge_id"]
            isOneToOne: false
            referencedRelation: "topic_edges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_source_section_id_fkey"
            columns: ["source_section_id"]
            isOneToOne: false
            referencedRelation: "source_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_topics: {
        Row: {
          quiz_id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          quiz_id: string
          topic_id: string
          user_id: string
        }
        Update: {
          quiz_id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_topics_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_mix: boolean
          mode: string
          title: string
          topic_id: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_mix?: boolean
          mode: string
          title?: string
          topic_id: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_mix?: boolean
          mode?: string
          title?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          action: string
          created_at: string
          id: number
          ip_hash: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          ip_hash?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          ip_hash?: string
          user_id?: string | null
        }
        Relationships: []
      }
      review_state: {
        Row: {
          due_at: string
          ease: number
          interval_days: number
          lapses: number
          last_reviewed_at: string | null
          priority: number
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          due_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_reviewed_at?: string | null
          priority?: number
          topic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          due_at?: string
          ease?: number
          interval_days?: number
          lapses?: number
          last_reviewed_at?: string | null
          priority?: number
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_state_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: true
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      section_topics: {
        Row: {
          section_id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          section_id: string
          topic_id: string
          user_id: string
        }
        Update: {
          section_id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_topics_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "source_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      source_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          ordinal: number
          section_id: string | null
          source_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          ordinal?: number
          section_id?: string | null
          source_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          ordinal?: number
          section_id?: string | null
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_chunks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "source_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_sections: {
        Row: {
          chunk_end: number | null
          chunk_start: number | null
          created_at: string
          id: string
          label: string
          ordinal: number
          source_id: string
          title: string
          user_id: string
        }
        Insert: {
          chunk_end?: number | null
          chunk_start?: number | null
          created_at?: string
          id?: string
          label: string
          ordinal?: number
          source_id: string
          title?: string
          user_id: string
        }
        Update: {
          chunk_end?: number | null
          chunk_start?: number | null
          created_at?: string
          id?: string
          label?: string
          ordinal?: number
          source_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_sections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_topics: {
        Row: {
          source_id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          source_id: string
          topic_id: string
          user_id: string
        }
        Update: {
          source_id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_topics_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          file_path: string
          id: string
          ingest_error: string
          ingest_status: string
          kind: string
          meta: Json
          name: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path?: string
          id?: string
          ingest_error?: string
          ingest_status?: string
          kind: string
          meta?: Json
          name: string
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          ingest_error?: string
          ingest_status?: string
          kind?: string
          meta?: Json
          name?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          confidence: number
          created_at: string
          id: string
          kind: string
          payload: Json
          rationale: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          rationale?: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          rationale?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      topic_edges: {
        Row: {
          ai_generated: boolean
          created_at: string
          id: string
          kind: string
          rationale: string
          source_id: string
          target_id: string
          user_id: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          id?: string
          kind: string
          rationale?: string
          source_id: string
          target_id: string
          user_id: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          id?: string
          kind?: string
          rationale?: string
          source_id?: string
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          color_hue: number
          created_at: string
          description: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_hue?: number
          created_at?: string
          description?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_hue?: number
          created_at?: string
          description?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          id: string
          key_hint: string
          last_verified_at: string | null
          model: string
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          id?: string
          key_hint?: string
          last_verified_at?: string | null
          model?: string
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          id?: string
          key_hint?: string
          last_verified_at?: string | null
          model?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
