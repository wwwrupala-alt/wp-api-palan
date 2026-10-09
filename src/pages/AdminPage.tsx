import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Terminal,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Save,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  saveOrganizationMetaConfig,
  clearOrganizationMetaConfig,
  subscribeGlobalMetaConfig,
} from '../lib/services.ts';
import type { WebhookLog } from '../types/index.ts';
import { MaskedIdDisplay } from '../components/MaskedIdDisplay.tsx';

export const AdminPage: React.FC = () => {
  const { organization, currentUser, refreshProfile, isMasterAdmin } = useAuth();
  const { refreshMetaStatus } = useWhatsAppAccounts();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'meta_app' | 'logs'>('meta_app');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  // Check if this tenant has their own custom dedicated Meta App
  const hasCustomMetaApp = Boolean(organization?.metaAppConfig?.appId);

  // Meta App Custom Config Fields
  const [metaAppIdInput, setMetaAppIdInput] = useState(
    organization?.metaAppConfig?.appId || ''
  );
  const [metaAppSecretInput, setMetaAppSecretInput] = useState(
    organization?.metaAppConfig?.appSecret || ''
  );
  const [metaConfigIdInput, setMetaConfigIdInput] = useState(
    organization?.metaAppConfig?.configId || ''
  );
  const [metaSystemTokenInput, setMetaSystemTokenInput] = useState(
    organization?.metaAppConfig?.systemUserToken || ''
  );
  const [metaWabaIdInput, setMetaWabaIdInput] = useState(
    organization?.metaAppConfig?.wabaId || ''
  );
  const [syncGlobally, setSyncGlobally] = useState(Boolean(isMasterAdmin));
  const [savingMetaConfig, setSavingMetaConfig] = useState(false);
  const [revertingToDefault, setRevertingToDefault] = useState(false);

  // Sync inputs whenever organization metadata updates
  useEffect(() => {
    if (organization?.metaAppConfig) {
      if (organization.metaAppConfig.appId) setMetaAppIdInput(organization.metaAppConfig.appId);
      if (organization.metaAppConfig.appSecret) setMetaAppSecretInput(organization.metaAppConfig.appSecret);
      if (organization.metaAppConfig.configId) setMetaConfigIdInput(organization.metaAppConfig.configId);
      if (organization.metaAppConfig.systemUserToken) setMetaSystemTokenInput(organization.metaAppConfig.systemUserToken);
      if (organization.metaAppConfig.wabaId) setMetaWabaIdInput(organization.metaAppConfig.wabaId);
    }
  }, [organization?.metaAppConfig]);

  // Webhook Logs
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Subscribe to global Meta App config
  useEffect(() => {
    const unsubGlobal = subscribeGlobalMetaConfig((gConfig) => {
      if (gConfig) {
        if (!metaAppIdInput && gConfig.appId) setMetaAppIdInput(gConfig.appId);
        if (!metaConfigIdInput && gConfig.configId) setMetaConfigIdInput(gConfig.configId);
        if (!metaAppSecretInput && gConfig.appSecret) setMetaAppSecretInput(gConfig.appSecret);
        if (!metaSystemTokenInput && gConfig.systemUserToken) setMetaSystemTokenInput(gConfig.systemUserToken);
        if (!metaWabaIdInput && gConfig.wabaId) setMetaWabaIdInput(gConfig.wabaId);
      }
    });

    return () => {
      unsubGlobal();
    };
  }, []);

  // Fetch Webhook Logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/meta/webhook/logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Failed to load webhook logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyText = (text: string, type: 'url' | 'token' | 'redirect') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    }
  };

  // Handle Revert back to Master Platform Default Meta App
  const handleRevertToDefaultMetaApp = async () => {
    const targetOrgId = organization?.id || `org_${currentUser?.uid || 'user'}`;
    setRevertingToDefault(true);
    try {
      await clearOrganizationMetaConfig(targetOrgId);
      setMetaAppIdInput('');
      setMetaConfigIdInput('');
      setMetaAppSecretInput('');
      setMetaSystemTokenInput('');
      setMetaWabaIdInput('');

      if (refreshProfile) await refreshProfile().catch(() => {});
      if (refreshMetaStatus) await refreshMetaStatus().catch(() => {});

      toast.showSuccess(
        'Reverted to Master Default App',
        'Ab aapka workspace Master Admin ke default Meta App se connect karega.'
      );
    } catch (err: any) {
      toast.showError('Revert Failed', err?.message || 'Failed to revert Meta App configuration.');
    } finally {
      setRevertingToDefault(false);
    }
  };

  // Handle Save Custom Meta App Details
  const handleSaveMetaAppConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanAppId = metaAppIdInput.trim();
    const cleanConfigId = metaConfigIdInput.trim();
    const cleanSecret = metaAppSecretInput.trim();
    const cleanToken = metaSystemTokenInput.trim();
    const cleanWaba = metaWabaIdInput.trim();

    if (!cleanConfigId && !cleanAppId) {
      toast.showWarning('Details Missing', 'Kripya Configuration ID aur Meta App ID enter karein.');
      return;
    }

    const targetOrgId =
      organization?.id ||
      `org_${currentUser?.uid || 'user'}`;

    setSavingMetaConfig(true);

    try {
      await saveOrganizationMetaConfig(
        targetOrgId,
        {
          appId: cleanAppId,
          appSecret: cleanSecret || undefined,
          configId: cleanConfigId,
          systemUserToken: cleanToken || undefined,
          wabaId: cleanWaba || undefined,
        },
        isMasterAdmin ? syncGlobally : false
      );

      if (refreshProfile) {
        await refreshProfile().catch(() => {});
      }
      if (refreshMetaStatus) {
        await refreshMetaStatus().catch(() => {});
      }

      toast.showSuccess(
        'Meta App Configuration Saved!',
        isMasterAdmin && syncGlobally
          ? 'Master Default Meta App update ho gaya hai (Platform-wide synced).'
          : 'Dedicated Custom Meta App aapke workspace ke liye successfully save ho chuka hai!'
      );
    } catch (err: any) {
      toast.showError('Save Failed', err?.message || 'Failed to save Meta App configuration.');
    } finally {
      setSavingMetaConfig(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Settings &amp; Meta Cloud API</span>
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800">
              Active Workspace
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Configure Meta Cloud API credentials, Embedded Signup settings, and real-time webhook logs.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              fetchLogs();
              refreshMetaStatus();
            }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 space-x-6 text-xs font-medium">
        <button
          onClick={() => setActiveTab('meta_app')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'meta_app'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Meta App &amp; Embedded Signup Setup</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'logs'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Meta Live Webhook Logs ({webhookLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: META APP & EMBEDDED SIGNUP SETTINGS */}
      {activeTab === 'meta_app' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveMetaAppConfig} className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  Meta App &amp; Embedded Signup Integration Settings
                </h3>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Yahan aap apna <strong>Meta App</strong> connect kar sakte hain. Website ki taraf se jo details Meta Console me daalni hoti hain wo neeche <strong>Read-Only</strong> di gayi hain, aur aapke Meta App ki details ke liye <strong>Input Fields</strong> di gayi hain taaki aap apni details fill karke save kar sakein.
              </p>
            </div>

            {/* SECTION A: META APP INPUT FIELDS */}
            <div className="p-5 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center space-x-1.5">
                  <Lock className="w-4 h-4" />
                  <span>1. Fill Your Meta App Details (Meta Developer Console Se Le Kar Daalein)</span>
                </span>
                <span className="text-[11px] text-neutral-500">Embedded Signup ke liye Configuration ID &amp; App ID zaroori hain</span>
              </div>

              {/* Multi-Tenant App Mode Banner */}
              {hasCustomMetaApp ? (
                <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 flex items-center justify-between text-xs text-purple-900 dark:text-purple-200">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <p className="font-bold text-xs">🌟 Dedicated Custom Meta App Active for Your Workspace</p>
                      <p className="text-[11px] text-purple-700 dark:text-purple-300">
                        Aapke workspace ke users aapke apne Meta App se onboard kar rahe hain.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRevertToDefaultMetaApp}
                    disabled={revertingToDefault}
                    className="px-2.5 py-1 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-neutral-800 text-purple-700 dark:text-purple-300 text-[11px] font-semibold hover:bg-purple-100 transition-colors cursor-pointer shrink-0"
                  >
                    {revertingToDefault ? 'Reverting...' : 'Revert to Master Default'}
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 flex items-center space-x-2 text-xs text-neutral-800 dark:text-neutral-200">
                  <Globe className="w-4 h-4 text-neutral-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs">🏢 Using Master Platform Default Meta App</p>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                      Aapke users Master Admin ke default Meta App se onboard honge. Apna dedicated app chalane ke liye apni details save karein.
                    </p>
                  </div>
                </div>
              )}

              {/* Status Banner */}
              {metaConfigIdInput.trim() && metaAppIdInput.trim() ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start space-x-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Embedded Signup Setup Ready! (Dono Details Filled)
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                      <div className="flex items-center space-x-1">
                        <span>Config ID:</span>
                        <MaskedIdDisplay
                          value={metaConfigIdInput.trim()}
                          label="Configuration ID"
                          digitsToShow={1}
                          badgeClassName="font-mono font-bold text-emerald-900 dark:text-emerald-200"
                        />
                      </div>
                      <span>|</span>
                      <div className="flex items-center space-x-1">
                        <span>App ID:</span>
                        <MaskedIdDisplay
                          value={metaAppIdInput.trim()}
                          label="Meta App ID"
                          digitsToShow={1}
                          badgeClassName="font-mono font-bold text-emerald-900 dark:text-emerald-200"
                        />
                      </div>
                      {metaAppSecretInput.trim() ? (
                        <>
                          <span>|</span>
                          <span>App Secret: (Saved)</span>
                        </>
                      ) : (
                        <>
                          <span>|</span>
                          <span>App Secret: (Optional - direct connect token bhi chalega)</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start space-x-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Embedded Signup ke liye dono details (Configuration ID + Meta App ID) fill karke Save karein.
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Agar aapke paas App Secret nahi hai, tab bhi aap Configuration ID aur Meta App ID daal kar Save kar sakte hain!
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* 1. Configuration ID */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                    <span>Facebook Login for Business: Configuration ID <span className="text-red-500">*</span></span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={metaConfigIdInput}
                    onChange={(e) => setMetaConfigIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Meta Developers &gt; WhatsApp &gt; Quickstart &gt; Configuration ID (Coexistence onboarding ke liye).
                  </p>
                </div>

                {/* 2. Meta App ID */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                    <span>Meta App ID <span className="text-red-500">*</span></span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={metaAppIdInput}
                    onChange={(e) => setMetaAppIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Aapke Meta App dashboard ke top-left me diya gaya App ID.
                  </p>
                </div>

                {metaConfigIdInput.trim() === metaAppIdInput.trim() && metaConfigIdInput.trim().length > 0 && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-semibold">Dhyaan Dein: Configuration ID aur Meta App ID same nahi hote!</span>
                      <p className="leading-relaxed">
                        Aapne dono me ek hi number (<code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">••••••••</code>) daala hua hai. 
                        Isi wajah se Facebook popup me <strong>&quot;Invalid parameter: config_id is required&quot;</strong> error aata hai.
                        Apne Meta Developer Dashboard me jakar <strong>WhatsApp &gt; Quickstart</strong> ya <strong>Facebook Login for Business &gt; Configurations</strong> me se apna asli <strong>Configuration ID</strong> copy karein aur pehle box me paste karein.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. App Secret */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                    <span>Meta App Secret <span className="text-neutral-400 font-normal">(Optional / Server Token Exchange ke liye)</span></span>
                  </label>
                  <input
                    type="password"
                    placeholder="•••••••••••••••••••••••••••••••• (Leave blank if not ready)"
                    value={metaAppSecretInput}
                    onChange={(e) => setMetaAppSecretInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    App Settings &gt; Basic &gt; App Secret (Popup authorization ke baad auto token exchange ke liye zaroori hota hai).
                  </p>
                </div>

                {/* 4. System User Access Token */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                    <span>System User Access Token (Permanent Token)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="EAAB..."
                    value={metaSystemTokenInput}
                    onChange={(e) => setMetaSystemTokenInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Business Manager &gt; System Users &gt; Generate Token (Permanent broadcast sending).
                  </p>
                </div>

                {/* 5. Default WABA ID */}
                <div className="space-y-1 md:col-span-2">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                    <span>WhatsApp Business Account ID (WABA ID) (Optional)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={metaWabaIdInput}
                    onChange={(e) => setMetaWabaIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Aapka main WABA ID jahan approved templates create aur manage hote hain.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-200/80 dark:border-neutral-700/80">
                {isMasterAdmin ? (
                  <label className="flex items-center space-x-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncGlobally}
                      onChange={(e) => setSyncGlobally(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span>Sync across platform as Master Default automatically</span>
                  </label>
                ) : (
                  <span className="text-[11px] text-neutral-500 font-medium">
                    🛡️ Dedicated only to your workspace (Private Meta App)
                  </span>
                )}

                <button
                  type="submit"
                  disabled={savingMetaConfig}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs flex items-center space-x-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingMetaConfig ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Meta App...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Dedicated Meta App</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SECTION B: DETAILS PROVIDED BY OUR WEBSITE TO PASTE IN META CONSOLE */}
            <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-4">
              <span className="font-bold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                <Globe className="w-4 h-4" />
                <span>2. Details Provided By Website (Copy &amp; Paste in Your Meta Developer Console)</span>
              </span>

              <div className="space-y-3.5 text-xs">
                {/* 1. Valid OAuth Redirect URIs */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Valid OAuth Redirect URIs (Facebook Login for Business &gt; Settings)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://wp-api-palan.vercel.app/'}
                      className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://wp-api-palan.vercel.app/', 'redirect')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {copiedRedirect ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedRedirect ? 'Copied' : 'Copy URI'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Meta App Console &gt; Facebook Login for Business &gt; Settings &gt; Valid OAuth Redirect URIs me ise paste karein.
                  </p>
                </div>

                {/* 2. Webhook Callback URL */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Webhook Callback URL (WhatsApp &gt; Configuration &gt; Webhook)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/api/meta/webhook` : 'https://wp-api-palan.vercel.app/api/meta/webhook'}
                      className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(typeof window !== 'undefined' ? `${window.location.origin}/api/meta/webhook` : 'https://wp-api-palan.vercel.app/api/meta/webhook', 'url')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? 'Copied' : 'Copy Callback'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Meta App Console &gt; WhatsApp &gt; Configuration &gt; Callback URL me ise paste karein.
                  </p>
                </div>

                {/* 3. Webhook Verify Token */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Verify Token (Webhook Verification)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value="cloudwaba_verify_token_secure"
                      className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('cloudwaba_verify_token_secure', 'token')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedToken ? 'Copied' : 'Copy Token'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Webhook setup karte waqt Meta Verify Token me <code>cloudwaba_verify_token_secure</code> paste karein.
                  </p>
                </div>

                {/* 4. App Domains & URLs for Basic Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">App Domain</span>
                    <p className="font-mono text-xs text-neutral-900 dark:text-white select-all">
                      {typeof window !== 'undefined' ? window.location.hostname : 'wp-api-palan.vercel.app'}
                    </p>
                    <p className="text-[10px] text-neutral-400">Settings &gt; Basic &gt; App Domains</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Privacy Policy URL</span>
                    <p className="font-mono text-xs text-neutral-900 dark:text-white select-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/privacy` : 'https://wp-api-palan.vercel.app/privacy'}
                    </p>
                    <p className="text-[10px] text-neutral-400">Settings &gt; Basic &gt; Privacy Policy URL</p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: WEBHOOK LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-neutral-800 pb-2">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Meta Webhook Event Stream (Messages, Deliveries &amp; Statuses)</span>
              </span>
              <span>Endpoint: /api/meta/webhook</span>
            </div>

            {loadingLogs ? (
              <div className="py-12 text-center text-neutral-500 text-xs flex items-center justify-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>Loading webhook logs...</span>
              </div>
            ) : webhookLogs.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs">
                No webhook events logged yet. Incoming message events, delivery receipts, and status callbacks from Meta WhatsApp Cloud API will stream here in real time.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-700/50 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span
                        className={`font-bold uppercase ${
                          log.status === 'success'
                            ? 'text-emerald-400'
                            : log.status === 'error'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {log.event}
                      </span>
                      <span className="text-neutral-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-neutral-300 text-xs">{log.details}</p>
                    <p className="text-[10px] text-neutral-500">Source: {log.origin}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
