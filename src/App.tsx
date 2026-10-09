import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { WhatsAppAccountsProvider } from './context/WhatsAppAccountsContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { ConnectWhatsAppModal } from './components/ConnectWhatsAppModal.tsx';
import { InactivityWarningModal } from './components/InactivityWarningModal.tsx';

import { DashboardPage } from './pages/DashboardPage.tsx';
import { InboxPage } from './pages/InboxPage.tsx';
import { WhatsAppAccountsPage } from './pages/WhatsAppAccountsPage.tsx';
import { ContactsPage } from './pages/ContactsPage.tsx';
import { TemplatesPage } from './pages/TemplatesPage.tsx';
import { CampaignsPage } from './pages/CampaignsPage.tsx';
import { CampaignAnalyticsPage } from './pages/CampaignAnalyticsPage.tsx';
import { AutomationsPage } from './pages/AutomationsPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { MasterAdminPage } from './pages/MasterAdminPage.tsx';
import { TenantUsersPage } from './pages/TenantUsersPage.tsx';
import { LegalPage } from './pages/LegalPage.tsx';
import { Loader2, ArrowLeft, ShieldAlert } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentUser,
    userProfile,
    organization,
    isMasterAdmin,
    isAdmin,
    isUser,
    impersonatedBy,
    returnToMasterAdmin,
    loading,
    isIdleWarningOpen,
    idleSecondsRemaining,
    resetIdleTimer,
    signOut,
  } = useAuth();

  const getInitialLegalDoc = (): 'privacy' | 'terms' | null => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('privacy')) return 'privacy';
    if (path.includes('term')) return 'terms';
    if (path === '/legal') return 'privacy';
    return null;
  };

  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(getInitialLegalDoc);

  React.useEffect(() => {
    const onPopState = () => {
      setLegalDoc(getInitialLegalDoc());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [currentTab, setCurrentTab] = useState<string>(() => {
    if (userProfile?.role === 'master_admin') return 'master';
    return 'dashboard';
  });

  const [selectedAnalyticsCampaignId, setSelectedAnalyticsCampaignId] = useState<string>('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Sync tab with role changes / impersonation updates
  React.useEffect(() => {
    if (isMasterAdmin && !impersonatedBy) {
      if (currentTab === 'dashboard') {
        setCurrentTab('master');
      }
    } else if (impersonatedBy || isAdmin) {
      if (currentTab === 'master') {
        setCurrentTab('dashboard');
      }
    } else if (isUser) {
      if (['master', 'users', 'admin'].includes(currentTab)) {
        setCurrentTab('dashboard');
      }
    }
  }, [isMasterAdmin, impersonatedBy, isAdmin, isUser]);

  if (legalDoc) {
    return (
      <LegalPage
        initialDoc={legalDoc}
        onBack={() => {
          setLegalDoc(null);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

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
    return (
      <LoginPage
        onOpenLegal={(doc) => {
          setLegalDoc(doc);
          window.history.pushState({}, '', doc === 'privacy' ? '/privacy-policy' : '/terms-of-service');
        }}
      />
    );
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
        {/* Support Impersonation Mode Banner */}
        {impersonatedBy && (
          <div className="bg-linear-to-r from-amber-500 via-amber-600 to-amber-500 text-neutral-950 px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-md z-40 border-b border-amber-600">
            <div className="flex items-center space-x-2.5 truncate mr-3">
              <span className="px-2 py-0.5 rounded bg-black/20 text-white font-bold uppercase text-[10px] tracking-wider shrink-0 flex items-center space-x-1">
                <ShieldAlert className="w-3 h-3" />
                <span>{impersonatedBy.role === 'admin' ? 'Team User Watch Mode' : 'Impersonation Active'}</span>
              </span>
              <span className="truncate">
                {impersonatedBy.role === 'admin' ? 'Watching User Account: ' : 'Logged in as Admin: '}
                <strong>{userProfile?.displayName || userProfile?.email}</strong> ({organization?.name || 'Workspace'}).
              </span>
            </div>
            <button
              onClick={returnToMasterAdmin}
              className="px-3 py-1 rounded-lg bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-all hover:scale-105 shrink-0 flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{impersonatedBy.role === 'admin' ? 'Return to Admin Panel' : 'Return to Master Admin'}</span>
            </button>
          </div>
        )}

        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          onOpenConnectModal={() => setIsConnectModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          {currentTab === 'master' && isMasterAdmin && <MasterAdminPage />}
          {currentTab === 'dashboard' && (
            <DashboardPage
              onOpenConnectModal={() => setIsConnectModalOpen(true)}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}
          {currentTab === 'users' && (isAdmin || isMasterAdmin) && <TenantUsersPage />}
          {currentTab === 'inbox' && <InboxPage />}
          {currentTab === 'whatsapp' && (
            <WhatsAppAccountsPage onOpenConnectModal={() => setIsConnectModalOpen(true)} />
          )}
          {currentTab === 'contacts' && <ContactsPage />}
          {currentTab === 'templates' && <TemplatesPage />}
          {currentTab === 'campaigns' && (
            <CampaignsPage
              onViewAnalytics={(campId) => {
                setSelectedAnalyticsCampaignId(campId);
                setCurrentTab('analytics');
              }}
            />
          )}
          {currentTab === 'analytics' && (
            <CampaignAnalyticsPage
              initialCampaignId={selectedAnalyticsCampaignId}
              onNavigateToCampaigns={() => setCurrentTab('campaigns')}
            />
          )}
          {currentTab === 'automations' && <AutomationsPage />}
          {currentTab === 'admin' && (isAdmin || isMasterAdmin) && <AdminPage />}
        </main>
      </div>

      {/* Global Connect WhatsApp Modal */}
      <ConnectWhatsAppModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />

      {/* Session Inactivity Timeout Warning Modal (triggers 5 minutes before 3-hour limit) */}
      <InactivityWarningModal
        isOpen={isIdleWarningOpen}
        secondsRemaining={idleSecondsRemaining}
        onStayLoggedIn={resetIdleTimer}
        onLogout={() => signOut('inactivity')}
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
