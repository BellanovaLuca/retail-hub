// GENERATO da scripts/gen-types.mts — non modificare a mano.
// Rigenera dopo ogni migrazione: DATABASE_URL=… pnpm db:types:local

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string;
          profile_id: string;
          read_at: string;
          acknowledged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          announcement_id: string;
          profile_id: string;
          read_at?: string;
          acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          announcement_id?: string;
          profile_id?: string;
          read_at?: string;
          acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey";
            columns: ["announcement_id"];
            isOneToOne: false;
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcement_reads_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      announcements: {
        Row: {
          id: string;
          title: string;
          body_md: string;
          category: "ferie" | "formazione" | "generale" | "turni" | "urgente" | "vendite";
          audience: "all" | "department" | "people";
          department_ids: string[];
          profile_ids: string[];
          pinned: boolean;
          requires_ack: boolean;
          attachments: Json;
          publish_at: string;
          expires_at: string | null;
          author_id: string | null;
          notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body_md?: string;
          category?: "ferie" | "formazione" | "generale" | "turni" | "urgente" | "vendite";
          audience?: "all" | "department" | "people";
          department_ids?: string[];
          profile_ids?: string[];
          pinned?: boolean;
          requires_ack?: boolean;
          attachments?: Json;
          publish_at?: string;
          expires_at?: string | null;
          author_id?: string | null;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body_md?: string;
          category?: "ferie" | "formazione" | "generale" | "turni" | "urgente" | "vendite";
          audience?: "all" | "department" | "people";
          department_ids?: string[];
          profile_ids?: string[];
          pinned?: boolean;
          requires_ack?: boolean;
          attachments?: Json;
          publish_at?: string;
          expires_at?: string | null;
          author_id?: string | null;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: "delete" | "insert" | "update";
          entity: string;
          entity_id: string | null;
          diff: Json | null;
          at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: "delete" | "insert" | "update";
          entity: string;
          entity_id?: string | null;
          diff?: Json | null;
          at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: "delete" | "insert" | "update";
          entity?: string;
          entity_id?: string | null;
          diff?: Json | null;
          at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      daily_entries: {
        Row: {
          id: string;
          profile_id: string;
          date: string;
          kpi_id: string;
          value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          date: string;
          kpi_id: string;
          value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          date?: string;
          kpi_id?: string;
          value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_entries_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_entries_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      departments: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      employee_week_notes: {
        Row: {
          id: string;
          profile_id: string;
          week_start: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          week_start: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          week_start?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_week_notes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      extra_task_assignees: {
        Row: {
          task_id: string;
          profile_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          task_id: string;
          profile_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          task_id?: string;
          profile_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extra_task_assignees_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extra_task_assignees_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "extra_tasks";
            referencedColumns: ["id"];
          }
        ];
      };
      extra_tasks: {
        Row: {
          id: string;
          title: string;
          description_md: string;
          due_date: string | null;
          created_by: string | null;
          status: "cancelled" | "done" | "open";
          done_by: string | null;
          done_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description_md?: string;
          due_date?: string | null;
          created_by?: string | null;
          status?: "cancelled" | "done" | "open";
          done_by?: string | null;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description_md?: string;
          due_date?: string | null;
          created_by?: string | null;
          status?: "cancelled" | "done" | "open";
          done_by?: string | null;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extra_tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extra_tasks_done_by_fkey";
            columns: ["done_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      holidays: {
        Row: {
          id: string;
          date: string;
          label: string;
          store_closed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          label: string;
          store_closed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          label?: string;
          store_closed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kpi_definitions: {
        Row: {
          id: string;
          code: string;
          label: string;
          description: string | null;
          default_target_rule: Json | null;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          label: string;
          description?: string | null;
          default_target_rule?: Json | null;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          label?: string;
          description?: string | null;
          default_target_rule?: Json | null;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kpi_set_items: {
        Row: {
          set_id: string;
          kpi_id: string;
          label_override: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          set_id: string;
          kpi_id: string;
          label_override?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          set_id?: string;
          kpi_id?: string;
          label_override?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kpi_set_items_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpi_set_items_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "kpi_sets";
            referencedColumns: ["id"];
          }
        ];
      };
      kpi_sets: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leaves: {
        Row: {
          id: string;
          profile_id: string;
          date: string;
          type: "altro" | "ferie" | "malattia" | "permesso";
          hours: number | null;
          status: "confirmed" | "tentative";
          source: "planning" | "request";
          request_id: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          date: string;
          type?: "altro" | "ferie" | "malattia" | "permesso";
          hours?: number | null;
          status?: "confirmed" | "tentative";
          source?: "planning" | "request";
          request_id?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          date?: string;
          type?: "altro" | "ferie" | "malattia" | "permesso";
          hours?: number | null;
          status?: "confirmed" | "tentative";
          source?: "planning" | "request";
          request_id?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leaves_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leaves_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          }
        ];
      };
      login_attempts: {
        Row: {
          id: string;
          employee_code: string;
          ip: string | null;
          at: string;
          success: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_code: string;
          ip?: string | null;
          at?: string;
          success: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_code?: string;
          ip?: string | null;
          at?: string;
          success?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          kind: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          kind: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          kind?: string;
          title?: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      opening_exceptions: {
        Row: {
          id: string;
          date: string;
          open_time: string | null;
          close_time: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          open_time?: string | null;
          close_time?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          open_time?: string | null;
          close_time?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      performance_goals: {
        Row: {
          id: string;
          profile_id: string;
          period_id: string;
          pillar: "achievement" | "leadership";
          slot: number;
          title: string;
          objective: string;
          comment: string | null;
          progress: "in_corso" | "non_iniziato" | "non_raggiunto" | "raggiunto" | null;
          employee_note: string | null;
          private_note: string | null;
          published: boolean;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          period_id: string;
          pillar: "achievement" | "leadership";
          slot: number;
          title?: string;
          objective?: string;
          comment?: string | null;
          progress?: "in_corso" | "non_iniziato" | "non_raggiunto" | "raggiunto" | null;
          employee_note?: string | null;
          private_note?: string | null;
          published?: boolean;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          period_id?: string;
          pillar?: "achievement" | "leadership";
          slot?: number;
          title?: string;
          objective?: string;
          comment?: string | null;
          progress?: "in_corso" | "non_iniziato" | "non_raggiunto" | "raggiunto" | null;
          employee_note?: string | null;
          private_note?: string | null;
          published?: boolean;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_goals_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "performance_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_goals_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      performance_periods: {
        Row: {
          id: string;
          year: number;
          label: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          label: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          year?: number;
          label?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      planning_rule_sets: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      planning_rules: {
        Row: {
          id: string;
          rule_set_id: string;
          name: string;
          type: string;
          params: Json;
          days: number[];
          time_windows: Json;
          valid_from: string | null;
          valid_to: string | null;
          severity: "info" | "warning";
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rule_set_id: string;
          name: string;
          type: string;
          params?: Json;
          days?: number[];
          time_windows?: Json;
          valid_from?: string | null;
          valid_to?: string | null;
          severity?: "info" | "warning";
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          rule_set_id?: string;
          name?: string;
          type?: string;
          params?: Json;
          days?: number[];
          time_windows?: Json;
          valid_from?: string | null;
          valid_to?: string | null;
          severity?: "info" | "warning";
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planning_rules_rule_set_id_fkey";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "planning_rule_sets";
            referencedColumns: ["id"];
          }
        ];
      };
      planning_variables: {
        Row: {
          id: string;
          key: string;
          label: string;
          value: number;
          unit: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          label: string;
          value: number;
          unit?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          label?: string;
          value?: number;
          unit?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_departments: {
        Row: {
          profile_id: string;
          department_id: string;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          department_id: string;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          department_id?: string;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_departments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_departments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      profile_kpis: {
        Row: {
          profile_id: string;
          kpi_id: string;
          label_override: string | null;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          kpi_id: string;
          label_override?: string | null;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          kpi_id?: string;
          label_override?: string | null;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_kpis_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_kpis_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          display_name: string;
          employee_code: string;
          role: "admin" | "employee";
          weekly_hours: number | null;
          short_label: string | null;
          home_zone: "jolly" | "sole" | "vista";
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
          created_at: string;
          updated_at: string;
          ical_token: string;
          notification_prefs: Json;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          display_name: string;
          employee_code: string;
          role?: "admin" | "employee";
          weekly_hours?: number | null;
          short_label?: string | null;
          home_zone?: "jolly" | "sole" | "vista";
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
          created_at?: string;
          updated_at?: string;
          ical_token?: string;
          notification_prefs?: Json;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          display_name?: string;
          employee_code?: string;
          role?: "admin" | "employee";
          weekly_hours?: number | null;
          short_label?: string | null;
          home_zone?: "jolly" | "sole" | "vista";
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
          created_at?: string;
          updated_at?: string;
          ical_token?: string;
          notification_prefs?: Json;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          endpoint: string;
          keys: Json;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          keys: Json;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          endpoint?: string;
          keys?: Json;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      request_comments: {
        Row: {
          id: string;
          request_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_comments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "requests";
            referencedColumns: ["id"];
          }
        ];
      };
      requests: {
        Row: {
          id: string;
          profile_id: string;
          type: "altro" | "cambio_turno" | "ferie" | "giorno_libero" | "indisponibilita" | "malattia" | "permesso" | "scambio_turno";
          start_date: string;
          end_date: string;
          start_time: string | null;
          end_time: string | null;
          hours: number | null;
          recurring_weekdays: number[] | null;
          shift_id: string | null;
          target_profile_id: string | null;
          target_shift_id: string | null;
          message: string | null;
          attachment_path: string | null;
          status: "approved" | "cancelled" | "peer_accepted" | "peer_declined" | "pending" | "rejected";
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: "altro" | "cambio_turno" | "ferie" | "giorno_libero" | "indisponibilita" | "malattia" | "permesso" | "scambio_turno";
          start_date: string;
          end_date: string;
          start_time?: string | null;
          end_time?: string | null;
          hours?: number | null;
          recurring_weekdays?: number[] | null;
          shift_id?: string | null;
          target_profile_id?: string | null;
          target_shift_id?: string | null;
          message?: string | null;
          attachment_path?: string | null;
          status?: "approved" | "cancelled" | "peer_accepted" | "peer_declined" | "pending" | "rejected";
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          type?: "altro" | "cambio_turno" | "ferie" | "giorno_libero" | "indisponibilita" | "malattia" | "permesso" | "scambio_turno";
          start_date?: string;
          end_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          hours?: number | null;
          recurring_weekdays?: number[] | null;
          shift_id?: string | null;
          target_profile_id?: string | null;
          target_shift_id?: string | null;
          message?: string | null;
          attachment_path?: string | null;
          status?: "approved" | "cancelled" | "peer_accepted" | "peer_declined" | "pending" | "rejected";
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_target_profile_id_fkey";
            columns: ["target_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_target_shift_id_fkey";
            columns: ["target_shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          }
        ];
      };
      responsibilities: {
        Row: {
          id: string;
          title: string;
          description_md: string;
          schedule_days: number[];
          all_staff: boolean;
          attachments: Json;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description_md?: string;
          schedule_days?: number[];
          all_staff?: boolean;
          attachments?: Json;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description_md?: string;
          schedule_days?: number[];
          all_staff?: boolean;
          attachments?: Json;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      responsibility_assignees: {
        Row: {
          responsibility_id: string;
          profile_id: string;
          role: "owner" | "support";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          responsibility_id: string;
          profile_id: string;
          role: "owner" | "support";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          responsibility_id?: string;
          profile_id?: string;
          role?: "owner" | "support";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responsibility_assignees_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responsibility_assignees_responsibility_id_fkey";
            columns: ["responsibility_id"];
            isOneToOne: false;
            referencedRelation: "responsibilities";
            referencedColumns: ["id"];
          }
        ];
      };
      responsibility_checks: {
        Row: {
          id: string;
          responsibility_id: string;
          date: string;
          done_by: string | null;
          done_at: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          responsibility_id: string;
          date: string;
          done_by?: string | null;
          done_at?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          responsibility_id?: string;
          date?: string;
          done_by?: string | null;
          done_at?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responsibility_checks_done_by_fkey";
            columns: ["done_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responsibility_checks_responsibility_id_fkey";
            columns: ["responsibility_id"];
            isOneToOne: false;
            referencedRelation: "responsibilities";
            referencedColumns: ["id"];
          }
        ];
      };
      rule_overrides: {
        Row: {
          id: string;
          week_id: string;
          rule_id: string;
          date: string | null;
          note: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          week_id: string;
          rule_id: string;
          date?: string | null;
          note: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          week_id?: string;
          rule_id?: string;
          date?: string | null;
          note?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rule_overrides_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rule_overrides_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "planning_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rule_overrides_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "schedule_weeks";
            referencedColumns: ["id"];
          }
        ];
      };
      schedule_templates: {
        Row: {
          id: string;
          name: string;
          shifts: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          shifts?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          shifts?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      schedule_weeks: {
        Row: {
          id: string;
          week_start: string;
          status: "draft" | "published";
          published_at: string | null;
          published_by: string | null;
          version: number;
          note: string | null;
          rule_set_id: string | null;
          published_shifts: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          status?: "draft" | "published";
          published_at?: string | null;
          published_by?: string | null;
          version?: number;
          note?: string | null;
          rule_set_id?: string | null;
          published_shifts?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          week_start?: string;
          status?: "draft" | "published";
          published_at?: string | null;
          published_by?: string | null;
          version?: number;
          note?: string | null;
          rule_set_id?: string | null;
          published_shifts?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_weeks_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_weeks_rule_set_id_fkey";
            columns: ["rule_set_id"];
            isOneToOne: false;
            referencedRelation: "planning_rule_sets";
            referencedColumns: ["id"];
          }
        ];
      };
      shift_changes: {
        Row: {
          id: string;
          shift_id: string | null;
          profile_id: string;
          date: string;
          before: Json | null;
          after: Json | null;
          changed_by: string | null;
          changed_at: string;
          notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shift_id?: string | null;
          profile_id: string;
          date: string;
          before?: Json | null;
          after?: Json | null;
          changed_by?: string | null;
          changed_at?: string;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shift_id?: string | null;
          profile_id?: string;
          date?: string;
          before?: Json | null;
          after?: Json | null;
          changed_by?: string | null;
          changed_at?: string;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_changes_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_changes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      shift_templates: {
        Row: {
          id: string;
          code: string;
          label: string;
          start_time: string | null;
          end_time: string | null;
          break_minutes: number;
          is_absence: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          label: string;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number;
          is_absence?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          label?: string;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number;
          is_absence?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          id: string;
          week_id: string;
          profile_id: string;
          date: string;
          template_id: string | null;
          start_time: string | null;
          end_time: string | null;
          break_minutes: number;
          working_as_department_id: string | null;
          zone: "sole" | "vista" | null;
          is_back_office: boolean | null;
          note: string | null;
          conflict: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          week_id: string;
          profile_id: string;
          date: string;
          template_id?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number;
          working_as_department_id?: string | null;
          zone?: "sole" | "vista" | null;
          is_back_office?: boolean | null;
          note?: string | null;
          conflict?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          week_id?: string;
          profile_id?: string;
          date?: string;
          template_id?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number;
          working_as_department_id?: string | null;
          zone?: "sole" | "vista" | null;
          is_back_office?: boolean | null;
          note?: string | null;
          conflict?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "shift_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "schedule_weeks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_working_as_department_id_fkey";
            columns: ["working_as_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          }
        ];
      };
      store_settings: {
        Row: {
          id: boolean;
          store_name: string;
          opening_hours: Json;
          request_notice_days: number;
          logo_path: string | null;
          created_at: string;
          updated_at: string;
          leave_thresholds: Json;
          share_individual_monitoring: boolean;
        };
        Insert: {
          id?: boolean;
          store_name?: string;
          opening_hours?: Json;
          request_notice_days?: number;
          logo_path?: string | null;
          created_at?: string;
          updated_at?: string;
          leave_thresholds?: Json;
          share_individual_monitoring?: boolean;
        };
        Update: {
          id?: boolean;
          store_name?: string;
          opening_hours?: Json;
          request_notice_days?: number;
          logo_path?: string | null;
          created_at?: string;
          updated_at?: string;
          leave_thresholds?: Json;
          share_individual_monitoring?: boolean;
        };
        Relationships: [];
      };
      store_weekly_targets: {
        Row: {
          id: string;
          week_start: string;
          total_hours: number | null;
          vista_value_eur: number | null;
          vista_avg_price: number | null;
          vista_wo: number | null;
          sole_pieces: number | null;
          sole_value_eur: number | null;
          sole_avg_price: number | null;
          notes: string | null;
          confirmed_at: string | null;
          best_performer_id: string | null;
          best_performer_confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          total_hours?: number | null;
          vista_value_eur?: number | null;
          vista_avg_price?: number | null;
          vista_wo?: number | null;
          sole_pieces?: number | null;
          sole_value_eur?: number | null;
          sole_avg_price?: number | null;
          notes?: string | null;
          confirmed_at?: string | null;
          best_performer_id?: string | null;
          best_performer_confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          week_start?: string;
          total_hours?: number | null;
          vista_value_eur?: number | null;
          vista_avg_price?: number | null;
          vista_wo?: number | null;
          sole_pieces?: number | null;
          sole_value_eur?: number | null;
          sole_avg_price?: number | null;
          notes?: string | null;
          confirmed_at?: string | null;
          best_performer_id?: string | null;
          best_performer_confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_weekly_targets_best_performer_id_fkey";
            columns: ["best_performer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      weekly_comments: {
        Row: {
          id: string;
          profile_id: string;
          week_start: string;
          kpi_id: string | null;
          body: string;
          author_id: string | null;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          week_start: string;
          kpi_id?: string | null;
          body?: string;
          author_id?: string | null;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          week_start?: string;
          kpi_id?: string | null;
          body?: string;
          author_id?: string | null;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_comments_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_comments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      weekly_targets: {
        Row: {
          id: string;
          profile_id: string;
          week_start: string;
          kpi_id: string;
          target: number;
          overridden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          week_start: string;
          kpi_id: string;
          target: number;
          overridden?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          week_start?: string;
          kpi_id?: string;
          target?: number;
          overridden?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_targets_kpi_id_fkey";
            columns: ["kpi_id"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_targets_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      leaves_public: {
        Row: {
          profile_id: string | null;
          date: string | null;
          status: string | null;
          source: string | null;
          kind: string | null;
        };
        Relationships: [];
      };
      monitoring_weekly_by_person: {
        Row: {
          week_start: string | null;
          profile_id: string | null;
          kpi_id: string | null;
          total: number | null;
        };
        Relationships: [];
      };
      my_performance_goals: {
        Row: {
          id: string | null;
          profile_id: string | null;
          period_id: string | null;
          pillar: string | null;
          slot: number | null;
          title: string | null;
          objective: string | null;
          comment: string | null;
          progress: string | null;
          employee_note: string | null;
          published_at: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
      public_profiles: {
        Row: {
          id: string | null;
          display_name: string | null;
          short_label: string | null;
          color: string | null;
          avatar_url: string | null;
          home_zone: string | null;
          active: boolean | null;
          sort_order: number | null;
          primary_department_id: string | null;
          department_ids: string[] | null;
        };
        Relationships: [];
      };
      published_shifts: {
        Row: {
          week_id: string | null;
          week_start: string | null;
          version: number | null;
          id: string | null;
          profile_id: string | null;
          date: string | null;
          start_time: string | null;
          end_time: string | null;
          break_minutes: number | null;
          template_code: string | null;
          template_label: string | null;
          is_absence: boolean | null;
          zone: string | null;
          is_back_office: boolean | null;
          department_id: string | null;
          note: string | null;
          changed: boolean | null;
        };
        Relationships: [];
      };
      store_weekly_totals: {
        Row: {
          week_start: string | null;
          kpi_id: string | null;
          total: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      cancel_request: { Args: { p_request_id: string }; Returns: undefined };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_responsibility_assignee: { Args: { p_responsibility_id: string; uid: string }; Returns: boolean };
      respond_to_swap: { Args: { p_request_id: string; p_accept: boolean }; Returns: undefined };
      set_extra_task_done: { Args: { p_task_id: string; p_done: boolean }; Returns: undefined };
      set_performance_note: { Args: { p_goal_id: string; p_note: string }; Returns: undefined };
      today_rome: { Args: Record<PropertyKey, never>; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
