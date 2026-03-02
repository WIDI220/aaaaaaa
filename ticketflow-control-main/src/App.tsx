import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { MonthProvider } from "@/contexts/MonthContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import TicketsPage from "@/pages/TicketsPage";
import ExcelImportPage from "@/pages/ExcelImportPage";
import MitarbeiterPage from "@/pages/MitarbeiterPage";
import EinstellungenPage from "@/pages/EinstellungenPage";
import NotFound from "@/pages/NotFound";

const PdfRuecklauf = lazy(() => import("@/pages/PdfRuecklauf"));

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { session, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (!session) return <AuthPage />;

  return (
    <MonthProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/import" element={<ExcelImportPage />} />
          <Route
            path="/pdf-ruecklauf"
            element={
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <PdfRuecklauf />
              </Suspense>
            }
          />
          <Route path="/mitarbeiter" element={<MitarbeiterPage />} />
          <Route
            path="/einstellungen"
            element={isAdmin ? <EinstellungenPage /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </MonthProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ProtectedRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
