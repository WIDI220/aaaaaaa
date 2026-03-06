import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { MonthProvider } from '@/contexts/MonthContext';
import AppLayout from '@/components/AppLayout';

const AuthPage = lazy(() => import('@/pages/AuthPage'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const TicketsPage = lazy(() => import('@/pages/TicketsPage'));
const ExcelImportPage = lazy(() => import('@/pages/ExcelImportPage'));
const PdfRuecklauf = lazy(() => import('@/pages/PdfRuecklauf'));
const MitarbeiterPage = lazy(() => import('@/pages/MitarbeiterPage'));
const AnalysePage = lazy(() => import('@/pages/AnalysePage'));
const AufgabenPage = lazy(() => import('@/pages/AufgabenPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
  if (!user) return <AuthPage />;
  return (
    <MonthProvider>
      <AppLayout>
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/import" element={<ExcelImportPage />} />
            <Route path="/pdf-ruecklauf" element={<PdfRuecklauf />} />
            <Route path="/mitarbeiter" element={<MitarbeiterPage />} />
            <Route path="/analyse" element={<AnalysePage />} />
            <Route path="/aufgaben" element={<AufgabenPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </MonthProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
