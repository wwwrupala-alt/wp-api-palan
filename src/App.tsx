import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { WhatsAppAccountsProvider } from './context/WhatsAppAccountsContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { ConnectWhatsAppModal } from './components/ConnectWhatsAppModal.tsx';

import { DashboardPage } from './pages/DashboardPage.tsx';
import { InboxPage } from './pages/InboxPage.tsx';
import { WhatsAppAccountsPage } from './pages/WhatsAppAccountsPage.tsx';
import { ContactsPage } from './pages/ContactsPage.tsx';
import { TemplatesPage } from './pages/TemplatesPage.tsx';
import { CampaignsPage } from './pages/CampaignsPage.tsx';
import { AutomationsPage } from './pages/AutomationsPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { Loader2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400 mx-auto" />
          <p className="text-xs text-neutral-500 font-medium">Initializing CloudWABA platform...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          onOpenConnectModal={() => setIsConnectModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardPage
              onOpenConnectModal={() => setIsConnectModalOpen(true)}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}
          {currentTab === 'inbox' && <InboxPage />}
          {currentTab === 'whatsapp' && (
            <WhatsAppAccountsPage onOpenConnectModal={() => setIsConnectModalOpen(true)} />
          )}
          {currentTab === 'contacts' && <ContactsPage />}
          {currentTab === 'templates' && <TemplatesPage />}
          {currentTab === 'campaigns' && <CampaignsPage />}
          {currentTab === 'automations' && <AutomationsPage />}
          {currentTab === 'admin' && <AdminPage />}
        </main>
      </div>

      {/* Global Connect WhatsApp Modal */}
      <ConnectWhatsAppModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WhatsAppAccountsProvider>
            <AppContent />
          </WhatsAppAccountsProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
