import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import ProjectHealth from "./pages/ProjectHealth";
import HealthSettings from "./pages/HealthSettings";
import LtaTracking from "./pages/LtaTracking";
import ExpenseCompliance from "./pages/ExpenseCompliance";
import Etc from "./pages/Etc";
import DataImport from "./pages/DataImport";
import ChatbotPage from "./pages/ChatbotPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<ProjectHealth />} />
            <Route path="/health/settings" element={<HealthSettings />} />
            <Route path="/lta" element={<LtaTracking />} />
            <Route path="/expenses" element={<ExpenseCompliance />} />
            <Route path="/etc" element={<Etc />} />
            <Route path="/import" element={<DataImport />} />
            <Route path="/chatbot" element={<ChatbotPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
