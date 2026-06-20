import { supabase } from '../../lib/supabase';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import type {
  AgentErrorResponse,
  AgentStructuredResponse,
  AgentSuccessResponse,
} from '../../types/agent';
import { normalizeAgentResponse } from '../../types/agent';

const AGENT_FUNCTION_NAME = 'vibefit-agent';
const AGENT_TIMEOUT_MS = 60_000;
export const AGENT_ERROR_MESSAGE = 'تعذر الحصول على إجابة الآن. حاول مرة أخرى.';

export class AgentServiceError extends Error {
  readonly code: string;

  constructor(message: string, code = 'UNKNOWN') {
    super(message);
    this.name = 'AgentServiceError';
    this.code = code;
  }
}

function mapAgentError(code: string): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'يلزم تسجيل الدخول لاستخدام المساعد.';
    case 'RATE_LIMIT':
      return 'انتظر قليلًا قبل إرسال رسالة أخرى.';
    case 'EMPTY_MESSAGE':
    case 'MESSAGE_TOO_LONG':
    case 'INVALID_MESSAGE':
      return 'تحقق من نص رسالتك وحاول مرة أخرى.';
    case 'TIMEOUT':
      return AGENT_ERROR_MESSAGE;
    default:
      return AGENT_ERROR_MESSAGE;
  }
}

function logAgentDevDetails(details: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.error('[Agent DEV]', details);
}

async function readHttpErrorBody(
  error: FunctionsHttpError,
): Promise<AgentErrorResponse | null> {
  try {
    return (await error.context.clone().json()) as AgentErrorResponse | null;
  } catch {
    try {
      const text = await error.context.clone().text();
      return text ? { success: false, error: 'HTTP_ERROR', message: text.slice(0, 300) } : null;
    } catch {
      return null;
    }
  }
}

async function logAgentDevError(error: unknown): Promise<string> {
  if (!import.meta.env.DEV || !error) return 'UNKNOWN';

  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    const body = await readHttpErrorBody(error);
    const code =
      body?.error ??
      (status === 404 ? 'FUNCTION_NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR');

    logAgentDevDetails({
      function: AGENT_FUNCTION_NAME,
      status,
      errorCode: code,
      message: body?.message ?? error.message,
      body,
    });

    return code;
  }

  if (error instanceof FunctionsRelayError) {
    logAgentDevDetails({
      function: AGENT_FUNCTION_NAME,
      status: 'RELAY',
      errorCode: 'RELAY_ERROR',
      message: error.message,
    });
    return 'RELAY_ERROR';
  }

  if (error instanceof FunctionsFetchError) {
    logAgentDevDetails({
      function: AGENT_FUNCTION_NAME,
      status: 'NETWORK',
      errorCode: 'NETWORK_ERROR',
      message: error.message,
    });
    return 'NETWORK_ERROR';
  }

  if (error instanceof AgentServiceError) {
    logAgentDevDetails({
      function: AGENT_FUNCTION_NAME,
      status: 'CLIENT',
      errorCode: error.code,
      message: error.message,
    });
    return error.code;
  }

  logAgentDevDetails({
    function: AGENT_FUNCTION_NAME,
    status: 'UNKNOWN',
    errorCode: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : String(error),
  });
  return 'UNKNOWN';
}

async function handleInvokeError(error: unknown): Promise<never> {
  const code = await logAgentDevError(error);

  if (error instanceof FunctionsHttpError) {
    const body = await readHttpErrorBody(error);
    if (body && body.success === false && body.error) {
      throw new AgentServiceError(mapAgentError(body.error), body.error);
    }

    if (error.context.status === 404) {
      throw new AgentServiceError(AGENT_ERROR_MESSAGE, 'FUNCTION_NOT_FOUND');
    }
    if (error.context.status === 401) {
      throw new AgentServiceError(mapAgentError('UNAUTHORIZED'), 'UNAUTHORIZED');
    }
    throw new AgentServiceError(AGENT_ERROR_MESSAGE, code);
  }

  if (error instanceof FunctionsRelayError) {
    throw new AgentServiceError(AGENT_ERROR_MESSAGE, 'RELAY_ERROR');
  }

  if (error instanceof FunctionsFetchError) {
    throw new AgentServiceError(AGENT_ERROR_MESSAGE, 'NETWORK_ERROR');
  }

  if (error instanceof AgentServiceError) {
    throw error;
  }

  throw new AgentServiceError(AGENT_ERROR_MESSAGE, code);
}

export async function sendAgentMessage(
  message: string,
  conversationId?: string,
): Promise<{ conversationId: string; response: AgentStructuredResponse }> {
  const invokePromise = supabase.functions.invoke(AGENT_FUNCTION_NAME, {
    body: {
      message: message.trim(),
      channel: 'web',
      conversation_id: conversationId,
    },
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new AgentServiceError(AGENT_ERROR_MESSAGE, 'TIMEOUT')),
      AGENT_TIMEOUT_MS,
    );
  });

  try {
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
    const payload = data as AgentSuccessResponse | AgentErrorResponse | null;

    if (payload && typeof payload === 'object' && 'success' in payload) {
      if (payload.success) {
        if (import.meta.env.DEV) {
          console.info('[Agent DEV] success', {
            function: AGENT_FUNCTION_NAME,
            status: 200,
            intent: payload.response.intent,
            used_rag: payload.response.used_rag,
            used_personal_data: payload.response.used_personal_data,
          });
        }
        return {
          conversationId: payload.conversation_id,
          response: normalizeAgentResponse(payload.response),
        };
      }

      if (import.meta.env.DEV) {
        logAgentDevDetails({
          function: AGENT_FUNCTION_NAME,
          status: 200,
          errorCode: payload.error,
          message: payload.message,
          body: payload,
        });
      }

      throw new AgentServiceError(mapAgentError(payload.error), payload.error);
    }

    if (error) {
      await handleInvokeError(error);
    }

    throw new AgentServiceError(AGENT_ERROR_MESSAGE, 'UNKNOWN');
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
