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
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      company_notes: {
        Row: {
          company_id: string
          notes: string
          updated_at: string
        }
        Insert: {
          company_id: string
          notes?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          notes?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_suspended: boolean
          logo_url: string | null
          name: string
          roster_file_name: string | null
          roster_path: string | null
          roster_uploaded_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          logo_url?: string | null
          name: string
          roster_file_name?: string | null
          roster_path?: string | null
          roster_uploaded_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          logo_url?: string | null
          name?: string
          roster_file_name?: string | null
          roster_path?: string | null
          roster_uploaded_at?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          month: number
          note: string | null
          rider_count: number
          storage_path: string | null
          uploaded_by: string | null
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          month: number
          note?: string | null
          rider_count?: number
          storage_path?: string | null
          uploaded_by?: string | null
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          month?: number
          note?: string | null
          rider_count?: number
          storage_path?: string | null
          uploaded_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sheets: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          headers: Json
          id: string
          report_id: string
          rider_count: number
          storage_path: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          headers?: Json
          id?: string
          report_id: string
          rider_count?: number
          storage_path?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          headers?: Json
          id?: string
          report_id?: string
          rider_count?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_sheets_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_reports: {
        Row: {
          columns: Json
          column_sources: Json
          company_id: string
          created_at: string
          data: Json
          id: string
          report_id: string
          rider_id: string
        }
        Insert: {
          columns?: Json
          column_sources?: Json
          company_id: string
          created_at?: string
          data?: Json
          id?: string
          report_id: string
          rider_id: string
        }
        Update: {
          columns?: Json
          column_sources?: Json
          company_id?: string
          created_at?: string
          data?: Json
          id?: string
          report_id?: string
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_reports_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_reports_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          company_id: string
          created_at: string
          extra: Json
          id: string
          id_number: string | null
          iqama_number: string | null
          is_blocked: boolean
          password_hash: string | null
          photo_url: string | null
          rider_name: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          extra?: Json
          id?: string
          id_number?: string | null
          iqama_number?: string | null
          is_blocked?: boolean
          password_hash?: string | null
          photo_url?: string | null
          rider_name?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          extra?: Json
          id?: string
          id_number?: string | null
          iqama_number?: string | null
          is_blocked?: boolean
          password_hash?: string | null
          photo_url?: string | null
          rider_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "riders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_set_rider_password: {
        Args: { _password: string; _rider_id: string }
        Returns: undefined
      }
      rider_password_ok: {
        Args: { _password: string; _rider_id: string }
        Returns: boolean
      }
      set_rider_password: {
        Args: { _current_password?: string; _new_password: string; _rider_id: string }
        Returns: undefined
      }
      admin_list_accounts: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          created_at: string
          email: string
          last_sign_in_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_update_user_email: {
        Args: { _email: string; _user_id: string }
        Returns: undefined
      }
      admin_update_user_password: {
        Args: { _password: string; _user_id: string }
        Returns: undefined
      }
      get_rider_report: {
        Args: { _password?: string; _report_id: string; _rider_id: string }
        Returns: {
          columns: Json
          data: Json
          file_name: string
          month: number
          note: string | null
          year: number
        }[]
      }
      get_user_company: { Args: { _user_id: string }; Returns: string }
      is_company_active: { Args: { _company_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_rider_reports: {
        Args: { _password?: string; _rider_id: string }
        Returns: {
          file_name: string
          month: number
          report_id: string
          year: number
        }[]
      }
      lookup_riders_by_iqama: {
        Args: { _iqama: string }
        Returns: {
          company_id: string
          company_logo_url: string
          company_name: string
          rider_extra: Json
          rider_has_password: boolean
          rider_id: string
          rider_is_blocked: boolean
          rider_name: string
          rider_photo_url: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
