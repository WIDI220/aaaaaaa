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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      employees: {
        Row: {
          aktiv: boolean | null
          created_at: string | null
          gewerk: string
          id: string
          kuerzel: string
          name: string
        }
        Insert: {
          aktiv?: boolean | null
          created_at?: string | null
          gewerk: string
          id?: string
          kuerzel: string
          name: string
        }
        Update: {
          aktiv?: boolean | null
          created_at?: string | null
          gewerk?: string
          id?: string
          kuerzel?: string
          name?: string
        }
        Relationships: []
      }
      escalation_settings: {
        Row: {
          id: string
          status: string
          warntage: number
        }
        Insert: {
          id?: string
          status: string
          warntage?: number
        }
        Update: {
          id?: string
          status?: string
          warntage?: number
        }
        Relationships: []
      }
      import_runs: {
        Row: {
          created_at: string | null
          created_by: string | null
          failed: number | null
          file_hash: string | null
          filename: string | null
          id: string
          inserted: number | null
          pages_expected: number | null
          pages_review: number | null
          pages_saved: number | null
          rows_total: number | null
          skipped_duplicates: number | null
          typ: string
          updated: number | null
          worklogs_created: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          failed?: number | null
          file_hash?: string | null
          filename?: string | null
          id?: string
          inserted?: number | null
          pages_expected?: number | null
          pages_review?: number | null
          pages_saved?: number | null
          rows_total?: number | null
          skipped_duplicates?: number | null
          typ: string
          updated?: number | null
          worklogs_created?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          failed?: number | null
          file_hash?: string | null
          filename?: string | null
          id?: string
          inserted?: number | null
          pages_expected?: number | null
          pages_review?: number | null
          pages_saved?: number | null
          rows_total?: number | null
          skipped_duplicates?: number | null
          typ?: string
          updated?: number | null
          worklogs_created?: number | null
        }
        Relationships: []
      }
      pdf_page_results: {
        Row: {
          a_nummer_matched: string | null
          a_nummer_raw: string | null
          created_at: string | null
          created_by: string | null
          hash_unique: string
          id: string
          import_run_id: string | null
          konfidenz: number | null
          leistungsdatum: string | null
          mitarbeiter_matched: string | null
          mitarbeiter_raw: string | null
          needs_review: boolean | null
          page_number: number
          raw_ocr_text: string | null
          review_reason: string | null
          status: string | null
          stunden: number | null
        }
        Insert: {
          a_nummer_matched?: string | null
          a_nummer_raw?: string | null
          created_at?: string | null
          created_by?: string | null
          hash_unique: string
          id?: string
          import_run_id?: string | null
          konfidenz?: number | null
          leistungsdatum?: string | null
          mitarbeiter_matched?: string | null
          mitarbeiter_raw?: string | null
          needs_review?: boolean | null
          page_number: number
          raw_ocr_text?: string | null
          review_reason?: string | null
          status?: string | null
          stunden?: number | null
        }
        Update: {
          a_nummer_matched?: string | null
          a_nummer_raw?: string | null
          created_at?: string | null
          created_by?: string | null
          hash_unique?: string
          id?: string
          import_run_id?: string | null
          konfidenz?: number | null
          leistungsdatum?: string | null
          mitarbeiter_matched?: string | null
          mitarbeiter_raw?: string | null
          needs_review?: boolean | null
          page_number?: number
          raw_ocr_text?: string | null
          review_reason?: string | null
          status?: string | null
          stunden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdf_page_results_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string
          old_status: string | null
          ticket_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          ticket_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          note: string
          ticket_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          note: string
          ticket_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_worklogs: {
        Row: {
          created_at: string | null
          employee_id: string | null
          id: string
          leistungsdatum: string | null
          pdf_page_result_id: string | null
          stunden: number | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          leistungsdatum?: string | null
          pdf_page_result_id?: string | null
          stunden?: number | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          leistungsdatum?: string | null
          pdf_page_result_id?: string | null
          stunden?: number | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_worklogs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_worklogs_pdf_page_result_id_fkey"
            columns: ["pdf_page_result_id"]
            isOneToOne: true
            referencedRelation: "pdf_page_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_worklogs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          a_nummer: string
          beschreibung: string | null
          created_at: string | null
          eingangsdatum: string | null
          gewerk: string
          id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          a_nummer: string
          beschreibung?: string | null
          created_at?: string | null
          eingangsdatum?: string | null
          gewerk: string
          id?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          a_nummer?: string
          beschreibung?: string | null
          created_at?: string | null
          eingangsdatum?: string | null
          gewerk?: string
          id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          beschreibung: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          stunden: number
          ticket_id: string | null
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          stunden: number
          ticket_id?: string | null
        }
        Update: {
          beschreibung?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          stunden?: number
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: boolean
      }
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
  public: {
    Enums: {},
  },
} as const
