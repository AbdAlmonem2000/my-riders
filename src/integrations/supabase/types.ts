export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
          commercial_registration: string | null
          created_at: string
          expiry_notify_days: number
          id: string
          is_suspended: boolean
          logo_url: string | null
          name: string
          plan_company_profile_access: boolean
          plan_documents_access: string
          plan_expiry_alerts_access: boolean
          plan_letters_access: string
          plan_notifications_access: boolean
          plan_operating_cards_access: boolean
          plan_overview_access: boolean
          plan_reports_access: string
          plan_riders_access: string
          plan_users_access: boolean
          roster_file_name: string | null
          roster_path: string | null
          roster_uploaded_at: string | null
          signature_url: string | null
          stamp_url: string | null
          unified_number: string | null
        }
        Insert: {
          commercial_registration?: string | null
          created_at?: string
          expiry_notify_days?: number
          id?: string
          is_suspended?: boolean
          logo_url?: string | null
          name: string
          plan_company_profile_access?: boolean
          plan_documents_access?: string
          plan_expiry_alerts_access?: boolean
          plan_letters_access?: string
          plan_notifications_access?: boolean
          plan_operating_cards_access?: boolean
          plan_overview_access?: boolean
          plan_reports_access?: string
          plan_riders_access?: string
          plan_users_access?: boolean
          roster_file_name?: string | null
          roster_path?: string | null
          roster_uploaded_at?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          unified_number?: string | null
        }
        Update: {
          commercial_registration?: string | null
          created_at?: string
          expiry_notify_days?: number
          id?: string
          is_suspended?: boolean
          logo_url?: string | null
          name?: string
          plan_company_profile_access?: boolean
          plan_documents_access?: string
          plan_expiry_alerts_access?: boolean
          plan_letters_access?: string
          plan_notifications_access?: boolean
          plan_operating_cards_access?: boolean
          plan_overview_access?: boolean
          plan_reports_access?: string
          plan_riders_access?: string
          plan_users_access?: boolean
          roster_file_name?: string | null
          roster_path?: string | null
          roster_uploaded_at?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          unified_number?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          company_id: string
          expiry_date: string
          file_name: string
          id: string
          label: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          company_id: string
          expiry_date: string
          file_name: string
          id?: string
          label: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          company_id?: string
          expiry_date?: string
          file_name?: string
          id?: string
          label?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_letters: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          include_signature: boolean
          include_stamp: boolean
          is_sent: boolean
          letter_date: string
          rider_id: string | null
          sent_at: string | null
          title: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          include_signature?: boolean
          include_stamp?: boolean
          is_sent?: boolean
          letter_date: string
          rider_id?: string | null
          sent_at?: string | null
          title: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          include_signature?: boolean
          include_stamp?: boolean
          is_sent?: boolean
          letter_date?: string
          rider_id?: string | null
          sent_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_letters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_letters_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          is_hidden: boolean
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
          is_hidden?: boolean
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
          is_hidden?: boolean
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
      rider_documents: {
        Row: {
          card_number: string | null
          company_id: string
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          label: string | null
          plate_number: string | null
          rider_id: string
          storage_path: string | null
          uploaded_at: string
        }
        Insert: {
          card_number?: string | null
          company_id: string
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          label?: string | null
          plate_number?: string | null
          rider_id: string
          storage_path?: string | null
          uploaded_at?: string
        }
        Update: {
          card_number?: string | null
          company_id?: string
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          label?: string | null
          plate_number?: string | null
          rider_id?: string
          storage_path?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_documents_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          rider_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          rider_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "rider_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_notification_reads_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_notifications: {
        Row: {
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          target_rider_id: string | null
          title: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          target_rider_id?: string | null
          title: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          target_rider_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_notifications_target_rider_id_fkey"
            columns: ["target_rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          rider_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          rider_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_push_subscriptions_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
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
          area: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          extra: Json
          id: string
          id_number: string | null
          iqama_number: string | null
          is_blocked: boolean
          password_hash: string | null
          photo_rotation: number
          photo_url: string | null
          rider_name: string | null
        }
        Insert: {
          area?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          extra?: Json
          id?: string
          id_number?: string | null
          iqama_number?: string | null
          is_blocked?: boolean
          password_hash?: string | null
          photo_rotation?: number
          photo_url?: string | null
          rider_name?: string | null
        }
        Update: {
          area?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          extra?: Json
          id?: string
          id_number?: string | null
          iqama_number?: string | null
          is_blocked?: boolean
          password_hash?: string | null
          photo_rotation?: number
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
          allowed_areas: string[] | null
          company_id: string | null
          created_at: string
          display_name: string | null
          documents_access: string
          expiry_alerts_access: boolean
          expiry_notify_days: number | null
          id: string
          letters_access: string
          notifications_access: boolean
          operating_cards_access: boolean
          operating_cards_delete_access: boolean
          operating_cards_export_access: boolean
          operating_cards_upload_access: boolean
          overview_access: boolean
          reports_access: string
          riders_access: string
          riders_block_access: boolean
          riders_delete_access: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          allowed_areas?: string[] | null
          company_id?: string | null
          created_at?: string
          display_name?: string | null
          documents_access?: string
          expiry_alerts_access?: boolean
          expiry_notify_days?: number | null
          id?: string
          letters_access?: string
          notifications_access?: boolean
          operating_cards_access?: boolean
          operating_cards_delete_access?: boolean
          operating_cards_export_access?: boolean
          operating_cards_upload_access?: boolean
          overview_access?: boolean
          reports_access?: string
          riders_access?: string
          riders_block_access?: boolean
          riders_delete_access?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          allowed_areas?: string[] | null
          company_id?: string | null
          created_at?: string
          display_name?: string | null
          documents_access?: string
          expiry_alerts_access?: boolean
          expiry_notify_days?: number | null
          id?: string
          letters_access?: string
          notifications_access?: boolean
          operating_cards_access?: boolean
          operating_cards_delete_access?: boolean
          operating_cards_export_access?: boolean
          operating_cards_upload_access?: boolean
          overview_access?: boolean
          reports_access?: string
          riders_access?: string
          riders_block_access?: boolean
          riders_delete_access?: boolean
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
      update_my_display_name: { Args: { _name: string }; Returns: undefined }
      update_my_expiry_notify_days: { Args: { _days: number | null }; Returns: undefined }
      register_rider_push: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _password?: string
          _rider_id: string
        }
        Returns: undefined
      }
      unregister_rider_push: { Args: { _endpoint: string }; Returns: undefined }
      list_push_targets: {
        Args: {
          _after?: string
          _company_id: string
          _limit?: number
          _report_id?: string
          _rider_id?: string
        }
        Returns: {
          auth_secret: string
          endpoint: string
          p256dh: string
          rider_id: string
          rider_key: string
          subscription_id: string
        }[]
      }
      admin_list_accounts: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          created_at: string
          display_name: string | null
          email: string
          last_sign_in_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_list_rider_notifications: {
        Args: never
        Returns: {
          body: string
          created_at: string
          kind: string
          notification_id: string
          read_count: number
          target_count: number
          target_rider_id: string | null
          target_rider_name: string | null
          title: string
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
      company_admin_list_staff: {
        Args: { _company_id: string }
        Returns: {
          allowed_areas: string[] | null
          created_at: string
          display_name: string | null
          documents_access: string
          email: string
          expiry_alerts_access: boolean
          last_sign_in_at: string | null
          letters_access: string
          notifications_access: boolean
          operating_cards_access: boolean
          operating_cards_delete_access: boolean
          operating_cards_export_access: boolean
          operating_cards_upload_access: boolean
          overview_access: boolean
          reports_access: string
          riders_access: string
          riders_block_access: boolean
          riders_delete_access: boolean
          user_id: string
        }[]
      }
      company_admin_update_staff_email: {
        Args: { _email: string; _user_id: string }
        Returns: undefined
      }
      company_admin_update_staff_password: {
        Args: { _password: string; _user_id: string }
        Returns: undefined
      }
      company_admin_delete_staff: { Args: { _user_id: string }; Returns: undefined }
      get_member_company: { Args: { _user_id: string }; Returns: string }
      get_member_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_member_overview_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_riders_access: { Args: { _user_id: string }; Returns: string }
      get_member_riders_delete_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_riders_block_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_reports_access: { Args: { _user_id: string }; Returns: string }
      get_member_documents_access: { Args: { _user_id: string }; Returns: string }
      get_member_letters_access: { Args: { _user_id: string }; Returns: string }
      get_member_notifications_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_operating_cards_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_operating_cards_upload_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_operating_cards_export_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_operating_cards_delete_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_expiry_alerts_access: { Args: { _user_id: string }; Returns: boolean }
      get_member_allowed_areas: { Args: { _user_id: string }; Returns: string[] }
      get_company_plan_overview_access: { Args: { _company_id: string }; Returns: boolean }
      get_company_plan_riders_access: { Args: { _company_id: string }; Returns: string }
      get_company_plan_reports_access: { Args: { _company_id: string }; Returns: string }
      get_company_plan_documents_access: { Args: { _company_id: string }; Returns: string }
      get_company_plan_letters_access: { Args: { _company_id: string }; Returns: string }
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
      list_rider_notifications: {
        Args: { _rider_id: string }
        Returns: {
          body: string
          created_at: string
          is_read: boolean
          kind: string
          notification_id: string
          title: string
        }[]
      }
      mark_rider_notifications_read: {
        Args: { _notification_ids: string[]; _rider_id: string }
        Returns: undefined
      }
      list_rider_letters: {
        Args: { _rider_id: string }
        Returns: {
          body: string
          company_commercial_registration: string | null
          company_logo_url: string | null
          company_name: string
          company_signature_url: string | null
          company_stamp_url: string | null
          company_unified_number: string | null
          created_at: string
          include_signature: boolean
          include_stamp: boolean
          letter_date: string
          letter_id: string
          rider_name: string | null
          title: string
        }[]
      }
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
          rider_area: string
          rider_extra: Json
          rider_has_password: boolean
          rider_id: string
          rider_is_blocked: boolean
          rider_name: string
          rider_photo_rotation: number
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
