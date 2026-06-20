import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AssessmentCompactCard } from '../components/dashboard/AssessmentCompactCard';
import {
  DashboardAnalyticsEmptyState,
  DashboardCharts,
} from '../components/dashboard/DashboardCharts';
import { DashboardKpiCards } from '../components/dashboard/DashboardKpiCards';
import { RecommendationActions } from '../components/dashboard/RecommendationActions';
import { RecommendationSection } from '../components/dashboard/RecommendationSection';
import { WeeklyCheckinCard } from '../components/dashboard/WeeklyCheckinCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import {
  createAiRecommendationForLatestAssessment,
  ensureMockRecommendation,
  FETCH_ERROR_MESSAGE,
  loadDashboardData,
  RecommendationServiceError,
} from '../services/recommendations/recommendationService';
import {
  CheckinServiceError,
  getCurrentWeekCheckin,
  getRecentCheckins,
} from '../services/checkins/checkinService';
import type { WeeklyCheckin } from '../types/checkin';
import type { Assessment, Recommendation } from '../types/recommendation';

function LoadingSkeleton() {
  return (
    <Container className="py-6 md:py-8">
      <div className="mb-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-neutral-200" />
        <div className="mt-2 h-4 w-64 rounded bg-neutral-100" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="h-20 animate-pulse bg-neutral-50">
            <span className="sr-only">تحميل</span>
          </Card>
        ))}
      </div>
      <Card className="mt-3 h-40 animate-pulse bg-neutral-50">
        <span className="sr-only">تحميل</span>
      </Card>
      <p className="mt-4 text-center text-sm text-neutral-500">جاري تحميل بياناتك…</p>
    </Container>
  );
}

export function DashboardPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [checkin, setCheckin] = useState<WeeklyCheckin | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<WeeklyCheckin[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [aiRecommendationFailed, setAiRecommendationFailed] = useState(false);
  const creatingRef = useRef(false);

  const userId = session?.user?.id;

  const fetchData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError('');

    try {
      const [data, weekCheckin, history] = await Promise.all([
        loadDashboardData(userId),
        getCurrentWeekCheckin(userId),
        getRecentCheckins(userId, 8),
      ]);
      setAssessment(data.assessment);
      setRecommendation(data.recommendation);
      setCheckin(weekCheckin);
      setRecentCheckins(history);
    } catch (err) {
      const message =
        err instanceof CheckinServiceError
          ? err.message
          : err instanceof RecommendationServiceError
            ? err.message
            : FETCH_ERROR_MESSAGE;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId, fetchData]);

  const handleCreateRecommendation = async () => {
    if (!userId || !assessment || creatingRef.current) return;

    creatingRef.current = true;
    setIsCreating(true);
    setAiRecommendationFailed(false);
    setError('');

    try {
      const result = await createAiRecommendationForLatestAssessment(userId);
      setAssessment(result.assessment);
      setRecommendation(result.recommendation);
    } catch {
      setAiRecommendationFailed(true);
      setError('تعذر إنشاء التوصية الذكية. حاول مرة أخرى أو استخدم توصية تجريبية مؤقتة.');
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  const handleMockFallback = async () => {
    if (!assessment || creatingRef.current) return;

    creatingRef.current = true;
    setIsCreating(true);
    setError('');

    try {
      const mockRecommendation = await ensureMockRecommendation(assessment);
      setRecommendation(mockRecommendation);
      setAiRecommendationFailed(false);
    } catch {
      setError('تعذر حفظ التوصية التجريبية. حاول مرة أخرى.');
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error && !assessment) {
    return (
      <Container className="py-6 md:py-8">
        <Card className="p-4 text-center">
          <h1 className="text-xl font-bold">لوحة التحكم</h1>
          <p className="mt-3 text-neutral-600">{error}</p>
          <Button className="mt-4" onClick={fetchData}>
            إعادة المحاولة
          </Button>
        </Card>
      </Container>
    );
  }

  if (!assessment) {
    return (
      <Container className="py-6 md:py-8">
        <Card className="p-4 text-center">
          <h1 className="text-2xl font-bold">ابدأ رحلتك مع VibeFit</h1>
          <p className="mt-2 text-neutral-600">
            أكمل التقييم الرياضي للحصول على توصية تجريبية مخصّصة لك.
          </p>
          <Link to="/assessment" className="mt-4 inline-block">
            <Button>ابدأ التقييم</Button>
          </Link>
        </Card>
      </Container>
    );
  }

  const hasCheckinHistory = recentCheckins.length > 0;

  return (
    <Container className="py-4 md:py-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary-600">VibeFit</p>
          <h1 className="text-xl font-bold md:text-2xl">لوحة التحكم</h1>
          <p className="mt-0.5 text-xs text-neutral-500">مرحبًا بك — تابع تقدّمك وتوصيتك</p>
        </div>
        <Link to="/check-in" className="shrink-0">
          <Button size="sm">تسجيل المتابعة</Button>
        </Link>
      </div>

      {error && (
        <Card className="mb-3 border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={fetchData}>
            إعادة المحاولة
          </Button>
        </Card>
      )}

      <div className="space-y-2.5">
        {!recommendation ? (
          <RecommendationActions
            loading={isCreating}
            aiFailed={aiRecommendationFailed}
            onGenerateAi={handleCreateRecommendation}
            onUseMockFallback={handleMockFallback}
          />
        ) : (
          <RecommendationSection recommendation={recommendation} />
        )}

        {hasCheckinHistory ? (
          <>
            <DashboardKpiCards currentCheckin={checkin} recentCheckins={recentCheckins} />
            <DashboardCharts checkins={recentCheckins} />
          </>
        ) : (
          <DashboardAnalyticsEmptyState />
        )}

        <WeeklyCheckinCard checkin={checkin} />

        <AssessmentCompactCard assessment={assessment} />
      </div>
    </Container>
  );
}
