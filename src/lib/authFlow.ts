import type { AuthError } from '@supabase/supabase-js';
import { getPostLoginPath } from './assessments';
import { supabase } from './supabase';

export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

function mapAuthError(error: AuthError): string {
  const code = (error.code ?? '').toLowerCase();
  const message = error.message.toLowerCase();

  if (code === 'over_email_send_rate_limit' || message.includes('rate limit')) {
    return 'تم تجاوز حد إرسال البريد. عطّل Confirm email في Supabase، انتظر 10–60 دقيقة، ثم جرّب بريدًا جديدًا.';
  }

  if (message.includes('email not confirmed')) {
    return 'الحساب غير مفعّل. عطّل Confirm email في Supabase أو أنشئ حسابًا جديدًا.';
  }

  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'هذا البريد مستخدم. سجّل الدخول بدلًا من إنشاء حساب جديد.';
  }

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'البريد أو كلمة المرور غير صحيحة';
  }

  if (message.includes('database error saving new user')) {
    return 'قاعدة البيانات غير جاهزة. نفّذ supabase/schema.sql في Supabase SQL Editor.';
  }

  if (code === 'signup_disabled' || message.includes('signups not allowed')) {
    return 'إنشاء الحسابات معطّل في Supabase. فعّله من Authentication → Providers → Email.';
  }

  if (message.includes('password')) {
    return 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل.';
  }

  return 'تعذّر إتمام العملية. حاول مرة أخرى.';
}

export async function signInWithEmail(email: string, password: string): Promise<string> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new AuthFlowError(mapAuthError(error));
  }

  return getPostLoginPath();
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<string> {
  const trimmedEmail = email.trim();

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        display_name: displayName?.trim() || null,
      },
    },
  });

  if (error) {
    throw new AuthFlowError(mapAuthError(error));
  }

  if (data.session) {
    return '/assessment';
  }

  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (loginError) {
    throw new AuthFlowError(mapAuthError(loginError));
  }

  return '/assessment';
}
