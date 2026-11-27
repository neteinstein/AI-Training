export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      areas: {
        Row: {
          color: string;
          created_at: string;
          description_en: string | null;
          description_pt: string | null;
          icon: string;
          id: string;
          name_en: string;
          name_pt: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          icon?: string;
          id?: string;
          name_en: string;
          name_pt: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          icon?: string;
          id?: string;
          name_en?: string;
          name_pt?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          area_id: string;
          created_at: string;
          description_en: string | null;
          description_pt: string | null;
          duration_hours: number | null;
          id: string;
          level_id: string;
          location: string | null;
          published_at: string | null;
          slug: string;
          sort_order: number;
          starts_on: string | null;
          status: Database["public"]["Enums"]["course_status"];
          summary_en: string | null;
          summary_pt: string | null;
          title_en: string;
          title_pt: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          area_id: string;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          duration_hours?: number | null;
          id?: string;
          level_id: string;
          location?: string | null;
          published_at?: string | null;
          slug: string;
          sort_order?: number;
          starts_on?: string | null;
          status?: Database["public"]["Enums"]["course_status"];
          summary_en?: string | null;
          summary_pt?: string | null;
          title_en: string;
          title_pt: string;
          updated_at?: string;
        };
        Update: {
          area_id?: string;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          duration_hours?: number | null;
          id?: string;
          level_id?: string;
          location?: string | null;
          published_at?: string | null;
          slug?: string;
          sort_order?: number;
          starts_on?: string | null;
          status?: Database["public"]["Enums"]["course_status"];
          summary_en?: string | null;
          summary_pt?: string | null;
          title_en?: string;
          title_pt?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      edition_hidden_materials: {
        Row: {
          created_at: string;
          edition_id: string;
          material_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          edition_id: string;
          material_id: string;
        };
        Update: {
          created_at?: string;
          edition_id?: string;
          material_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edition_hidden_materials_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edition_hidden_materials_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
        ];
      };
      editions: {
        Row: {
          course_id: string;
          created_at: string;
          ends_on: string | null;
          id: string;
          is_default: boolean;
          is_listed: boolean;
          name_en: string;
          name_pt: string;
          starts_on: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          course_id: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_default?: boolean;
          is_listed?: boolean;
          name_en: string;
          name_pt: string;
          starts_on?: string | null;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_default?: boolean;
          is_listed?: boolean;
          name_en?: string;
          name_pt?: string;
          starts_on?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "editions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          course_id: string;
          created_at: string;
          created_by: string | null;
          edition_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          course_id: string;
          created_at?: string;
          created_by?: string | null;
          edition_id: string;
          user_id: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          created_by?: string | null;
          edition_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_edition_fkey";
            columns: ["edition_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id", "course_id"];
          },
          {
            foreignKeyName: "enrollments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      info_requests: {
        Row: {
          course_id: string | null;
          created_at: string;
          email: string;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          locale: string;
          message: string | null;
          name: string;
          organisation: string | null;
          status: Database["public"]["Enums"]["request_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          course_id?: string | null;
          created_at?: string;
          email: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          locale?: string;
          message?: string | null;
          name: string;
          organisation?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          updated_at?: string;
        };
        Update: {
          course_id?: string | null;
          created_at?: string;
          email?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          locale?: string;
          message?: string | null;
          name?: string;
          organisation?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "info_requests_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "info_requests_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      levels: {
        Row: {
          created_at: string;
          description_en: string | null;
          description_pt: string | null;
          id: string;
          name_en: string;
          name_pt: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          id?: string;
          name_en: string;
          name_pt: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          id?: string;
          name_en?: string;
          name_pt?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      material_progress: {
        Row: {
          completed_at: string | null;
          last_opened_at: string;
          material_id: string;
          opened_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          last_opened_at?: string;
          material_id: string;
          opened_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          last_opened_at?: string;
          material_id?: string;
          opened_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_progress_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "material_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      materials: {
        Row: {
          body_en: string | null;
          body_pt: string | null;
          content_language: string | null;
          created_at: string;
          description_en: string | null;
          description_pt: string | null;
          edition_id: string | null;
          file_name: string | null;
          id: string;
          is_published: boolean;
          kind: Database["public"]["Enums"]["material_kind"];
          mime_type: string | null;
          module_id: string;
          size_bytes: number | null;
          sort_order: number;
          storage_path: string | null;
          title_en: string | null;
          title_pt: string | null;
          updated_at: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          body_en?: string | null;
          body_pt?: string | null;
          content_language?: string | null;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          edition_id?: string | null;
          file_name?: string | null;
          id?: string;
          is_published?: boolean;
          kind: Database["public"]["Enums"]["material_kind"];
          mime_type?: string | null;
          module_id: string;
          size_bytes?: number | null;
          sort_order?: number;
          storage_path?: string | null;
          title_en?: string | null;
          title_pt?: string | null;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          body_en?: string | null;
          body_pt?: string | null;
          content_language?: string | null;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          edition_id?: string | null;
          file_name?: string | null;
          id?: string;
          is_published?: boolean;
          kind?: Database["public"]["Enums"]["material_kind"];
          mime_type?: string | null;
          module_id?: string;
          size_bytes?: number | null;
          sort_order?: number;
          storage_path?: string | null;
          title_en?: string | null;
          title_pt?: string | null;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "materials_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "materials_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          course_id: string;
          created_at: string;
          description_en: string | null;
          description_pt: string | null;
          id: string;
          sort_order: number;
          title_en: string | null;
          title_pt: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          course_id: string;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          id?: string;
          sort_order?: number;
          title_en?: string | null;
          title_pt?: string | null;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          description_en?: string | null;
          description_pt?: string | null;
          id?: string;
          sort_order?: number;
          title_en?: string | null;
          title_pt?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          email_confirmed_at: string | null;
          full_name: string;
          id: string;
          locale: string;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          email_confirmed_at?: string | null;
          full_name?: string;
          id: string;
          locale?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          email_confirmed_at?: string | null;
          full_name?: string;
          id?: string;
          locale?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      storage_deletions: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: number;
          object_path: string;
        };
        ComputedFields: never;
        Insert: {
          bucket_id: string;
          created_at?: string;
          id?: never;
          object_path: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: never;
          object_path?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      my_course_progress: {
        Row: {
          course_id: string;
          done_materials: number | null;
          edition_id: string;
          last_activity_at: string | null;
          total_materials: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_edition_fkey";
            columns: ["edition_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id", "course_id"];
          },
        ];
      };
    };
    Functions: {
      course_progress: {
        Args: { target_course_id: string };
        Returns: {
          done_materials: number;
          edition_id: string;
          last_activity_at: string;
          total_materials: number;
          user_id: string;
        }[];
      };
      learner_progress: {
        Args: { target_course_id: string; target_user_id: string };
        Returns: {
          completed_at: string;
          last_opened_at: string;
          material_id: string;
          opened_at: string;
        }[];
      };
      record_material_open: { Args: { target_material_id: string }; Returns: boolean };
      reorder_areas: { Args: { ordered_ids: string[] }; Returns: undefined };
      reorder_courses: { Args: { ordered_ids: string[] }; Returns: undefined };
      reorder_levels: { Args: { ordered_ids: string[] }; Returns: undefined };
      reorder_materials: {
        Args: { ordered_ids: string[]; target_module_id: string };
        Returns: undefined;
      };
      reorder_modules: {
        Args: { ordered_ids: string[]; target_course_id: string };
        Returns: undefined;
      };
      set_default_edition: { Args: { target_edition_id: string }; Returns: undefined };
      set_user_role: {
        Args: { new_role: Database["public"]["Enums"]["user_role"]; target: string };
        Returns: undefined;
      };
    };
    Enums: {
      course_status: "draft" | "published" | "unlisted";
      material_kind: "file" | "video" | "embed" | "link" | "page";
      request_status: "new" | "contacted" | "invited" | "archived";
      user_role: "learner" | "trainer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      course_status: ["draft", "published", "unlisted"],
      material_kind: ["file", "video", "embed", "link", "page"],
      request_status: ["new", "contacted", "invited", "archived"],
      user_role: ["learner", "trainer"],
    },
  },
} as const;
