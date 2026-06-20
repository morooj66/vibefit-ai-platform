import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { MainLayout } from '../layouts/MainLayout';
import { AssistantPage } from '../pages/AssistantPage';
import { AssessmentPage } from '../pages/AssessmentPage';
import { CheckInPage } from '../pages/CheckInPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SignupPage } from '../pages/SignupPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout variant="public" />}>
        <Route index element={<LandingPage />} />
      </Route>

      <Route element={<MainLayout variant="auth" />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout variant="app" />}>
          <Route path="assessment" element={<AssessmentPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="check-in" element={<CheckInPage />} />
        </Route>
      </Route>

      <Route element={<MainLayout variant="minimal" />}>
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
