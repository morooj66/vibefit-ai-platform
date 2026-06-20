import type { AssessmentFormData } from '../pages/AssessmentPage';
import type { Database } from '../types/database';
import { supabase } from './supabase';
import { logSupabaseError } from './supabaseDebug';

type AssessmentInsert = Database['public']['Tables']['assessments']['Insert'];

export function mapAssessmentFormToInsert(
  data: AssessmentFormData,
  userId: string,
): AssessmentInsert {
  return {
    user_id: userId,
    age: Number(data.age),
    gender: data.gender || null,
    height_cm: Number(data.height),
    weight_kg: Number(data.weight),
    activity_level: data.activityLevel,
    primary_goal: data.goal,
    experience_level: data.experienceLevel,
    training_days_per_week: Number(data.trainingDaysPerWeek),
    session_duration_minutes: Number(data.sessionDuration),
    training_location: data.trainingLocation,
    equipment: data.equipment,
    constraints_notes: data.constraints.trim() || null,
    notes: data.notes.trim() || null,
  };
}

export async function saveAssessment(data: AssessmentFormData) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('يجب تسجيل الدخول لحفظ التقييم');
  }

  const { error } = await supabase.from('assessments').insert(
    mapAssessmentFormToInsert(data, user.id),
  );

  if (error) {
    logSupabaseError('assessments.insert', error);
    throw new Error('تعذّر حفظ التقييم. حاول مرة أخرى.');
  }
}

export async function getLatestAssessment() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError('assessments.selectLatest', error);
    throw new Error('تعذّر تحميل التقييم');
  }

  return data;
}

export async function userHasAssessment(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { count, error } = await supabase
    .from('assessments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (error) return false;

  return (count ?? 0) > 0;
}

export async function getPostLoginPath(): Promise<string> {
  const hasAssessment = await userHasAssessment();
  return hasAssessment ? '/dashboard' : '/assessment';
}
