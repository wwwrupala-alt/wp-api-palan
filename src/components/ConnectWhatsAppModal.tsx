import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Facebook,
  Key,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Shield,
  Loader2,
  Phone,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  Webhook,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface ConnectWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ConnectWhatsAppModal: React.FC<ConnectWhatsAppModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { metaStatus, connectViaEmbeddedSignup, connectManualAccount, testMetaCredentials } = useWhatsAppAccounts();
  const { userProfile } = useAuth();
  const toast = useToast();

  // Tab: 'direct' (Phone number / ID) or 'embedded' (Facebook SDK)
  const [activeTab, setActiveTab] = useState<'direct' | 'embedded'>('direct');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [embeddedMode, setEmbeddedMode] = useState<'coexistence' | 'standard'>('coexistence');

  // Direct connect fields - Real Meta details
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [displayPhone, setDisplayPhone] = useState('+91 9974428034');
  const [businessName, setBusinessName] = useState('CloudWABA Business');
  const [pin, setPin] = useState('111111');

  // Diagnostics result from live test
  const [diagnostics, setDiagnostics] = useState<{
    tokenValid: boolean;
    phoneNumberValid: boolean;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    wabaValid: boolean;
    wabaName?: string;
    errors?: string[];
  } | null>(null);

  // Webhook details & copy state
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showWebhookGuide, setShowWebhookGuide] = useState(true);

  const webhookUrl = metaStatus?.webhookUrl || `${window.location.origin}/api/meta/webhook`;
  const verifyToken = metaStatus?.webhookVerifyToken || 'cloudwaba_verify_token_secure';

  if (!isOpen) return null;

  const handleCopy = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleTestMetaConnection = async () => {
    if (!customToken.trim()) {
      const msg = 'Please provide a System User Access Token to test live connection with Meta.';
      setError(msg);
      toast.showWarning('Token Required', msg);
      return;
    }

    setTesting(true);
    setError(null);
    setDiagnostics(null);

    const res = await testMetaCredentials({
      phoneNumberId: phoneNumberId.trim(),
      wabaId: wabaId.trim() || undefined,
      customToken: customToken.trim(),
    });

    setTesting(false);

    if (res.diagnostics) {
      setDiagnostics(res.diagnostics);
      if (res.diagnostics.displayPhoneNumber) {
        setDisplayPhone(res.diagnostics.displayPhoneNumber);
      }
      if (res.diagnostics.verifiedName) {
        setBusinessName(res.diagnostics.verifiedName);
      }
      if (res.success) {
        setSuccess('Meta Cloud API credentials verified successfully!');
        toast.showSuccess(
          'Meta Authorization Verified',
          `Successfully connected to Meta Graph API for ${res.diagnostics.verifiedName || 'WhatsApp Business'}.`
        );
      } else if (res.diagnostics.errors?.length) {
        const errorText = res.diagnostics.errors.join(' | ');
        setError(errorText);
        toast.showError('Meta Authorization Failed', errorText, {
          details: res.diagnostics,
        });
      }
    } else if (res.error) {
      setError(res.error);
      toast.showError('Meta Connection Failed', res.error);
    }
  };

  const handleEmbeddedSignup = async () => {
    setError(null);
    setSuccess(null);

    const hasAppId = Boolean(metaStatus?.appIdSet || metaStatus?.appId || import.meta.env.VITE_META_APP_ID || '28291855670435316');
    if (!hasAppId) {
      const msg = 'Meta App ID is not yet configured in server environment. Please use the "Real Meta API Credentials" tab to connect your WhatsApp account directly.';
      setError(msg);
      toast.showWarning('Meta App ID Missing', msg);
      return;
    }

    setLoading(true);

    try {
      await connectViaEmbeddedSignup({
        isCoexistence: embeddedMode === 'coexistence',
        featureType: embeddedMode === 'coexistence' ? 'whatsapp_business_app_onboarding' : undefined,
      });
      setSuccess('WhatsApp Account successfully connected via Meta Embedded Signup!');
      toast.showSuccess('WhatsApp Connected', 'Account successfully connected via Meta Embedded Signup!');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      const msg = err?.message || 'Meta Embedded Signup was closed or cancelled.';
      setError(msg);
      toast.showError('Meta Embedded Signup Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhoneId = phoneNumberId.trim() || displayPhone.replace(/[^0-9]/g, '');
    if (!cleanPhoneId) {
      const msg = 'Please enter a valid Phone Number ID or WhatsApp Mobile Number.';
      setError(msg);
      toast.showWarning('Missing WhatsApp Number', msg);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await connectManualAccount({
      phoneNumberId: cleanPhoneId,
      displayPhoneNumber: displayPhone.trim() || cleanPhoneId,
      verifiedName: businessName.trim() || 'WhatsApp Business',
      wabaId: wabaId.trim() || undefined,
      customToken: customToken.trim() || undefined,
      pin: pin.trim() || undefined,
    });

    if (result.success) {
      setSuccess('WhatsApp Account verified & successfully connected to your workspace!');
      toast.showSuccess(
        'WhatsApp Account Connected',
        `${businessName || 'WhatsApp'} is now ready for messaging and broadcast campaigns.`
      );
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } else {
      setError(result.error || 'Failed to connect WhatsApp account.');
      toast.showError('Failed to Connect WhatsApp Account', result.error);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-900/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                Connect Real WhatsApp Business Account
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Official Meta WhatsApp Cloud API &bull; Coexistence Mode &bull; Paid Marketing Engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-6 pt-2 bg-neutral-50/40 dark:bg-neutral-900/40">
          <button
            type="button"
            onClick={() => {
              setActiveTab('direct');
              setError(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'direct'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Real Meta API Credentials (Recommended)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('embedded');
              setError(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'embedded'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <Facebook className="w-4 h-4" />
            <span>Facebook Embedded Signup</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start space-x-3 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold">Notice</p>
                <p className="leading-relaxed opacity-95">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center space-x-3 text-emerald-700 dark:text-emerald-300 text-xs">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="font-semibold">{success}</p>
            </div>
          )}

          {activeTab === 'direct' ? (
            <form onSubmit={handleDirectConnect} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1">
                <p className="font-semibold text-emerald-900 dark:text-emerald-300 flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Real Meta WhatsApp Cloud API Details</span>
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 leading-relaxed">
                  Yeh details Meta Developer Portal se milti hain. Inhe daal kar aap direct real marketing broadcasts aur live messages bhej sakte hain.
                </p>
              </div>

              {/* Grid 1: Phone Number ID & WABA ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Phone Number ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 104839281728392"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Meta Portal &gt; WhatsApp &gt; API Setup &gt; Phone number ID
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    WhatsApp Business Account (WABA) ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 193829104829103"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Templates aur approval result sync karne ke liye zaroori
                  </p>
                </div>
              </div>

              {/* Permanent Access Token */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Meta Permanent Access Token (System User Token) <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 flex items-center space-x-1 text-[11px] cursor-pointer"
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showToken ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showToken ? 'text' : 'password'}
                  required
                  placeholder="EAAG... (Meta System User Permanent Token)"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  Meta Business Manager &gt; System Users &gt; Generate Token (Permissions: whatsapp_business_messaging, whatsapp_business_management)
                </p>
              </div>

              {/* Grid 2: Display Phone & Verified Name & PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Real WhatsApp Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 9974428034"
                    value={displayPhone}
                    onChange={(e) => setDisplayPhone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Verified Business Name
                  </label>
                  <input
                    type="text"
                    placeholder="CloudWABA"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    6-Digit PIN <span className="text-neutral-400 font-normal">(Coexistence)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="111111"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs tracking-widest text-center"
                  />
                </div>
              </div>

              {/* Diagnostics Box if test performed */}
              {diagnostics && (
                <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 space-y-2">
                  <div className="flex items-center space-x-1.5 font-semibold text-neutral-800 dark:text-neutral-200 text-xs">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    <span>Live Meta Graph API Test Results:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div className={`p-2 rounded-xl border ${diagnostics.tokenValid ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 border-rose-300 text-rose-800'}`}>
                      <p className="font-semibold">Token Status</p>
                      <p>{diagnostics.tokenValid ? '✅ Valid & Authorized' : '❌ Invalid or Expired'}</p>
                    </div>

                    <div className={`p-2 rounded-xl border ${diagnostics.phoneNumberValid ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300' : 'bg-neutral-100 border-neutral-300 text-neutral-700'}`}>
                      <p className="font-semibold">Phone Number ID</p>
                      <p>{diagnostics.phoneNumberValid ? `✅ Rating: ${diagnostics.qualityRating || 'GREEN'}` : 'Pending Check'}</p>
                    </div>

                    <div className={`p-2 rounded-xl border ${diagnostics.wabaValid ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300' : 'bg-neutral-100 border-neutral-300 text-neutral-700'}`}>
                      <p className="font-semibold">WABA Account</p>
                      <p>{diagnostics.wabaValid ? `✅ ${diagnostics.wabaName || 'Verified'}` : 'Pending Check'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons: Test Connection & Connect Account */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestMetaConnection}
                  disabled={testing || loading || !customToken.trim()}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-medium flex items-center justify-center space-x-2 transition-colors cursor-pointer text-xs disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>Testing with Meta...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4 text-emerald-600" />
                      <span>Test Real Credentials with Meta</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center justify-center space-x-2 transition-all shadow-sm hover:shadow-md disabled:opacity-60 cursor-pointer text-xs"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting &amp; Registering Number...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Connect &amp; Activate WhatsApp Number</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Meta Embedded Signup (Facebook Login v22.0)</span>
                </h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Log in directly through Meta/Facebook to select your Meta Business Portfolio, create or choose a WhatsApp Business Account (WABA), and verify your business phone number automatically.
                </p>

                {/* Onboarding Mode Selection: Coexistence vs Standard */}
                <div className="pt-2">
                  <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                    Select Onboarding Flow:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEmbeddedMode('coexistence')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        embeddedMode === 'coexistence'
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs flex items-center gap-1.5">
                          📱 Coexistence Mode
                        </span>
                        {embeddedMode === 'coexistence' && (
                          <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] opacity-80 leading-normal">
                        Keeps WhatsApp Business App working on mobile. Uses QR code scan &amp; <code className="bg-neutral-200 dark:bg-neutral-800 px-1 py-0.5 rounded text-[10px]">featureType: "whatsapp_business_app_onboarding"</code>.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEmbeddedMode('standard')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        embeddedMode === 'standard'
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs flex items-center gap-1.5">
                          ☁️ Standard Cloud API
                        </span>
                        {embeddedMode === 'standard' && (
                          <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] opacity-80 leading-normal">
                        Pure Cloud API for new virtual numbers or numbers not hosted on mobile app.
                      </p>
                    </button>
                  </div>
                </div>
              </div>

              {Boolean(metaStatus?.appIdSet || metaStatus?.appId) ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 space-y-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center space-x-2 font-semibold">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>Meta Embedded Signup Ready ({embeddedMode === 'coexistence' ? 'Coexistence Mode' : 'Standard'})</span>
                  </div>
                  <div className="text-[11px] space-y-1 font-mono text-neutral-700 dark:text-neutral-300 bg-white/70 dark:bg-neutral-900/60 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40">
                    <div>App ID: <strong>{metaStatus?.appId || '28291855670435316'}</strong></div>
                    <div>Config ID: <strong>{metaStatus?.configId || '1030431656687202'}</strong></div>
                    <div>
                      featureType:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {embeddedMode === 'coexistence' ? '"whatsapp_business_app_onboarding"' : 'none'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 flex items-start space-x-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Setup Notice</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed">
                      Use the <strong>Real Meta API Credentials</strong> tab to connect with your Phone Number ID and Token directly.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleEmbeddedSignup}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium flex items-center justify-center space-x-2 transition-all shadow-sm hover:shadow-md disabled:opacity-60 cursor-pointer text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Connecting with Meta...</span>
                  </>
                ) : (
                  <>
                    <Facebook className="w-5 h-5 fill-current" />
                    <span>
                      {embeddedMode === 'coexistence'
                        ? 'Launch WhatsApp Mobile Coexistence Onboarding'
                        : 'Connect WhatsApp with Facebook'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Dedicated Meta Webhook Configuration Section */}
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Webhook className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-neutral-900 dark:text-white text-xs">
                    Meta Webhook Configuration
                  </h4>
                  <p className="text-[10px] text-neutral-500">
                    Incoming messages, delivery status &amp; template approvals sync
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWebhookGuide(!showWebhookGuide)}
                className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
              >
                <span>{showWebhookGuide ? 'Hide Details' : 'Show Details'}</span>
                {showWebhookGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showWebhookGuide && (
              <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 space-y-3">
                <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Meta Developer Console mein Webhook configure karne ke liye niche di gayi <strong>Callback URL</strong> aur <strong>Verify Token</strong> ko copy karke paste karein:
                </p>

                {/* Callback URL */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      1. Callback URL (Webhook URL):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(webhookUrl, 'url')}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 font-medium cursor-pointer text-[10px]"
                    >
                      {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUrl ? 'Copied URL!' : 'Copy URL'}</span>
                    </button>
                  </div>
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-2.5 rounded-xl font-mono text-[11px] text-neutral-800 dark:text-neutral-200 break-all select-all flex items-center justify-between">
                    <span>{webhookUrl}</span>
                  </div>
                </div>

                {/* Verify Token */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      2. Verify Token:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(verifyToken, 'token')}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 font-medium cursor-pointer text-[10px]"
                    >
                      {copiedToken ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedToken ? 'Copied Token!' : 'Copy Token'}</span>
                    </button>
                  </div>
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-2.5 rounded-xl font-mono text-[11px] text-neutral-800 dark:text-neutral-200 break-all select-all">
                    {verifyToken}
                  </div>
                </div>

                {/* Subscription Fields */}
                <div className="pt-1">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300 text-[11px] block mb-1">
                    3. Webhook Subscribed Fields (Meta Console mein Manage button daba kar check karein):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-semibold border border-emerald-300 dark:border-emerald-800">
                      messages
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-semibold border border-emerald-300 dark:border-emerald-800">
                      message_template_status_update
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-neutral-200/60 dark:border-neutral-700/60 text-[11px]">
                  <span className="text-neutral-500">Kahan paste karein? Meta Portal &gt; WhatsApp &gt; Configuration &gt; Webhook</span>
                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 font-medium"
                  >
                    <span>Open Meta Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
