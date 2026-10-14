import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Facebook,
  Key,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Shield,
  Loader2,
  Phone,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { MaskedIdDisplay } from './MaskedIdDisplay.tsx';

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
  const {
    accounts,
    metaStatus,
    connectViaEmbeddedSignup,
    connectManualAccount,
    testMetaCredentials,
    forceUnsubscribeOldApp,
  } = useWhatsAppAccounts();
  const { userProfile, organization } = useAuth();
  const toast = useToast();

  const isMaster = userProfile?.role === 'master_admin';
  const maxNumbersAllowed = isMaster
    ? 100
    : organization?.subscription?.maxWhatsAppNumbers ||
      userProfile?.subscription?.maxWhatsAppNumbers ||
      10;
  const isLimitReached = !isMaster && accounts.length >= maxNumbersAllowed;

  // Tab: 'direct' (Phone number / ID), 'embedded' (Facebook SDK), or 'fix_wbbox' (Error #2655093 fixer)
  const [activeTab, setActiveTab] = useState<'direct' | 'embedded' | 'fix_wbbox'>('direct');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkSuccessMsg, setUnlinkSuccessMsg] = useState<string | null>(null);
  const [unlinkHelpMsg, setUnlinkHelpMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [embeddedMode, setEmbeddedMode] = useState<'coexistence' | 'standard'>('coexistence');

  // Direct connect fields - Real Meta details (always blank by default)
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [pin, setPin] = useState('');

  // Reset form whenever modal opens so it is always clean & blank
  useEffect(() => {
    if (isOpen) {
      setPhoneNumberId('');
      setWabaId('');
      setCustomToken('');
      setDisplayPhone('');
      setBusinessName('');
      setPin('');
      setError(null);
      setSuccess(null);
      setDiagnostics(null);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

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

    const hasAppId = Boolean(metaStatus?.appId && metaStatus.appId.trim() !== '');
    const hasConfigId = Boolean(metaStatus?.configId && metaStatus.configId.trim() !== '');

    if (isLimitReached) {
      const msg = `Your plan allows ${maxNumbersAllowed} WhatsApp connection${maxNumbersAllowed > 1 ? 's' : ''}. Please upgrade your plan to add another connection.`;
      setError(msg);
      toast.showWarning('Limit Reached', msg);
      return;
    }

    if (!hasAppId || !hasConfigId) {
      const msg = 'Meta App ID ya Facebook Login Configuration ID set nahi hai. Kripya Admin Panel > Meta App Config me ja kar apni details save karein.';
      setError(msg);
      toast.showWarning('Meta App Configuration Missing', msg);
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

  const handleUnlinkOldProvider = async () => {
    if (!wabaId.trim()) {
      const msg = 'Please enter your WABA ID (WhatsApp Business Account ID) to unlink the previous provider.';
      setError(msg);
      toast.showWarning('WABA ID Required', msg);
      return;
    }

    setUnlinking(true);
    setError(null);
    setUnlinkSuccessMsg(null);
    setUnlinkHelpMsg(null);

    const res = await forceUnsubscribeOldApp({
      wabaId: wabaId.trim(),
      customToken: customToken.trim() || undefined,
    });

    setUnlinking(false);

    if (res.success) {
      setUnlinkSuccessMsg(res.message || 'Successfully unlinked previous partner/Wbbox subscription!');
      toast.showSuccess('Old Provider Unlinked', res.message || 'Successfully unlinked old provider!');
    } else {
      setError(res.error || 'Failed to unlink old provider.');
      if (res.help) {
        setUnlinkHelpMsg(res.help);
      }
      toast.showError('Unlink Failed', res.error);
    }
  };

  const handleDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLimitReached) {
      const msg = `Your plan allows ${maxNumbersAllowed} WhatsApp connection${maxNumbersAllowed > 1 ? 's' : ''}. Please upgrade your plan to add another connection.`;
      setError(msg);
      toast.showWarning('Limit Reached', msg);
      return;
    }

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
              setUnlinkSuccessMsg(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'embedded'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <Facebook className="w-4 h-4" />
            <span>Facebook Embedded Signup (V4)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('fix_wbbox');
              setError(null);
              setUnlinkSuccessMsg(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'fix_wbbox'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Fix #2655093 (Unlink Wbbox)</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {isLimitReached && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start space-x-3 text-amber-900 dark:text-amber-200 text-xs">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-bold text-sm">WhatsApp Account Connection Limit Reached</p>
                <p className="leading-relaxed">
                  Your plan allows {maxNumbersAllowed} WhatsApp connection{maxNumbersAllowed > 1 ? 's' : ''}. Please upgrade your plan to add another connection.
                </p>
              </div>
            </div>
          )}

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
                    type="password"
                    required
                    placeholder="••••••••••••"
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
                    type="password"
                    required
                    placeholder="••••••••••••"
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
                    placeholder="e.g. +91 9876543210"
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
                    placeholder="e.g. My Business Name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    6-Digit PIN <span className="text-neutral-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Optional (e.g. 123456)"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs tracking-widest text-center"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Meta 2-Step Security PIN (Zaroori nahi hai, ise khali chhod sakte hain)
                  </p>
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
          ) : activeTab === 'embedded' ? (
            <div className="space-y-4">
              <div className="bg-neutral-50 dark:bg-neutral-800/40 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Meta Embedded Signup (Facebook Login v22.0 &bull; V4 Ready)</span>
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
                        Keeps WhatsApp Business App working on mobile. Uses QR code scan &amp; <code className="bg-neutral-200 dark:bg-neutral-800 px-1 py-0.5 rounded text-[10px]">featureType: &quot;whatsapp_business_app_onboarding&quot;</code>.
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

              {Boolean(metaStatus?.appId && metaStatus?.configId) ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 space-y-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center space-x-2 font-semibold">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>Meta Embedded Signup Ready ({embeddedMode === 'coexistence' ? 'Coexistence Mode' : 'Standard'})</span>
                  </div>
                  <div className="text-[11px] space-y-1 font-mono text-neutral-700 dark:text-neutral-300 bg-white/70 dark:bg-neutral-900/60 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40">
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-neutral-500 font-sans">App ID:</span>
                      <MaskedIdDisplay
                        value={metaStatus?.appId}
                        label="Meta App ID"
                        digitsToShow={1}
                      />
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-neutral-500 font-sans">Config ID:</span>
                      <MaskedIdDisplay
                        value={metaStatus?.configId}
                        label="Configuration ID"
                        digitsToShow={1}
                      />
                    </div>
                    <div>
                      sessionInfoVersion: <strong className="text-emerald-700 dark:text-emerald-400">&quot;3&quot;</strong>
                    </div>
                    <div>
                      featureType:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {embeddedMode === 'coexistence' ? '&quot;whatsapp_business_app_onboarding&quot;' : 'none'}
                      </strong>
                    </div>
                  </div>
                  {metaStatus?.appId === metaStatus?.configId && (
                    <div className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                      <div className="flex items-center space-x-1.5 font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Attention: Config ID aur App ID dono same hain!</span>
                      </div>
                      <p className="text-[10px] leading-relaxed">
                        Meta popup me <em>&quot;config_id is required&quot;</em> error aane ka kaaran yeh hai ki aapne App ID ko hi Config ID me paste kiya hai. Asli <strong>Configuration ID</strong> Meta Developer Console ke <strong>WhatsApp &gt; Quickstart</strong> ya <strong>Facebook Login for Business &gt; Configurations</strong> se copy karke Admin panel me update karein.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 flex items-start space-x-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Meta App ID &amp; Configuration ID Not Set Yet
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                      Embedded Signup shuru karne ke liye aapke Meta Developer App ka <strong>Meta App ID</strong> aur <strong>Facebook Login Configuration ID</strong> zaroori hai. Admin panel ke <strong>Meta App Config</strong> mein details daal kar <strong>Save</strong> karein.
                    </p>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400 pt-0.5">
                      💡 Ya fir upar <strong>Real Meta API Credentials</strong> tab par click karke direct Phone Number ID aur Token se connect kar sakte hain.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleEmbeddedSignup}
                disabled={loading || !Boolean(metaStatus?.appId && metaStatus?.configId)}
                className="w-full py-3.5 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium flex items-center justify-center space-x-2 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
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
                      {Boolean(metaStatus?.appId && metaStatus?.configId)
                        ? embeddedMode === 'coexistence'
                          ? 'Launch WhatsApp Mobile Coexistence Onboarding'
                          : 'Connect WhatsApp with Facebook'
                        : 'Admin Panel me Meta App ID & Config ID Save Karein'}
                    </span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Fix Error #2655093 / Unlink Old Provider Tab */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-semibold text-amber-900 dark:text-amber-200 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Unlink Old Provider / Fix Meta Error #2655093</span>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-200/70 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                    Naya Account Model Tool
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  Agar aapka WhatsApp number pehle kisi doosre provider (jaise <strong>Wbbox</strong> ya purane BSP) ke paas connect tha aur aapko Meta error <strong>#2655093</strong> <em>(&quot;Phone number is already associated with another WhatsApp Business Account&quot;)</em> mil raha hai, to Meta Graph API ko purani partner subscription <code>DELETE /subscribed_apps</code> call bhejna zaroori hai.
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Yeh tool aapke WABA ko purane provider se azaad kar dega taaki Meta ka Naya Account Model aapke number ko seamlessly convert kar sake.
                </p>
              </div>

              {unlinkSuccessMsg && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs space-y-2">
                  <div className="flex items-center space-x-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Purana Provider Unlinked!</span>
                  </div>
                  <p className="leading-relaxed">{unlinkSuccessMsg}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('direct');
                      setUnlinkSuccessMsg(null);
                    }}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <span>Ab WhatsApp Account Connect Karein</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {unlinkHelpMsg && (
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs space-y-1">
                  <p className="font-semibold flex items-center space-x-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>Meta Business Suite Manual Step</span>
                  </p>
                  <p className="leading-relaxed">{unlinkHelpMsg}</p>
                </div>
              )}

              <div className="space-y-3 bg-neutral-50 dark:bg-neutral-800/40 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    WhatsApp Business Account ID (WABA ID) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    placeholder="e.g. 108394857291039"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    WABA ID aapke Meta Business Manager &gt; WhatsApp Accounts me dikhta hai.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    System User Access Token <span className="text-neutral-400 font-normal">(Optional - Leave blank to use Admin Token)</span>
                  </label>
                  <input
                    type="password"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    placeholder="EAAG... (Leave empty to use configured Meta Token)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleUnlinkOldProvider}
                    disabled={unlinking || !wabaId.trim()}
                    className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer text-xs"
                  >
                    {unlinking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Releasing Old Provider from Meta Graph API...</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        <span>Force Unlink Old Provider (/subscribed_apps)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 3 Updates Quick Summary Card */}
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 block text-xs">
                  📌 WhatsApp Meta 2026 Rules Summary:
                </span>
                <ul className="space-y-1 list-disc pl-4 leading-relaxed">
                  <li>
                    <strong>Naya Account Model:</strong> Meta aapka purana WABA delete nahi karega; same WABA ID convert hoti hai.
                  </li>
                  <li>
                    <strong>Embedded Signup V4:</strong> V2 band ho chuka hai. Hamara system v22.0 SDK ke sath full V4 compliant hai.
                  </li>
                  <li>
                    <strong>14-Day Coexistence Rule:</strong> Co-existence connect karne ke baad mobile me WhatsApp Business app ko har 14 din me 1 baar open zaroor karein taaki link auto-disconnect na ho.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
