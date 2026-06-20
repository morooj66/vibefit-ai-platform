import type { Database } from './database';

export type Assessment = Database['public']['Tables']['assessments']['Row'];
export type Recommendation = Database['public']['Tables']['recommendations']['Row'];

export interface ExerciseItem {
  name: string;
  sets: string;
  repetitions: string;
  rest_seconds: number;
  notes: string;
}

export interface WeeklyPlanItem {
  day: string;
  focus: string;
  duration_minutes: number;
  notes: string;
  exercises?: ExerciseItem[];
}

export interface MockRecommendationResult {
  summary: string;
  weekly_plan: WeeklyPlanItem[];
  nutrition_notes: string[];
  safety_notes: string[];
}

export interface DashboardData {
  assessment: Assessment;
  recommendation: Recommendation | null;
}

export type GenerationType = 'ai' | 'mock';

export function getGenerationTypeLabel(type: string): string {
  return type === 'ai' ? 'توصية ذكية' : 'توصية تجريبية';
}
