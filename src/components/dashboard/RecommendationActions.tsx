import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  AI_ERROR_MESSAGE,
  MOCK_CONSENT_MESSAGE,
} from '../../services/recommendations/recommendationService';

interface RecommendationActionsProps {
  loading: boolean;
  aiFailed: boolean;
  onGenerateAi: () => void;
  onUseMockFallback: () => void;
}

export function RecommendationActions({
  loading,
  aiFailed,
  onGenerateAi,
  onUseMockFallback,
}: RecommendationActionsProps) {
  if (aiFailed) {
    return (
      <Card className="p-4">
        <p className="text-sm text-neutral-700">{AI_ERROR_MESSAGE}</p>
        <p className="mt-2 text-sm text-neutral-600">{MOCK_CONSENT_MESSAGE}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button size="sm" onClick={onGenerateAi} disabled={loading}>
            {loading ? 'جاري إعداد التوصية…' : 'إعادة المحاولة'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onUseMockFallback}
            disabled={loading}
          >
            {loading ? 'جاري الحفظ…' : 'استخدام توصية تجريبية مؤقتة'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 text-center">
      <p className="text-sm text-neutral-600">لم يتم إعداد التوصية بعد.</p>
      <Button className="mt-3" size="sm" onClick={onGenerateAi} disabled={loading}>
        {loading ? 'جاري إعداد توصيتك الذكية…' : 'إعداد التوصية الذكية'}
      </Button>
    </Card>
  );
}
