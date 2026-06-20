export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          updated_at?: string;
        };
      };
      assessments: {
        Row: {
          id: string;
          user_id: string;
          age: number;
          gender: string | null;
          height_cm: number;
          weight_kg: number;
          activity_level: string;
          primary_goal: string;
          experience_level: string;
          training_days_per_week: number;
          session_duration_minutes: number;
          training_location: string;
          equipment: string;
          constraints_notes: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          age: number;
          gender?: string | null;
          height_cm: number;
          weight_kg: number;
          activity_level: string;
          primary_goal: string;
          experience_level: string;
          training_days_per_week: number;
          session_duration_minutes: number;
          training_location: string;
          equipment: string;
          constraints_notes?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: never;
      };
      recommendations: {
        Row: {
          id: string;
          user_id: string;
          assessment_id: string;
          summary: string;
          weekly_plan: WeeklyPlanItemJson[];
          nutrition_notes: string[];
          safety_notes: string[];
          generation_type: string;
          model_name: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          assessment_id: string;
          summary: string;
          weekly_plan: WeeklyPlanItemJson[];
          nutrition_notes: string[];
          safety_notes: string[];
          generation_type?: string;
          model_name?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          updated_at?: string;
        };
      };
      weekly_checkins: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          planned_sessions: number;
          completed_sessions: number;
          adherence_rate: number;
          energy_level: number;
          difficulty_level: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          planned_sessions: number;
          completed_sessions: number;
          adherence_rate: number;
          energy_level: number;
          difficulty_level: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          planned_sessions?: number;
          completed_sessions?: number;
          adherence_rate?: number;
          energy_level?: number;
          difficulty_level?: number;
          notes?: string | null;
          updated_at?: string;
        };
      };
      knowledge_documents: {
        Row: {
          id: string;
          title: string;
          category: string;
          content: string;
          source_name: string;
          source_url: string | null;
          chunk_index: number;
          metadata: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      agent_conversations: {
        Row: {
          id: string;
          user_id: string | null;
          channel: string;
          external_sender_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      agent_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          intent: string | null;
          used_rag: boolean;
          used_personal_data: boolean;
          sources: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
      };
      agent_runs: {
        Row: {
          id: string;
          conversation_id: string | null;
          user_id: string | null;
          channel: string;
          status: string;
          intent: string | null;
          retrieved_documents_count: number;
          model_name: string | null;
          error_code: string | null;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
      };
    };
  };
}

export interface WeeklyPlanItemJson {
  day: string;
  focus: string;
  duration_minutes: number;
  notes: string;
  exercises?: ExerciseItemJson[];
}

export interface ExerciseItemJson {
  name: string;
  sets: string;
  repetitions: string;
  rest_seconds: number;
  notes: string;
}
