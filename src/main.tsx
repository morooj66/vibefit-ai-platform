import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isSupabaseConfigured } from './lib/supabaseConfig';
import { ConfigSetupPage } from './pages/ConfigSetupPage';
import './index.css';

function logDevError(context: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(`[VibeFit DEV] ${context}`, error);
  }
}

function renderConfigSetup(root: ReturnType<typeof createRoot>) {
  root.render(
    <StrictMode>
      <ConfigSetupPage />
    </StrictMode>,
  );
}

function renderBootstrapError(root: ReturnType<typeof createRoot>) {
  root.render(
    <StrictMode>
      <div
        dir="rtl"
        lang="ar"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: '"Tajawal", "Noto Sans Arabic", Arial, sans-serif',
          background: '#f9fafb',
          color: '#374151',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '12px' }}>
            تعذر تحميل التطبيق
          </h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
            حدث خطأ أثناء التشغيل. حدّث الصفحة أو تحقق من إعدادات Supabase في Vercel.
          </p>
        </div>
      </div>
    </StrictMode>,
  );
}

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    logDevError('bootstrap', new Error('#root element not found'));
    return;
  }

  const root = createRoot(rootElement);

  if (!isSupabaseConfigured()) {
    renderConfigSetup(root);
    return;
  }

  try {
    const [{ AppRouter }, { AuthProvider }, { default: App }] = await Promise.all([
      import('./lib/AppRouter'),
      import('./contexts/AuthContext'),
      import('./App'),
    ]);

    root.render(
      <StrictMode>
        <AppRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppRouter>
      </StrictMode>,
    );
  } catch (error) {
    logDevError('bootstrap failed', error);

    if (!isSupabaseConfigured()) {
      renderConfigSetup(root);
      return;
    }

    renderBootstrapError(root);
  }
}

void bootstrap();
