import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export interface RetrievedDocument {
  id: string;
  title: string;
  category: string;
  content: string;
  source_name: string;
  source_url: string | null;
  relevance_score: number;
}

export interface RetrieveKnowledgeOptions {
  limit?: number;
  minScore?: number;
  category?: string | null;
}

export interface RetrievalResult {
  documents: RetrievedDocument[];
  rpcAvailable: boolean;
  durationMs: number;
}

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 3;
const MAX_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0.03;

const ARABIC_SYNONYMS: Record<string, string[]> = {
  التزام: ['الالتزام', 'عودة', 'منتظم', 'انقطاع'],
  خطة: ['الخطة', 'برنامج', 'توصية'],
  طاقة: ['طاقتي', 'إرهاق', 'تعب', 'تعاف'],
  تمرين: ['تمارين', 'جلسة', 'نشاط', 'لياقة'],
  إحماء: ['الإحماء', 'تهيئة', 'إعداد'],
};

function clampLimit(limit?: number): number {
  const value = limit ?? DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(value, MAX_LIMIT));
}

export function normalizeSearchQuery(query: string): string {
  return query
    .replace(/[؟?!.,،:;()[\]{}«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandQueryTerms(query: string): string {
  const normalized = normalizeSearchQuery(query);
  const tokens = normalized.split(' ').filter((token) => token.length >= 2);
  const extras = new Set<string>();

  for (const token of tokens) {
    for (const [key, values] of Object.entries(ARABIC_SYNONYMS)) {
      if (token.includes(key) || values.some((value) => token.includes(value))) {
        extras.add(key);
        values.forEach((value) => extras.add(value));
      }
    }
  }

  return [normalized, ...extras].join(' ').trim();
}

function mapRow(row: Record<string, unknown>): RetrievedDocument {
  return {
    id: String(row.id),
    title: String(row.title),
    category: String(row.category),
    content: String(row.content),
    source_name: String(row.source_name),
    source_url: row.source_url ? String(row.source_url) : null,
    relevance_score: Number(row.relevance_score ?? row.score ?? 0),
  };
}

function dedupeDocuments(documents: RetrievedDocument[]): RetrievedDocument[] {
  const seen = new Set<string>();
  const merged: RetrievedDocument[] = [];

  for (const doc of documents.sort((a, b) => b.relevance_score - a.relevance_score)) {
    const key = `${doc.title}::${doc.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(doc);
  }

  return merged.slice(0, MAX_LIMIT);
}

export async function retrieveKnowledge(
  supabaseAdmin: SupabaseClient,
  query: string,
  options: RetrieveKnowledgeOptions = {},
): Promise<RetrievalResult> {
  const startedAt = Date.now();
  const limit = clampLimit(options.limit);
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const category = options.category ?? null;
  const expandedQuery = expandQueryTerms(query);

  if (expandedQuery.length === 0) {
    return { documents: [], rpcAvailable: true, durationMs: 0 };
  }

  const { data, error } = await supabaseAdmin.rpc('search_knowledge_documents', {
    search_query: expandedQuery,
    category_filter: category,
    result_limit: limit,
    min_score: minScore,
  });

  const durationMs = Date.now() - startedAt;

  if (error) {
    console.error('[retrieval] search failed', {
      code: error.code,
      category: category ?? 'all',
      durationMs,
    });
    return { documents: [], rpcAvailable: error.code !== 'PGRST202', durationMs };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  console.info('[retrieval] results', {
    count: rows.length,
    category: category ?? 'all',
    durationMs,
  });

  return {
    documents: rows.slice(0, MAX_LIMIT).map(mapRow),
    rpcAvailable: true,
    durationMs,
  };
}

export async function retrieveKnowledgeForIntent(
  supabaseAdmin: SupabaseClient,
  query: string,
  categories: string[],
): Promise<RetrievalResult> {
  const startedAt = Date.now();
  const expandedQuery = expandQueryTerms(query);

  if (expandedQuery.length === 0) {
    return { documents: [], rpcAvailable: true, durationMs: 0 };
  }

  const collected: RetrievedDocument[] = [];
  let rpcAvailable = true;

  if (categories.length === 0) {
    return retrieveKnowledge(supabaseAdmin, query, { limit: MAX_LIMIT });
  }

  for (const category of categories) {
    const result = await retrieveKnowledge(supabaseAdmin, query, {
      limit: MAX_LIMIT,
      category,
      minScore: 0.02,
    });
    rpcAvailable = rpcAvailable && result.rpcAvailable;
    collected.push(...result.documents);
  }

  const broad = await retrieveKnowledge(supabaseAdmin, query, { limit: MAX_LIMIT, minScore: 0.02 });
  rpcAvailable = rpcAvailable && broad.rpcAvailable;
  collected.push(...broad.documents);

  return {
    documents: dedupeDocuments(collected),
    rpcAvailable,
    durationMs: Date.now() - startedAt,
  };
}

export function mapIntentToCategories(intent: string, message: string): string[] {
  const text = message.toLowerCase();

  switch (intent) {
    case 'medical_boundary':
    case 'safety':
      return ['إشارات تستدعي إيقاف التمرين', 'السلامة أثناء التمرين'];
    case 'exercise_explanation':
      return ['تمارين القوة', 'الإحماء', 'المرونة'];
    case 'nutrition_general':
      return ['التغذية العامة'];
    case 'motivation_and_adherence':
      if (/أرجع|أعود|منتظم|انقطاع|أسبوع\s*سي/.test(text)) {
        return ['الالتزام', 'تمارين القوة', 'الراحة والتعافي', 'شدة التمرين'];
      }
      return ['الالتزام', 'التدريب للمبتدئين'];
    case 'recovery_and_fatigue':
      return ['الراحة والتعافي', 'النوم', 'شدة التمرين', 'آلام العضلات الطبيعية'];
    case 'fitness_general':
      if (/إحماء/.test(text)) return ['الإحماء'];
      if (/كارديو/.test(text)) return ['الكارديو'];
      if (/مرونة|تمدد/.test(text)) return ['المرونة'];
      return ['الإحماء', 'التهدئة', 'الكارديو'];
    case 'plan_question':
    case 'progress_analysis':
    case 'open_question':
      if (/أرجع|أعود|منتظم|التزام/.test(text)) {
        return ['الالتزام', 'تمارين القوة', 'الراحة والتعافي', 'شدة التمرين'];
      }
      if (/طاق|تعب|إجهاد/.test(text)) {
        return ['الراحة والتعافي', 'النوم', 'شدة التمرين'];
      }
      return ['الالتزام', 'الراحة والتعافي', 'شدة التمرين'];
    default:
      return [];
  }
}

export function mapIntentToCategory(intent: string): string | null {
  const categories = mapIntentToCategories(intent, '');
  return categories[0] ?? null;
}

export function toAgentSources(documents: RetrievedDocument[]) {
  return documents.map((doc) => ({
    title: doc.title,
    category: doc.category,
    source_name: doc.source_name,
  }));
}
