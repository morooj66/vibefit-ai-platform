import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './lib/AppRouter';
import { isSupabaseConfigured } from './lib/supabaseConfig';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigSetupPage } from './pages/ConfigSetupPage';
import App from './App';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (!isSupabaseConfigured()) {
  root.render(
    <StrictMode>
      <ConfigSetupPage />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <AppRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppRouter>
    </StrictMode>,
  );
}
