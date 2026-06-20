export interface WeeklyCheckin {
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
}

export interface SaveWeeklyCheckinPayload {
  userId: string;
  planned_sessions: number;
  completed_sessions: number;
  energy_level: number;
  difficulty_level: number;
  notes?: string | null;
}
