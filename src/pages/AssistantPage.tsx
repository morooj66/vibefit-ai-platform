import { useCallback, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import { stripMarkdown } from '../lib/formatAgentText';
import {
  AGENT_ERROR_MESSAGE,
  AgentServiceError,
  sendAgentMessage,
} from '../services/agent/agentService';
import {
  AGENT_SUGGESTED_PROMPTS,
  getIntentLabel,
  normalizeAgentResponse,
  type AgentChatMessage,
  type AgentStructuredResponse,
} from '../types/agent';

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRecommendedActions(response: AgentStructuredResponse): string[] {
  return normalizeAgentResponse(response).recommended_actions.slice(0, 4);
}

function ResponseBadges({ response }: { response: AgentStructuredResponse }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {response.used_rag && (
        <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700">
          استخدم قاعدة المعرفة
        </span>
      )}
      {response.used_personal_data && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
          استخدم بياناتك
        </span>
      )}
      {!response.used_rag && !response.used_personal_data && (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
          إجابة عامة
        </span>
      )}
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
        {getIntentLabel(response.intent)}
      </span>
    </div>
  );
}

function AssistantAnswerCard({ response }: { response: AgentStructuredResponse }) {
  const actions = getRecommendedActions(response);
  const answer = stripMarkdown(response.answer);
  const insights =
    response.used_personal_data && response.insights.length > 0
      ? response.insights.slice(0, 3).map((item) => stripMarkdown(item))
      : [];

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">{answer}</p>

      {actions.length > 0 && (
        <Card className="border border-primary-200 bg-primary-50 p-3">
          <p className="text-xs font-semibold text-primary-800">خطوات عملية</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-primary-900">
            {actions.map((action) => (
              <li key={action} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{stripMarkdown(action)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {insights.length > 0 && (
        <Card className="border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-xs font-semibold text-blue-900">ملاحظات من بياناتك</p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-blue-950">
            {insights.map((insight) => (
              <li key={insight} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {response.sources.length > 0 && (
        <details className="rounded-lg border border-neutral-100 bg-neutral-50 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">
            المصادر ({Math.min(response.sources.length, 3)})
          </summary>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-neutral-600">
            {response.sources.slice(0, 3).map((source) => (
              <li key={`${source.title}-${source.category}`}>
                {source.title} — {source.category}
              </li>
            ))}
          </ul>
        </details>
      )}

      {response.safety_notice && (
        <Card className="border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs leading-5 text-amber-900">{stripMarkdown(response.safety_notice)}</p>
        </Card>
      )}

      <ResponseBadges response={response} />
    </div>
  );
}

export function AssistantPage() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const handleSend = async (text: string, options?: { isRetry?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError('');
    setCanRetry(false);
    setLoading(true);

    if (!options?.isRetry) {
      const userMessage: AgentChatMessage = {
        id: createMessageId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      scrollToBottom();
    }

    try {
      const result = await sendAgentMessage(trimmed, conversationIdRef.current);
      conversationIdRef.current = result.conversationId;

      const assistantMessage: AgentChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: result.response.answer,
        response: result.response,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      scrollToBottom();
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : AGENT_ERROR_MESSAGE;
      setError(message);
      setCanRetry(true);
    } finally {
      setLoading(false);
    }
  };

  const retryLast = () => {
    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
    if (!lastUserMessage) return;
    void handleSend(lastUserMessage.content, { isRetry: true });
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void handleSend(input);
  };

  return (
    <Container className="flex min-h-[calc(100vh-8rem)] flex-col py-4 md:py-6">
      <div className="mb-3">
        <p className="text-xs font-semibold text-primary-600">VibeFit</p>
        <h1 className="text-xl font-bold md:text-2xl">مساعد VibeFit الذكي</h1>
        <p className="mt-1 text-xs text-neutral-500">
          اسأل عن خطتك، التزامك، أو إرشادات التمرين. الإجابات عامة وليست تشخيصًا طبيًا.
        </p>
      </div>

      {messages.length === 0 && (
        <Card className="mb-3 p-3">
          <p className="text-xs font-medium text-neutral-700">اقتراحات جاهزة</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AGENT_SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void handleSend(prompt)}
                disabled={loading}
                className="rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-xs text-neutral-700 hover:border-primary-300 hover:bg-primary-50 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div
        ref={listRef}
        className="min-h-[18rem] flex-1 space-y-4 overflow-y-auto rounded-xl border border-neutral-100 bg-neutral-0 p-3 md:min-h-[24rem]"
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-400">ابدأ محادثة مع المساعد</p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={[
              'w-full max-w-[95%] rounded-2xl px-4 py-3 shadow-sm',
              message.role === 'user'
                ? 'ms-auto bg-primary-500 text-neutral-0'
                : 'me-auto border border-neutral-100 bg-neutral-50 text-neutral-800',
            ].join(' ')}
          >
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
            ) : (
              message.response && <AssistantAnswerCard response={message.response} />
            )}
          </div>
        ))}

        {loading && (
          <div className="me-auto max-w-[95%] rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
            <p className="text-xs text-neutral-500">جاري تحضير الإجابة…</p>
          </div>
        )}
      </div>

      {error && (
        <Card className="mt-2 border border-red-200 bg-red-50 p-2">
          <p className="text-xs text-red-700">{error}</p>
          {canRetry && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={retryLast} disabled={loading}>
              إعادة المحاولة
            </Button>
          )}
        </Card>
      )}

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="اكتب سؤالك…"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
          aria-label="رسالة للمساعد"
        />
        <Button type="submit" disabled={loading || input.trim().length === 0}>
          إرسال
        </Button>
      </form>
    </Container>
  );
}
