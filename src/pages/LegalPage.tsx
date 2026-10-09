import React, { useState, useEffect } from 'react';
import {
  Shield,
  FileText,
  ArrowLeft,
  Copy,
  Check,
  Printer,
  Lock,
  Scale,
  Building2,
  Mail,
  CheckCircle2,
  Globe,
  Server,
  Users,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface LegalPageProps {
  initialDoc?: 'privacy' | 'terms';
  onBack?: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({
  initialDoc = 'privacy',
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('term')) return 'terms';
    return initialDoc;
  });

  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Sync route with tab
  const handleTabChange = (tab: 'privacy' | 'terms') => {
    setActiveTab(tab);
    const newPath = tab === 'privacy' ? '/privacy-policy' : '/terms-of-service';
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  };

  const copyUrl = (type: 'privacy' | 'terms') => {
    const origin = window.location.origin;
    const url = `${origin}/${type === 'privacy' ? 'privacy-policy' : 'terms-of-service'}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(type);
      setTimeout(() => setCopiedLink(null), 3000);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleReturn = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState({}, '', '/');
      window.location.href = '/';
    }
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cloudwaba.app';
  const privacyUrl = `${originUrl}/privacy-policy`;
  const termsUrl = `${originUrl}/terms-of-service`;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleReturn}
              className="p-2 -ml-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-150 dark:hover:bg-neutral-800 transition-colors flex items-center space-x-1.5 cursor-pointer text-xs font-semibold"
              title="Return to Login or Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Login</span>
            </button>

            <div className="h-5 w-px bg-neutral-200 dark:border-neutral-800 hidden sm:block" />

            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-neutral-900 dark:text-white">
                  CloudWABA
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold ml-1.5 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800">
                  Legal &amp; Compliance
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={() => copyUrl(activeTab)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {copiedLink === activeTab ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>URL Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Official URL</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner with Direct Meta Verification URL Pills */}
      <div className="bg-linear-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border-b border-neutral-200/60 dark:border-neutral-800/60 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            <span>Official Meta WhatsApp Business Cloud API Compliance</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            CloudWABA Platform Legal Documents
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            These public legal documents govern the use of the CloudWABA Multi-Tenant WhatsApp Business API SaaS platform and satisfy all Meta Developer &amp; Business Account verification standards.
          </p>

          {/* Quick Copy Link Cards for Meta Developer Console */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-2xl mx-auto">
            <div className="p-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Privacy Policy URL
                </p>
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate mt-0.5">
                  {privacyUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyUrl('privacy')}
                className="shrink-0 p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                title="Copy Privacy Policy URL"
              >
                {copiedLink === 'privacy' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Terms of Service URL
                </p>
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate mt-0.5">
                  {termsUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyUrl('terms')}
                className="shrink-0 p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                title="Copy Terms of Service URL"
              >
                {copiedLink === 'terms' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="pt-4 flex items-center justify-center space-x-2">
            <button
              type="button"
              onClick={() => handleTabChange('privacy')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Privacy Policy</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('terms')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeTab === 'terms'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Terms of Service</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Document Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-10 shadow-xs space-y-8">
          {activeTab === 'privacy' ? (
            <div className="space-y-8 text-neutral-800 dark:text-neutral-200">
              {/* Document Header */}
              <div className="border-b border-neutral-200 dark:border-neutral-800 pb-6 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <Shield className="w-4 h-4" />
                  <span>CloudWABA Privacy Policy</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
                  Privacy Policy for CloudWABA Platform
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                  <span><strong>Last Updated:</strong> October 2026</span>
                  <span>•</span>
                  <span><strong>Effective Date:</strong> Immediate</span>
                  <span>•</span>
                  <span><strong>Governing Framework:</strong> Meta WhatsApp Business Platform &amp; GDPR / CCPA Compliance</span>
                </div>
              </div>

              {/* Summary Callout */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 text-xs space-y-1.5">
                <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Key Privacy Highlights for WhatsApp Business API SaaS</span>
                </div>
                <p className="text-emerald-800 dark:text-emerald-400/90 leading-relaxed">
                  CloudWABA provides a multi-tenant platform to connect your Meta WhatsApp Business Accounts (WABA) using official Meta Graph APIs and Cloud APIs. We do not sell your data or your contacts&apos; personal information. Tenant data is isolated with strict database security rules.
                </p>
              </div>

              {/* Section 1 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Introduction &amp; Scope</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  This Privacy Policy describes how CloudWABA (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the Service&rdquo;) collects, uses, stores, and protects personal data and business communication data when you use our multi-tenant SaaS portal, connect WhatsApp Business accounts via Meta Embedded Signup, manage message templates, broadcast campaigns, and interact through the team inbox.
                </p>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  By accessing or registering with CloudWABA, you agree to the collection and use of information in accordance with this policy and Meta&apos;s WhatsApp Business policies.
                </p>
              </section>

              {/* Section 2 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Information We Collect</span>
                </h3>
                <div className="space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                  <p>We collect only the information necessary to provide and operate the WhatsApp Business Cloud API portal:</p>
                  <ul className="list-disc list-inside space-y-1.5 pl-2">
                    <li>
                      <strong>Account &amp; Tenant Information:</strong> Name, work email address, phone number, organization name, and role credentials.
                    </li>
                    <li>
                      <strong>Meta / WhatsApp Business Credentials:</strong> WhatsApp Business Account ID (WABA ID), Phone Number ID, App ID, and System User Permanent Access Tokens provided via Meta Embedded Signup or manual configuration.
                    </li>
                    <li>
                      <strong>Customer Contacts &amp; Audience Data:</strong> Phone numbers, names, opt-in status, custom tags, and campaign targeting attributes uploaded or managed by your organization.
                    </li>
                    <li>
                      <strong>Message Data &amp; Webhook Events:</strong> Template submission records, outgoing broadcast payloads, incoming inbound messages, delivery receipts (Sent, Delivered, Read, Failed), and webhook timestamps received from Meta Cloud API.
                    </li>
                    <li>
                      <strong>Technical &amp; Usage Logs:</strong> IP address, browser type, authentication timestamps, and API error codes to maintain service reliability and tenant security.
                    </li>
                  </ul>
                </div>
              </section>

              {/* Section 3 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">3</span>
                  <span>How We Use Your Data</span>
                </h3>
                <div className="space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                  <p>We process your data exclusively for legitimate operational purposes:</p>
                  <ul className="list-disc list-inside space-y-1.5 pl-2">
                    <li>Facilitating message transmission between your business and customers via official Meta WhatsApp Cloud API endpoints.</li>
                    <li>Syncing approved WhatsApp message templates (Utility, Authentication, Marketing) with Meta Business Manager.</li>
                    <li>Executing broadcast campaigns and displaying real-time analytics (read rates, response rates, failure diagnostics).</li>
                    <li>Powering the two-way live Team Inbox for customer support and lead management.</li>
                    <li>Enforcing multi-tenant isolation so no organization can access or view another organization&apos;s contacts or messages.</li>
                  </ul>
                </div>
              </section>

              {/* Section 4 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Meta Platform Compliance &amp; Opt-In Consent</span>
                </h3>
                <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs space-y-2">
                  <p className="font-semibold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                    <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>WhatsApp Business Policy &amp; Anti-Spam Requirements</span>
                  </p>
                  <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    Users of CloudWABA must comply strictly with Meta&apos;s WhatsApp Business Messaging Policy. You certify that you have obtained explicit, verifiable opt-in consent from all recipients before initiating marketing or template conversations. CloudWABA provides automated opt-out (e.g. &ldquo;STOP&rdquo;) handling, and accounts engaging in spam or unauthorized scraping will be terminated immediately.
                  </p>
                </div>
              </section>

              {/* Section 5 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">5</span>
                  <span>Data Security &amp; Tenant Isolation</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  We implement robust technical and organizational security measures:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
                    <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1" />
                    <p className="font-bold text-xs text-neutral-900 dark:text-white">Encryption in Transit</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">TLS 1.3 encryption across all API requests and Meta Graph API integrations.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
                    <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1" />
                    <p className="font-bold text-xs text-neutral-900 dark:text-white">Multi-Tenant Isolation</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">Database partition via Firestore security rules with organization ID segregation.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
                    <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1" />
                    <p className="font-bold text-xs text-neutral-900 dark:text-white">Cloud Infrastructure</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">Hosted on enterprise Google Cloud Platform with automated security scanning.</p>
                  </div>
                </div>
              </section>

              {/* Section 6 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">6</span>
                  <span>Data Retention &amp; User Deletion Rights</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  We retain contact and message transmission records only for as long as necessary to provide service analytics and as required by regulatory compliance. Organizations may request complete deletion of contacts, campaigns, or their tenant profile at any time by contacting our data protection desk.
                </p>
              </section>

              {/* Section 7 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">7</span>
                  <span>Contact Information</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                  If you have questions, privacy inquiries, or data requests regarding this Privacy Policy:
                </p>
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
                  <p className="font-bold text-neutral-900 dark:text-white">CloudWABA Compliance &amp; Privacy Office</p>
                  <p className="text-neutral-600 dark:text-neutral-400">Email: <a href="mailto:www.rupala@gmail.com" className="text-emerald-600 dark:text-emerald-400 font-semibold underline">www.rupala@gmail.com</a></p>
                  <p className="text-neutral-500 dark:text-neutral-400">Platform: CloudWABA WhatsApp Business API SaaS</p>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-8 text-neutral-800 dark:text-neutral-200">
              {/* Terms of Service Header */}
              <div className="border-b border-neutral-200 dark:border-neutral-800 pb-6 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  <span>CloudWABA Terms of Service</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white">
                  Terms of Service &amp; End User Agreement
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                  <span><strong>Last Updated:</strong> October 2026</span>
                  <span>•</span>
                  <span><strong>Effective Date:</strong> Immediate</span>
                  <span>•</span>
                  <span><strong>Applies to:</strong> All Tenants, Administrators &amp; Team Users</span>
                </div>
              </div>

              {/* Section 1 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Acceptance of Terms</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you (&ldquo;Customer&rdquo; or &ldquo;You&rdquo;) and CloudWABA (&ldquo;CloudWABA&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing the portal, logging in, or connecting a WhatsApp Business Account (WABA), you represent that you have the authority to bind your organization to these Terms and agree to comply with them in full.
                </p>
              </section>

              {/* Section 2 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Description of SaaS Services</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  CloudWABA provides an enterprise multi-tenant software-as-a-service application that interfaces with Meta&apos;s WhatsApp Business Platform. Features include Meta Embedded Signup onboarding, template approval workflows, contact management, broadcast campaign scheduling, webhook event processing, and multi-agent customer inbox management.
                </p>
              </section>

              {/* Section 3 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Meta Platform Terms &amp; WhatsApp Business Policies</span>
                </h3>
                <div className="space-y-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                  <p>In addition to these Terms, your use of WhatsApp features is strictly subject to Meta Platforms&apos; policies, including:</p>
                  <ul className="list-disc list-inside space-y-1.5 pl-2">
                    <li><strong>WhatsApp Business Solution Terms:</strong> You must maintain an active, valid Meta Business Manager account in good standing.</li>
                    <li><strong>WhatsApp Commerce Policy:</strong> Prohibits the sale or promotion of illegal goods, weapons, adult content, tobacco, and unauthorized financial services.</li>
                    <li><strong>Quality Rating &amp; Rate Limits:</strong> You agree not to send spam or unsolicited promotional blasts that degrade your phone number quality rating below Meta thresholds.</li>
                  </ul>
                </div>
              </section>

              {/* Section 4 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Account Responsibilities &amp; Multi-Tenant Access</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Administrators are responsible for maintaining the confidentiality of their credentials and all activities occurring under their tenant workspace. You agree to immediately notify CloudWABA of any unauthorized access, token leakage, or security breach.
                </p>
              </section>

              {/* Section 5 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">5</span>
                  <span>Meta Messaging Fees &amp; Billing</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Conversations and template messages initiated via the WhatsApp Cloud API are billed in accordance with Meta&apos;s standard conversation-based pricing. Customer is solely responsible for maintaining payment methods connected to their Meta Business Manager payment account or paying applicable SaaS software licenses.
                </p>
              </section>

              {/* Section 6 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">6</span>
                  <span>Disclaimers &amp; Limitation of Liability</span>
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  The service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis. CloudWABA is not liable for upstream delivery delays, outages, or suspensions imposed by Meta Platforms, Inc. In no event shall CloudWABA&apos;s liability exceed the total fees paid by the Customer for the software subscription in the preceding three (3) months.
                </p>
              </section>

              {/* Section 7 */}
              <section className="space-y-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-xs font-bold">7</span>
                  <span>Contact for Legal &amp; Notices</span>
                </h3>
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
                  <p className="font-bold text-neutral-900 dark:text-white">CloudWABA Legal Department</p>
                  <p className="text-neutral-600 dark:text-neutral-400">Email: <a href="mailto:www.rupala@gmail.com" className="text-emerald-600 dark:text-emerald-400 font-semibold underline">www.rupala@gmail.com</a></p>
                  <p className="text-neutral-500 dark:text-neutral-400">Support Desk: CloudWABA WhatsApp Business Platform SaaS</p>
                </div>
              </section>
            </div>
          )}

          {/* Bottom Back Button & Status */}
          <div className="pt-6 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>Multi-Tenant Meta WhatsApp Business Cloud API Portal</span>
            </div>

            <button
              type="button"
              onClick={handleReturn}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center space-x-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Login Screen</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 py-6 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        <p>© {new Date().getFullYear()} CloudWABA Platform. All rights reserved. Meta, WhatsApp, and the WhatsApp logo are trademarks of Meta Platforms, Inc.</p>
      </footer>
    </div>
  );
};
