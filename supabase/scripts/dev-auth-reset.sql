-- VibeFit — إعداد Auth للتجربة المحلية
-- نفّذ هذا الملف مرة واحدة من Supabase → SQL Editor
-- ثم عطّل Confirm email من: Authentication → Providers → Email

-- 1) حذف كل المستخدمين (بداية نظيفة)
delete from auth.users;

-- 2) (اختياري) إذا أبقيت مستخدمين وتريد تفعيلهم بدون بريد:
-- update auth.users
-- set email_confirmed_at = coalesce(email_confirmed_at, now())
-- where email_confirmed_at is null;
