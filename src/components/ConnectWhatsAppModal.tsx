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
  RefreshCw,
  ArrowRightLeft,
  Lock,
  Layers,
  Send,
  Check,
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
    checkWabaMigration,
    triggerWabaMigration,
    connectManualAccount,
    testMetaCredentials,
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

  // Active Tab: 'embedded' (Meta V4), 'migration' (Existing WABA Migration), or 'direct' (Manual)
  const [activeTab, setActiveTab] = useState<'embedded' | 'migration' | 'direct'>('embedded');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  // Embedded Signup V4 flow mode: coexistence | standard | migration
  const [embeddedMode, setEmbeddedMode] = useState<'coexistence' | 'standard' | 'migration'>('coexistence');

  // Direct connect fields
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [pin, setPin] = useState('');

  // WABA Migration State
  const [migrationWabaId, setMigrationWabaId] = useState('');
  const [migrationPhoneId, setMigrationPhoneId] = useState('');
  const [migrationToken, setMigrationToken] = useState('');
  const [migrationPin, setMigrationPin] = useState('');
  const [migrationOtpCode, setMigrationOtpCode] = useState('');
  const [migrationCodeMethod, setMigrationCodeMethod] = useState<'SMS' | 'VOICE'>('SMS');
  const [checkingMigration, setCheckingMigration] = useState(false);
  const [triggeringMigration, setTriggeringMigration] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const [migrationCheckResult, setMigrationCheckResult] = useState<{
    eligible?: boolean;
    waba?: any;
    phone?: any;
    phoneNumbers?: any[];
    migrationStatus?: string;
    recommendation?: string;
    metaGraphVersion?: string;
  } | null>(null);

  // Reset form state on modal open
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

      // Reset migration states
      setMigrationWabaId('');
      setMigrationPhoneId('');
      setMigrationToken('');
      setMigrationPin('');
      setMigrationOtpCode('');
      setMigrationCheckResult(null);
      setOtpRequested(false);
      setOtpVerified(false);
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

  // 1. Meta Embedded Signup V4 Launch
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
      const msg = 'Meta App ID ya Facebook Login Configuration ID set nahi hai. Kripya Admin Panel > Meta App Config me ja kar details save karein.';
      setError(msg);
      toast.showWarning('Meta App Configuration Missing', msg);
      return;
    }

    setLoading(true);

    try {
      await connectViaEmbeddedSignup({
        isCoexistence: embeddedMode === 'coexistence',
        featureType:
          embeddedMode === 'coexistence'
            ? 'whatsapp_business_app_onboarding'
            : embeddedMode === 'migration'
            ? 'whatsapp_waba_migration'
            : undefined,
        sessionInfoVersion: '4', // Enforce Meta Embedded Signup V4 (15 Oct 2026 standard)
        migrationMode: embeddedMode === 'migration',
      });
      setSuccess('WhatsApp Account successfully connected via Meta Embedded Signup V4!');
      toast.showSuccess('WhatsApp Connected', 'Account successfully connected via Meta Embedded Signup V4 (15 Oct 2026 Compliant)!');
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

  // 2. Check Existing WABA Migration Eligibility
  const handleCheckMigration = async () => {
    const cleanPhone = migrationPhoneId.trim();
    const cleanWaba = migrationWabaId.trim();

    if (!cleanPhone && !cleanWaba) {
      const msg = 'Please enter either an existing WABA ID or Phone Number ID to check migration.';
      setError(msg);
      toast.showWarning('Identifier Required', msg);
      return;
    }

    setCheckingMigration(true);
    setError(null);
    setMigrationCheckResult(null);

    try {
      const res = await checkWabaMigration({
        wabaId: cleanWaba || undefined,
        phoneNumberId: cleanPhone || undefined,
        customToken: migrationToken.trim() || undefined,
      });

      if (res.success && res.eligible) {
        setMigrationCheckResult(res);
        toast.showSuccess(
          'Migration Assessment Ready',
          res.recommendation || 'Existing WABA & Phone verified on Meta Graph API.'
        );
      } else {
        const errorText = res.error || 'Could not verify existing WABA on Meta.';
        setError(errorText);
        toast.showError('Migration Check Failed', errorText);
      }
    } catch (err: any) {
      const errorText = err?.message || 'Error communicating with Meta migration service.';
      setError(errorText);
      toast.showError('Migration Check Error', errorText);
    } finally {
      setCheckingMigration(false);
    }
  };

  // 3. Request OTP for Migration (if unverified phone)
  const handleRequestMigrationOtp = async (method: 'SMS' | 'VOICE') => {
    const cleanPhone = (migrationCheckResult?.phone?.id || migrationPhoneId).trim();
    if (!cleanPhone) {
      toast.showWarning('Phone ID Required', 'Please enter a valid Phone Number ID.');
      return;
    }

    setRequestingOtp(true);
    setMigrationCodeMethod(method);
    setError(null);

    try {
      const res = await triggerWabaMigration({
        wabaId: migrationWabaId.trim(),
        phoneNumberId: cleanPhone,
        action: 'request_code',
        codeMethod: method,
        customToken: migrationToken.trim() || undefined,
      });

      if (res.success) {
        setOtpRequested(true);
        toast.showSuccess(
          'Verification Code Dispatched',
          res.message || `Meta has dispatched a verification code via ${method}.`
        );
      } else {
        setError(res.error || 'Failed to request OTP code.');
        toast.showError('OTP Request Failed', res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Error requesting verification OTP.');
    } finally {
      setRequestingOtp(false);
    }
  };

  // 4. Verify OTP Code
  const handleVerifyMigrationOtp = async () => {
    if (!migrationOtpCode.trim()) {
      toast.showWarning('Code Required', 'Please enter the verification code received on your phone.');
      return;
    }

    const cleanPhone = (migrationCheckResult?.phone?.id || migrationPhoneId).trim();
    setVerifyingOtp(true);
    setError(null);

    try {
      const res = await triggerWabaMigration({
        wabaId: migrationWabaId.trim(),
        phoneNumberId: cleanPhone,
        action: 'verify_code',
        otpCode: migrationOtpCode.trim(),
        customToken: migrationToken.trim() || undefined,
      });

      if (res.success) {
        setOtpVerified(true);
        toast.showSuccess('Phone Verified', 'Phone number code verified on Meta! Now finalize with PIN.');
      } else {
        setError(res.error || 'Failed to verify OTP code.');
        toast.showError('Verification Failed', res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Error verifying OTP code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // 5. Trigger Final WABA & Phone Migration (Register PIN + Subscribed Apps + Save Account)
  const handleTriggerFinalMigration = async () => {
    if (isLimitReached) {
      const msg = `Your plan allows ${maxNumbersAllowed} WhatsApp connection${maxNumbersAllowed > 1 ? 's' : ''}. Please upgrade your plan.`;
      setError(msg);
      toast.showWarning('Limit Reached', msg);
      return;
    }

    const cleanPhone = (migrationCheckResult?.phone?.id || migrationPhoneId).trim();
    const cleanWaba = (migrationCheckResult?.waba?.id || migrationWabaId).trim();

    if (!cleanPhone) {
      const msg = 'Phone Number ID is required to execute migration.';
      setError(msg);
      toast.showWarning('Phone ID Required', msg);
      return;
    }

    setTriggeringMigration(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await triggerWabaMigration({
        wabaId: cleanWaba,
        phoneNumberId: cleanPhone,
        pin: migrationPin.trim() || '123456',
        action: 'register_and_migrate',
        customToken: migrationToken.trim() || undefined,
      });

      if (res.success && res.migrated) {
        const msg = `WABA ${cleanWaba || 'Account'} and WhatsApp Phone ${cleanPhone} successfully migrated to CloudWABA Platform!`;
        setSuccess(msg);
        toast.showSuccess('Migration Successful', msg);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
      } else {
        let errorText = res.error || 'Failed to complete WABA migration with Meta.';
        if (errorText.toLowerCase().includes('smb')) {
          errorText = 'Meta Rule: "Register endpoint is not available for SMB businesses". Yeh account SMB category me hai. Kripya upar pehle tab "Embedded Signup V4" par click karke connect karein!';
        }
        setError(errorText);
        toast.showError('Migration Notice', errorText);
      }
    } catch (err: any) {
      const errorText = err?.message || 'Error executing WABA migration.';
      setError(errorText);
      toast.showError('Migration Error', errorText);
    } finally {
      setTriggeringMigration(false);
    }
  };

  // 6. Direct Connect Form Handler
  const handleDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLimitReached) {
      const msg = `Your plan allows ${maxNumbersAllowed} WhatsApp connection${maxNumbersAllowed > 1 ? 's' : ''}. Please upgrade your plan.`;
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

  // 7. Test Direct Meta Credentials
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
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                  Connect WhatsApp Business Account
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  V4 Oct 2026 Ready
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Official Meta Cloud API v22.0 &bull; Embedded Signup V4 &bull; WABA Migration Engine
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

        {/* Tab selection: 3 Tabs (Embedded V4, WABA Migration, Direct Credentials) */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 px-6 pt-2 bg-neutral-50/40 dark:bg-neutral-900/40 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('embedded');
              setError(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'embedded'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <Facebook className="w-4 h-4" />
            <span>Embedded Signup V4</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
              New Standard
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('migration');
              setError(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'migration'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>WABA Migration</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/10 text-purple-600 font-bold border border-purple-500/20">
              Migrate BSP
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('direct');
              setError(null);
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'direct'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Direct Credentials</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Plan limit warning */}
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

          {/* TAB 1: EMBEDDED SIGNUP V4 */}
          {activeTab === 'embedded' && (
            <div className="space-y-4">
              {/* Meta 15 Oct 2026 Compliance Banner */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200/80 dark:border-emerald-800/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-bold text-xs text-emerald-900 dark:text-emerald-200">
                      Meta Embedded Signup V4 Standard (15 Oct 2026 Mandate)
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-600 text-white font-mono px-2 py-0.5 rounded-full font-bold">
                    sessionInfoVersion: "4"
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  Meta has scheduled the complete deprecation of Embedded Signup v2 and v3 for <strong>October 15, 2026</strong>. This platform is upgraded to <strong>Embedded Signup V4</strong> with Unified Onboarding, Phone-First verification, and automated WABA migration support.
                </p>
              </div>

              {/* Onboarding Mode Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Select Onboarding Architecture:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEmbeddedMode('coexistence')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      embeddedMode === 'coexistence'
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        📱 Coexistence Mode
                      </span>
                      {embeddedMode === 'coexistence' && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <p className="text-[10px] opacity-80 leading-normal">
                      Retains mobile WhatsApp Business App. Dual access with Cloud API.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEmbeddedMode('standard')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      embeddedMode === 'standard'
                        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        ☁️ Standard Cloud API
                      </span>
                      {embeddedMode === 'standard' && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <p className="text-[10px] opacity-80 leading-normal">
                      Dedicated or virtual business number with high-speed broadcasting.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEmbeddedMode('migration')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      embeddedMode === 'migration'
                        ? 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 ring-2 ring-purple-500/20'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        🔄 Existing WABA
                      </span>
                      {embeddedMode === 'migration' && (
                        <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <p className="text-[10px] opacity-80 leading-normal">
                      Migrate existing WABA &amp; numbers via Meta V4 dialog.
                    </p>
                  </button>
                </div>
              </div>

              {/* Configuration Status Inspection Box */}
              {Boolean(metaStatus?.appId && metaStatus?.configId) ? (
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Meta Embedded Signup V4 Active Parameters</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full font-bold">
                      Graph API v22.0
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white dark:bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                    <div>
                      <span className="text-neutral-500 font-sans block text-[10px]">Meta App ID:</span>
                      <MaskedIdDisplay value={metaStatus?.appId} label="Meta App ID" digitsToShow={1} />
                    </div>
                    <div>
                      <span className="text-neutral-500 font-sans block text-[10px]">Facebook Login Config ID:</span>
                      <MaskedIdDisplay value={metaStatus?.configId} label="Configuration ID" digitsToShow={1} />
                    </div>
                    <div>
                      <span className="text-neutral-500 font-sans block text-[10px]">Session Info Version:</span>
                      <strong className="text-emerald-700 dark:text-emerald-400">"4" (Oct 2026 Ready)</strong>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-sans block text-[10px]">Feature Flag:</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 truncate block">
                        {embeddedMode === 'coexistence'
                          ? 'whatsapp_business_app_onboarding'
                          : embeddedMode === 'migration'
                          ? 'whatsapp_waba_migration'
                          : 'cloud_api'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 space-y-1">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    Meta App ID &amp; Configuration ID Not Set
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Go to <strong>Admin Settings &gt; Meta App Config</strong> to configure your Meta App ID and Facebook Login Configuration ID, or use the <strong>Direct Credentials</strong> tab to connect immediately.
                  </p>
                </div>
              )}

              {/* Launch V4 Embedded Signup Button */}
              <button
                type="button"
                onClick={handleEmbeddedSignup}
                disabled={loading || !Boolean(metaStatus?.appId && metaStatus?.configId)}
                className="w-full py-3.5 px-4 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium flex items-center justify-center space-x-2 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Connecting with Meta Embedded Signup V4...</span>
                  </>
                ) : (
                  <>
                    <Facebook className="w-5 h-5 fill-current" />
                    <span>
                      {embeddedMode === 'coexistence'
                        ? 'Launch Meta Embedded Signup V4 (Coexistence)'
                        : embeddedMode === 'migration'
                        ? 'Launch Meta Embedded Signup V4 (WABA Migration)'
                        : 'Launch Meta Embedded Signup V4 (Cloud API)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: EXISTING WABA & PHONE NUMBER MIGRATION */}
          {activeTab === 'migration' && (
            <div className="space-y-4">
              {/* Migration Guidance Banner */}
              <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 space-y-1.5">
                <div className="flex items-center space-x-2">
                  <ArrowRightLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="font-bold text-xs text-purple-900 dark:text-purple-200">
                    Existing WABA &amp; Phone Number Migration Engine
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 dark:text-purple-300 leading-relaxed">
                  Easily migrate an existing WhatsApp Business Account or phone number from another Business Solution Provider (Twilio, Gupshup, 360dialog, Infobip) or on-premise WhatsApp client directly into CloudWABA with zero downtime.
                </p>
              </div>

              {/* Step 1: Input Identifiers to Inspect */}
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-3">
                <span className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-[10px]">
                    1
                  </span>
                  <span>Inspect Existing WABA &amp; WhatsApp Phone on Meta</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Existing WhatsApp Business Account (WABA) ID:
                    </label>
                    <input
                      type="text"
                      value={migrationWabaId || ''}
                      onChange={(e) => setMigrationWabaId(e.target.value)}
                      placeholder="e.g. 109284719283746"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      WhatsApp Phone Number ID:
                    </label>
                    <input
                      type="text"
                      value={migrationPhoneId || ''}
                      onChange={(e) => setMigrationPhoneId(e.target.value)}
                      placeholder="e.g. 192837465019283"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
                    <span>Meta Access Token (System User Token):</span>
                    <span className="text-[10px] text-neutral-400 font-normal">
                      Leave blank to use Server System Token
                    </span>
                  </label>
                  <input
                    type="password"
                    value={migrationToken || ''}
                    onChange={(e) => setMigrationToken(e.target.value)}
                    placeholder="EAAB..."
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCheckMigration}
                  disabled={checkingMigration || (!migrationPhoneId.trim() && !migrationWabaId.trim())}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {checkingMigration ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Inspecting Meta Graph API...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Check WABA Migration Eligibility</span>
                    </>
                  )}
                </button>
              </div>

              {/* Step 2: Inspection Assessment Card */}
              {migrationCheckResult && (
                <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-purple-200 dark:border-purple-800/70 space-y-3.5 animate-fadeIn shadow-xs">
                  <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
                    <span className="font-bold text-xs text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>WABA Migration Assessment Result</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Eligible for Migration
                    </span>
                  </div>

                  {/* WABA & Phone Details Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 space-y-1">
                      <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider block">
                        Account / Business Name
                      </span>
                      <strong className="text-neutral-900 dark:text-white text-sm block truncate">
                        {migrationCheckResult.phone?.verifiedName ||
                          migrationCheckResult.waba?.name ||
                          'WhatsApp Business Account'}
                      </strong>
                      <span className="text-[11px] font-mono text-neutral-500">
                        WABA ID: {migrationCheckResult.waba?.id || migrationWabaId}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 space-y-1">
                      <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider block">
                        Verified WhatsApp Number
                      </span>
                      <strong className="text-emerald-700 dark:text-emerald-400 text-sm block font-mono">
                        {migrationCheckResult.phone?.displayPhoneNumber ||
                          migrationCheckResult.phone?.id ||
                          'Phone ID ' + migrationPhoneId}
                      </strong>
                      <div className="flex items-center space-x-2 text-[10px]">
                        <span className="px-1.5 py-0.2 rounded font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          {migrationCheckResult.phone?.codeVerificationStatus || 'VERIFIED'}
                        </span>
                        <span className="px-1.5 py-0.2 rounded font-semibold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                          {migrationCheckResult.phone?.qualityRating || 'GREEN'} Quality
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 bg-purple-50/50 dark:bg-purple-950/20 p-2.5 rounded-xl border border-purple-200/40">
                    💡 <strong>Next Step:</strong> {migrationCheckResult.recommendation}
                  </p>

                  {/* 2FA PIN or OTP Challenge */}
                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-2.5">
                    <span className="font-semibold text-xs text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                      <Lock className="w-4 h-4 text-purple-600" />
                      <span>Two-Step Verification PIN (Required to Take Over Routing)</span>
                    </span>

                    <div className="space-y-1">
                      <input
                        type="password"
                        maxLength={6}
                        value={migrationPin || ''}
                        onChange={(e) => setMigrationPin(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="6-Digit Registration PIN (e.g. 123456)"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono tracking-widest text-center focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-[10px] text-neutral-500">
                        Enter the 6-digit PIN set on your previous BSP or client. This authenticates the number transfer to Meta Cloud API.
                      </p>
                    </div>

                    {/* Optional OTP Verification buttons if number is unverified */}
                    {migrationCheckResult.phone?.codeVerificationStatus !== 'VERIFIED' && (
                      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
                        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block">
                          Phone requires SMS/Voice OTP verification:
                        </span>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRequestMigrationOtp('SMS')}
                            disabled={requestingOtp}
                            className="flex-1 py-1.5 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 text-xs font-semibold cursor-pointer"
                          >
                            Send SMS OTP
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestMigrationOtp('VOICE')}
                            disabled={requestingOtp}
                            className="flex-1 py-1.5 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 text-xs font-semibold cursor-pointer"
                          >
                            Voice Call OTP
                          </button>
                        </div>
                        {otpRequested && (
                          <div className="flex space-x-2 pt-1">
                            <input
                              type="text"
                              value={migrationOtpCode || ''}
                              onChange={(e) => setMigrationOtpCode(e.target.value)}
                              placeholder="Enter 6-digit OTP code"
                              className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyMigrationOtp}
                              disabled={verifyingOtp}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs cursor-pointer"
                            >
                              {verifyingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify Code'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Final Migration Trigger Button */}
                  <button
                    type="button"
                    onClick={handleTriggerFinalMigration}
                    disabled={triggeringMigration}
                    className="w-full py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer disabled:opacity-50 text-xs"
                  >
                    {triggeringMigration ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Migrating WABA to CloudWABA Platform...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Trigger WABA &amp; Phone Migration to Cloud API</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DIRECT META CREDENTIALS (MANUAL) */}
          {activeTab === 'direct' && (
            <form onSubmit={handleDirectConnect} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 space-y-1">
                <p className="font-semibold text-blue-900 dark:text-blue-300 flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Direct Meta WhatsApp Cloud API Credentials</span>
                </p>
                <p className="text-[11px] text-blue-800 dark:text-blue-300/90 leading-relaxed">
                  Enter your Meta Phone Number ID, WABA ID, and System User Token to connect directly without popup dialogs.
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
                    value={phoneNumberId || ''}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    WhatsApp Business Account ID (WABA ID)
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={wabaId || ''}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Token Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    System User Permanent Access Token <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showToken ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showToken ? 'text' : 'password'}
                  required
                  placeholder="EAAB..."
                  value={customToken || ''}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              {/* Grid 2: Display Phone & Business Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Display Mobile Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={displayPhone || ''}
                    onChange={(e) => setDisplayPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Verified Business Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Acme Enterprises"
                    value={businessName || ''}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                </div>
              </div>

              {/* 6-Digit PIN */}
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  6-Digit Registration PIN (Optional)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="123456"
                  value={pin || ''}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs text-center"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestMetaConnection}
                  disabled={testing || !customToken.trim()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-medium flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 text-xs"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>Testing Live Graph API...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4 text-emerald-600" />
                      <span>Test Meta Connection</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50 text-xs"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting &amp; Registering...</span>
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
          )}
        </div>
      </div>
    </div>
  );
};
