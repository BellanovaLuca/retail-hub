// Tipi del database. Da rigenerare dopo ogni migrazione con:
//   pnpm db:types   (supabase gen types typescript --linked > lib/supabase/database.types.ts)
// Questa prima versione è scritta a mano sullo schema di supabase/migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };
type OptionalTimestamps = { created_at?: string; updated_at?: string };

type Table<Row, Insert> = {
  Row: Row & Timestamps;
  Insert: Insert & OptionalTimestamps;
  Update: Partial<Insert & OptionalTimestamps>;
  Relationships: [];
};

export type Zone = "vista" | "sole" | "jolly";
export type Role = "admin" | "employee";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      departments: Table<
        { id: string; name: string; sort_order: number },
        { id?: string; name: string; sort_order?: number }
      >;
      profiles: Table<
        {
          id: string;
          first_name: string;
          last_name: string;
          display_name: string;
          employee_code: string;
          role: Role;
          weekly_hours: number | null;
          short_label: string | null;
          home_zone: Zone;
          counts_for_coverage: boolean;
          color: string | null;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          must_change_pin: boolean;
          privacy_accepted_at: string | null;
          active: boolean;
          sort_order: number;
          admin_notes: string | null;
        },
        {
          id: string;
          first_name: string;
          last_name: string;
          display_name: string;
          employee_code: string;
          role?: Role;
          weekly_hours?: number | null;
          short_label?: string | null;
          home_zone?: Zone;
          counts_for_coverage?: boolean;
          color?: string | null;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          must_change_pin?: boolean;
          privacy_accepted_at?: string | null;
          active?: boolean;
          sort_order?: number;
          admin_notes?: string | null;
        }
      >;
      profile_departments: Table<
        { profile_id: string; department_id: string; is_primary: boolean },
        { profile_id: string; department_id: string; is_primary?: boolean }
      >;
      store_settings: Table<
        {
          id: boolean;
          store_name: string;
          opening_hours: Json;
          request_notice_days: number;
          logo_path: string | null;
        },
        {
          id?: boolean;
          store_name?: string;
          opening_hours?: Json;
          request_notice_days?: number;
          logo_path?: string | null;
        }
      >;
      shift_templates: Table<
        {
          id: string;
          code: string;
          label: string;
          start_time: string | null;
          end_time: string | null;
          break_minutes: number;
          is_absence: boolean;
          sort_order: number;
        },
        {
          id?: string;
          code: string;
          label: string;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number;
          is_absence?: boolean;
          sort_order?: number;
        }
      >;
      holidays: Table<
        { id: string; date: string; label: string; store_closed: boolean },
        { id?: string; date: string; label: string; store_closed?: boolean }
      >;
      notifications: Table<
        {
          id: string;
          profile_id: string;
          kind: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
        },
        {
          id?: string;
          profile_id: string;
          kind: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
        }
      >;
      login_attempts: Table<
        { id: string; employee_code: string; ip: string | null; at: string; success: boolean },
        { id?: string; employee_code: string; ip?: string | null; at?: string; success: boolean }
      >;
      audit_log: Table<
        {
          id: string;
          actor_id: string | null;
          action: "insert" | "update" | "delete";
          entity: string;
          entity_id: string | null;
          diff: Json | null;
          at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          action: "insert" | "update" | "delete";
          entity: string;
          entity_id?: string | null;
          diff?: Json | null;
          at?: string;
        }
      >;
    };
    Views: {
      public_profiles: {
        Row: {
          id: string;
          display_name: string;
          short_label: string | null;
          color: string | null;
          avatar_url: string | null;
          home_zone: Zone;
          active: boolean;
          sort_order: number;
          primary_department_id: string | null;
          department_ids: string[];
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Profile = Tables<"profiles">;
export type PublicProfile = Database["public"]["Views"]["public_profiles"]["Row"];
