import { z } from 'npm:zod@3.23.8';

export const exerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.string().min(1),
  repetitions: z.string().min(1),
  rest_seconds: z.number().int().min(0),
  notes: z.string(),
});

export const weeklyPlanDaySchema = z.object({
  day: z.string().min(1),
  focus: z.string().min(1),
  duration_minutes: z.number().int().min(1),
  exercises: z.array(exerciseSchema).min(1),
  notes: z.string(),
});

export const recommendationOutputSchema = z.object({
  summary: z.string().min(1),
  weekly_plan: z.array(weeklyPlanDaySchema).min(1),
  nutrition_notes: z.array(z.string().min(1)).min(1),
  safety_notes: z.array(z.string().min(1)).min(1),
});

export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

export interface AssessmentContext {
  training_days_per_week: number;
  session_duration_minutes: number;
}

export function validateRecommendationForAssessment(
  data: unknown,
  assessment: AssessmentContext,
): RecommendationOutput {
  const parsed = recommendationOutputSchema.parse(data);

  if (parsed.weekly_plan.length !== assessment.training_days_per_week) {
    throw new Error(
      `weekly_plan must contain exactly ${assessment.training_days_per_week} days`,
    );
  }

  for (const day of parsed.weekly_plan) {
    if (day.duration_minutes > assessment.session_duration_minutes) {
      throw new Error(
        `duration_minutes exceeds session limit (${assessment.session_duration_minutes})`,
      );
    }

    if (day.exercises.length === 0) {
      throw new Error('each day must include at least one exercise');
    }
  }

  return parsed;
}

export const openAiJsonSchema = {
  name: 'fitness_recommendation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'weekly_plan', 'nutrition_notes', 'safety_notes'],
    properties: {
      summary: { type: 'string' },
      weekly_plan: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['day', 'focus', 'duration_minutes', 'exercises', 'notes'],
          properties: {
            day: { type: 'string' },
            focus: { type: 'string' },
            duration_minutes: { type: 'integer', minimum: 1 },
            exercises: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'sets', 'repetitions', 'rest_seconds', 'notes'],
                properties: {
                  name: { type: 'string' },
                  sets: { type: 'string' },
                  repetitions: { type: 'string' },
                  rest_seconds: { type: 'integer', minimum: 0 },
                  notes: { type: 'string' },
                },
              },
            },
            notes: { type: 'string' },
          },
        },
      },
      nutrition_notes: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
      },
      safety_notes: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
      },
    },
  },
} as const;
