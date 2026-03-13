import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { VideoNotificationProvider } from "@/contexts/VideoNotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import CreateVideo from "./pages/CreateVideo";
import CreateComplete from "./pages/CreateComplete";
import Settings from "./pages/Settings";
import Team from "./pages/Team";
import Billing from "./pages/Billing";
import QuickEdit from "./pages/QuickEdit";
import Studio from "./pages/Studio";
import Photos from "./pages/Photos";
import Support from "./pages/Support";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const queryClient = new QueryClient();

const App = () => (
  <Sentry.ErrorBoundary fallback={<div className="flex items-center justify-center min-h-screen"><p>Something went wrong. Please refresh the page.</p></div>}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <VideoNotificationProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/create" element={
              <ProtectedRoute>
                <CreateVideo />
              </ProtectedRoute>
            } />
            <Route path="/create/complete" element={
              <ProtectedRoute>
                <CreateComplete />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/team" element={
              <ProtectedRoute>
                <Team />
              </ProtectedRoute>
            } />
            <Route path="/billing" element={
              <ProtectedRoute>
                <Billing />
              </ProtectedRoute>
            } />
            <Route path="/quick-edit/:id" element={
              <ProtectedRoute>
                <QuickEdit />
              </ProtectedRoute>
            } />
            <Route path="/studio/:id" element={
              <ProtectedRoute>
                <Studio />
              </ProtectedRoute>
            } />
            <Route path="/photos" element={
              <ProtectedRoute>
                <Photos />
              </ProtectedRoute>
            } />
            <Route path="/photos/:propertyId" element={
              <ProtectedRoute>
                <Photos />
              </ProtectedRoute>
            } />
            <Route path="/support" element={
              <ProtectedRoute>
                <Support />
              </ProtectedRoute>
            } />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </VideoNotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

export default App;
