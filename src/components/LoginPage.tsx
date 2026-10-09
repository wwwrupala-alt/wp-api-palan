import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  ShieldCheck,
  Lock,
  ArrowRight,
  AlertCircle,
  Loader2,
  KeyRound,
  CheckCircle2,
  Crown,
  Users,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  X,
  Shield,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { UserRole } from '../types/index.ts';

interface LoginPageProps {
  onOpenLegal?: (doc: 'privacy' | 'terms') => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onOpenLegal }) => {
  const { signInWithCredentials, dbConnected } = useAuth();

  const handleOpenLegal = (doc: 'privacy' | 'terms') => {
    if (onOpenLegal) {
      onOpenLegal(doc);
    } else {
      window.history.pushState({}, '', doc === 'privacy' ? '/privacy-policy' : '/terms-of-service');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // Detect entry point path for /master-login, /admin-login, /login
  const getInitialRole = (): 'user' | 'admin' | 'master_admin' => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('master')) return 'master_admin';
    if (path.includes('admin')) return 'admin';
    return 'admin';
  };

  const [loginRole, setLoginRole] = useState<'user' | 'admin' | 'master_admin'>(getInitialRole);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Clean up any residual logout notice from storage immediately
  useEffect(() => {
    try {
      localStorage.removeItem('cw_logout_notice');
    } catch {}
  }, []);

  // Auto-detected role state
  const [detectedRoleInfo, setDetectedRoleInfo] = useState<{
    found: boolean;
    role?: 'user' | 'admin' | 'master_admin' | 'multiple';
    roleLabel?: string;
    displayName?: string;
  } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Live identifier role lookup
  useEffect(() => {
    const clean = identifier.trim();
    if (!clean || clean.length < 3) {
      setDetectedRoleInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLookingUp(true);
      try {
        const res = await fetch(`/api/auth/lookup-identifier?identifier=${encodeURIComponent(clean)}`);
        const data = await res.json();
        if (data.found) {
          setDetectedRoleInfo(data);
          if (data.role === 'admin') {
            setLoginRole('admin');
          } else if (data.role === 'master_admin') {
            setLoginRole('master_admin');
          } else if (data.role === 'user') {
            setLoginRole('user');
          }
        } else {
          setDetectedRoleInfo({ found: false });
        }
      } catch {
        // ignore network error
      } finally {
        setIsLookingUp(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [identifier]);

  // Change Password Modal State (for User, Admin, and Master Admin)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [cpIdentifier, setCpIdentifier] = useState('');
  const [cpOldPassword, setCpOldPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpShowOldPass, setCpShowOldPass] = useState(false);
  const [cpShowNewPass, setCpShowNewPass] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpSuccess, setCpSuccess] = useState<string | null>(null);

  // Sync inputs when manually selecting tab role
  const handleSelectRole = (role: 'user' | 'admin' | 'master_admin') => {
    setLoginRole(role);
    setError(null);
    setInfoMessage(null);
    if (role === 'master_admin') {
      if (!identifier.trim()) {
        setIdentifier('master@cloudwaba.com');
        setPassword('Master@12345');
      }
    } else {
      if (identifier === 'master@cloudwaba.com') {
        setIdentifier('');
        setPassword('');
      }
    }
  };

  const handleClearInputs = () => {
    setIdentifier('');
    setPassword('');
    setError(null);
    setInfoMessage(null);
    setDetectedRoleInfo(null);
  };

  const handleCredentialAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError('Please enter your mobile number or email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      // If detected role is specific, use that; otherwise use active loginRole
      const targetRole = detectedRoleInfo?.role === 'multiple' ? undefined : (loginRole as UserRole);
      await signInWithCredentials(identifier.trim(), password.trim(), targetRole);
    } catch (err: any) {
      const msg = err?.message || 'Authentication failed. Please verify credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChangePassword = () => {
    setCpIdentifier(identifier.trim());
    setCpOldPassword('');
    setCpNewPassword('');
    setCpConfirmPassword('');
    setCpError(null);
    setCpSuccess(null);
    setIsChangePasswordOpen(true);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError(null);
    setCpSuccess(null);

    if (!cpIdentifier.trim()) {
      setCpError('Please enter your Mobile number or Email.');
      return;
    }
    if (!cpOldPassword.trim()) {
      setCpError('Please enter your Old Password.');
      return;
    }
    if (cpNewPassword.length < 6) {
      setCpError('New Password must be at least 6 characters long.');
      return;
    }
    if (cpNewPassword !== cpConfirmPassword) {
      setCpError('New Password and Confirm Password do not match.');
      return;
    }

    setCpLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cpIdentifier.trim(),
          oldPassword: cpOldPassword.trim(),
          newPassword: cpNewPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password.');
      }

      setCpSuccess('Password successfully changed! You can now log in with your new password.');
      setIdentifier(cpIdentifier.trim());
      setPassword(cpNewPassword.trim());
    } catch (err: any) {
      setCpError(err.message || 'Failed to change password. Please check your old password.');
    } finally {
      setCpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-600/30">
          <MessageSquare className="w-6 h-6 fill-white/20" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
          CloudWABA Portal
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Multi-Tenant Meta WhatsApp Business Platform SaaS
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-neutral-900 py-8 px-6 sm:px-10 shadow-xl border border-neutral-200 dark:border-neutral-800 rounded-3xl space-y-6">
          {!dbConnected && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Connecting to Cloud Firestore database...</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start space-x-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="flex-1 font-semibold">{error}</p>
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="flex-1">{infoMessage}</p>
            </div>
          )}

          {/* Email / Mobile Login Form */}
          <form onSubmit={handleCredentialAuth} className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Mobile Number or Email
                </label>
                {(identifier || password) && (
                  <button
                    type="button"
                    onClick={handleClearInputs}
                    className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 flex items-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear fields</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                placeholder="e.g. 9876543210 or admin@domain.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
              />

              {/* LIVE ROLE DETECTION DISPLAY (CLEAN BADGE, NO EXTRA DETAIL) */}
              {isLookingUp && (
                <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-neutral-500 animate-fadeIn">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
                  <span>Checking account role...</span>
                </div>
              )}

              {!isLookingUp && detectedRoleInfo && detectedRoleInfo.found && (
                <div className="mt-2 animate-fadeIn">
                  {detectedRoleInfo.role === 'master_admin' && (
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold shadow-2xs">
                      <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Account Type: <strong>Master Admin</strong></span>
                    </div>
                  )}

                  {detectedRoleInfo.role === 'admin' && (
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold shadow-2xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Account Type: <strong>Admin</strong></span>
                    </div>
                  )}

                  {detectedRoleInfo.role === 'user' && (
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs font-semibold shadow-2xs">
                      <Users className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Account Type: <strong>User</strong></span>
                    </div>
                  )}

                  {detectedRoleInfo.role === 'multiple' && (
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-xs font-semibold shadow-2xs">
                      <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Account Type: <strong>Admin &amp; User</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPassword ? 'Hide password' : 'Show password'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-xl text-white font-medium shadow-xs transition-colors flex items-center justify-center space-x-2 disabled:opacity-60 cursor-pointer text-sm ${
                (detectedRoleInfo?.role === 'master_admin' || loginRole === 'master_admin')
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : (detectedRoleInfo?.role === 'admin' || loginRole === 'admin')
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {detectedRoleInfo?.role === 'master_admin'
                      ? 'Sign In as Master Admin'
                      : detectedRoleInfo?.role === 'admin'
                      ? 'Sign In as Admin'
                      : detectedRoleInfo?.role === 'user'
                      ? 'Sign In as User'
                      : loginRole === 'master_admin'
                      ? 'Sign In as Master Admin'
                      : loginRole === 'admin'
                      ? 'Sign In as Admin'
                      : 'Sign In to Workspace'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Change Password Option for User, Admin & Master */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleOpenChangePassword}
              className="w-full py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-800 dark:text-neutral-200 font-medium text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Change Password</span>
            </button>
          </div>

          {/* Public Legal Compliance Links (No Login Required) */}
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800/70 flex items-center justify-center space-x-3 text-xs text-neutral-500 dark:text-neutral-400">
            <button
              type="button"
              onClick={() => handleOpenLegal('privacy')}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center space-x-1 cursor-pointer font-medium hover:underline underline-offset-4"
              title="View Public Privacy Policy"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Privacy Policy</span>
            </button>
            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <button
              type="button"
              onClick={() => handleOpenLegal('terms')}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center space-x-1 cursor-pointer font-medium hover:underline underline-offset-4"
              title="View Public Terms of Service"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Terms of Service</span>
            </button>
          </div>
        </div>

        {/* Security assurance & Direct URLs */}
        <div className="mt-5 text-center space-y-2">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Multi-tenant workspace isolation &amp; Cloud Firestore</span>
          </div>

          <div className="flex items-center justify-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            <span>Meta Compliance Public URLs:</span>
            <button
              type="button"
              onClick={() => handleOpenLegal('privacy')}
              className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-mono"
            >
              /privacy-policy
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => handleOpenLegal('terms')}
              className="text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-mono"
            >
              /terms-of-service
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Modal (User, Admin, Master Admin) */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/60 dark:bg-neutral-850">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                    Change Password
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Enter your current password and choose a new password
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="p-5 space-y-4 text-xs">
              {cpError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start space-x-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-semibold text-[11px]">{cpError}</span>
                </div>
              )}

              {cpSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 flex items-start space-x-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <div className="text-[11px]">
                    <p className="font-bold">{cpSuccess}</p>
                    <p className="text-[10px] mt-0.5 opacity-90">Your password has been updated successfully. You can now sign in.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  User ID / Mobile Number or Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9876543210 or admin@domain.com"
                  value={cpIdentifier}
                  onChange={(e) => setCpIdentifier(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Current / Old Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setCpShowOldPass(!cpShowOldPass)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {cpShowOldPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{cpShowOldPass ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={cpShowOldPass ? 'text' : 'password'}
                    required
                    placeholder="Enter your current old password"
                    value={cpOldPassword}
                    onChange={(e) => setCpOldPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setCpShowOldPass(!cpShowOldPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {cpShowOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setCpShowNewPass(!cpShowNewPass)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {cpShowNewPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{cpShowNewPass ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={cpShowNewPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Create new password (minimum 6 characters)"
                    value={cpNewPassword}
                    onChange={(e) => setCpNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setCpShowNewPass(!cpShowNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {cpShowNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Confirm New Password
                </label>
                <input
                  type={cpShowNewPass ? 'text' : 'password'}
                  required
                  placeholder="Re-enter new password"
                  value={cpConfirmPassword}
                  onChange={(e) => setCpConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cpLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-60"
                >
                  {cpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
