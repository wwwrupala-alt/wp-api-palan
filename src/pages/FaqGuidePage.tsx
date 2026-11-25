import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  HelpCircle,
  Search,
  ChevronDown,
  Shield,
  FileText,
  Send,
  Bot,
  Sliders,
  Layers,
  Wallet,
  Lock,
  CheckCircle2,
  X,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import { useWhiteLabel } from '../context/WhiteLabelContext.tsx';

type FaqCategory =
  | 'all'
  | 'limits'
  | 'campaigns'
  | 'chatbot'
  | 'tools'
  | 'privacy';

interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, 'all'>;
  categoryLabel: string;
  question: string;
  answer: string;
  bullets?: string[];
  note?: string;
}

const QUICK_LIMITS: Array<{
  area: string;
  item: string;
  limit: string;
  details: string;
}> = [
  {
    area: 'Campaign & Template Media',
    item: 'Image Header / Attachment',
    limit: 'Max 5 MB',
    details: 'JPG, PNG, WEBP formats',
  },
  {
    area: 'Campaign & Template Media',
    item: 'Video Header / Attachment',
    limit: 'Max 16 MB',
    details: 'MP4, 3GP formats (H.264 video + AAC audio)',
  },
  {
    area: 'Campaign & Template Media',
    item: 'PDF / Document Attachment',
    limit: 'Up to 100 MB',
    details: 'Meta official PDF limit via Direct Cloud Upload (5–15 MB recommended for fast mobile downloads)',
  },
  {
    area: 'Template Builder',
    item: 'Interactive Template Buttons',
    limit: 'Max 3 Buttons',
    details: 'Up to 1 Call + 2 URL / Quick Replies (25 chars max per label)',
  },
  {
    area: 'Chatbot & Automations',
    item: 'Reply Button Node',
    limit: 'Max 3 Buttons',
    details: 'Up to 20 characters per button title',
  },
  {
    area: 'Chatbot & Automations',
    item: 'Interactive List Menu Node',
    limit: 'Max 10 Rows',
    details: 'Section/Row title max 24 chars, description max 72 chars',
  },
  {
    area: 'Broadcast Engine',
    item: 'Safe Dispatch Speed',
    limit: 'Up to 15 msg/sec',
    details: 'Adaptive smart pacing protects number quality rating',
  },
  {
    area: 'Meta Official Tiers',
    item: '24-Hour Messaging Capacity',
    limit: '250 → Unlimited',
    details: 'Auto-upgrades: 250 → 1K → 10K → 100K → Unlimited; customer replies unlimited',
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'campaign-media-limits',
    category: 'limits',
    categoryLabel: 'Media & Limits',
    question: 'Campaign aur Template me Media (Image, Video, PDF) ki kitni file size limit hai?',
    answer:
      'Meta Official WhatsApp Cloud API aur hamare panel ke fast delivery engine ke hisaab se har media type ki clear size limits set ki gayi hain:',
    bullets: [
      'Image (JPG, PNG, WEBP): Maximum 5 MB tak upload kar sakte hain.',
      'Video (MP4, 3GP): Maximum 16 MB tak support hota hai.',
      'Document / Brochure (PDF): Direct Meta WhatsApp Cloud Upload se 100 MB tak PDF upload kar sakte hain.',
      'Best Practice: Fast delivery aur low customer data usage ke liye images ko 1–2 MB aur PDF catalogues ko 5–15 MB ke andar compress rakhna sabse best hota hai.',
    ],
  },
  {
    id: 'chatbot-limits',
    category: 'chatbot',
    categoryLabel: 'Chatbot & Automations',
    question: 'Chatbot aur Visual Flow Builder me buttons, list menu aur media ki kitni limit hai?',
    answer:
      'WhatsApp Official Interactive Messaging rules ke mutabiq Chatbot me niche di gayi exact limits lagu hoti hain:',
    bullets: [
      'Interactive Reply Buttons: Ek step me maximum 3 buttons add kar sakte hain (har button title max 20 characters).',
      'Interactive List Menu: Ek list message me maximum 10 selectable options/rows rakh sakte hain (section & row title max 24 chars, description max 72 chars).',
      'Chatbot Media Steps: Image max 5 MB, Video max 16 MB, Audio max 16 MB, aur PDF Document max 25 MB.',
      'Flow Steps & Keyword Rules: Aap multiple branches aur multi-step journeys bana sakte hain aur live karne se pehle built-in Flow Simulator par test kar sakte hain.',
    ],
    note: 'Interactive buttons aur free-form chatbot replies 24-hour Customer Service Window ke andar bina extra conversation charge ke kaam karte hain.',
  },
  {
    id: 'how-to-run-campaign',
    category: 'campaigns',
    categoryLabel: 'Campaigns & Templates',
    question: 'WhatsApp Broadcast Campaign step-by-step kaise launch karein?',
    answer:
      'Panel se Official WhatsApp Campaign chalana sirf 5 aasaan steps ka process hai:',
    bullets: [
      'Step 1 — WhatsApp Number Connect karein: Ensure karein ki aapka WhatsApp Business number Connected status me hai.',
      'Step 2 — Meta Approved Template banayein: Templates section me jaa kar apna Utility ya Marketing template create karein aur Meta approval milne par Sync karein.',
      'Step 3 — Contacts / Audience Import karein: Contacts section me Excel (.xlsx/.xls) ya CSV file upload karein ya tags ke hisaab se group banayein.',
      'Step 4 — Campaign Setup karein: Campaigns → Create Campaign par click karein, approved template chunein, variables ({{1}}, {{2}}) map karein, aur header Image/Video/PDF attach karein.',
      'Step 5 — Launch ya Schedule karein: Live preview verify karne ke baad turant bhejein ya future date/time ke liye Schedule kar dein (Scheduled campaigns cloud server par automatically run hote hain, browser open rakhna zaroori nahi).',
    ],
  },
  {
    id: 'template-approval-rules',
    category: 'campaigns',
    categoryLabel: 'Campaigns & Templates',
    question: 'Template create karte time Meta ke kaunse rules follow karna zaroori hai?',
    answer:
      'Fast approval aur rejection se bachne ke liye Meta ke yeh standard guidelines follow karein:',
    bullets: [
      'Buttons Limit: Maximum 3 buttons per template (up to 1 Call Phone button with country code + up to 2 Website URL buttons / Quick Replies). Call aur URL buttons hamesha Quick Reply buttons se pehle aane chahiye.',
      'Variable-to-Words Ratio: Har variable ({{1}}, {{2}}) ke liye kam se kam 3–4 descriptive words body text me hona zaroori hai, warna Meta variable ratio error deta hai.',
      'Category Selection: Promotional offers ke liye MARKETING, order/appointment updates ke liye UTILITY, aur OTP ke liye AUTHENTICATION chunein.',
      'Sample Values: Submit karte waqt realistic sample text aur valid sample media zaroor upload karein.',
    ],
  },
  {
    id: 'campaign-speed-and-safety',
    category: 'limits',
    categoryLabel: 'Media & Limits',
    question: 'Campaign kitni speed se send hota hai aur number ban hone se kaise bachta hai?',
    answer:
      'Panel ka broadcast engine fast delivery aur number safety ke balance ke liye smart adaptive pacing use karta hai:',
    bullets: [
      'Standard Speed: Up to 15 messages per second smooth batching ke saath dispatch hota hai.',
      'Auto-Throttle Protection: Agar Meta rate-limit signal aata hai to system automatically speed kam karke cooldown apply karta hai aur safe retry karta hai.',
      'Daily Limit Tiers: Unverified numbers par 250 unique users/24h ki limit hoti hai. Meta Business Verification ke baad yeh automatically 1,000 → 10,000 → 100,000 → Unlimited tak upgrade hoti hai.',
      'Safety Tip: Sirf opted-in customers ko relevant messages bhejein taaki aapka Meta Quality Rating hamesha Green (High) rahe.',
    ],
  },
  {
    id: 'drip-campaigns-guide',
    category: 'tools',
    categoryLabel: 'Tools & Features',
    question: 'Drip Campaigns kaise kaam karta hai aur iska kya fayda hai?',
    answer:
      'Drip Campaigns aapko ek automated multi-step WhatsApp follow-up sequence banane deta hai — bina har baar manual broadcast kiye:',
    bullets: [
      'Aap Step 1 (Day 0), Step 2 (Day 2), Step 3 (Day 5) jaise scheduled intervals par alag-alag approved templates set kar sakte hain.',
      'Contacts ko sequence me enroll karte hi cloud scheduler background me har subscriber ka exact due time track karke message bhejta hai.',
      'Har step ki Sent, Delivered, Read aur Reply performance alag se Drip Analytics me dikhti hai.',
    ],
  },
  {
    id: 'crm-leads-and-analytics',
    category: 'tools',
    categoryLabel: 'Tools & Features',
    question: 'Campaign Analytics aur Campaign Leads & CRM kaise work karta hai?',
    answer:
      'Har broadcast aur drip campaign ka real-time delivery tracking aur lead management inbuilt milta hai:',
    bullets: [
      'Campaign Analytics: Total Sent, Delivered, Read, Replied aur Failed numbers ka live report aur failure reason inspect kar sakte hain.',
      'Campaign Leads & CRM: Jo customers aapke campaign ya template button par reply karte hain, unhe automatic lead stages (New, Contacted, Interested, Converted) me track kar sakte hain.',
      'Smart Retargeting: Interested ya non-responsive segments ko filter karke targeted follow-up bhejna aasaan ho jata hai.',
    ],
  },
  {
    id: 'live-inbox-tool',
    category: 'tools',
    categoryLabel: 'Tools & Features',
    question: 'Live Team Inbox kaise kaam karta hai?',
    answer:
      'Live Inbox me aapke connected WhatsApp numbers par aane wale sabhi customer messages real-time ek hi screen par milte hain:',
    bullets: [
      'Customer ke message karne ke 24 ghante ke andar aap unlimited free-form text, images, videos aur PDFs bhej sakte hain.',
      'Jab Chatbot kisi customer ko human agent ko handover karta hai, to team member turant Inbox se conversation continue kar sakta hai.',
      '24-hour window close hone ke baad conversation restart karne ke liye approved WhatsApp template select karke bheja ja sakta hai.',
    ],
  },
  {
    id: 'chatbot-vs-keyword-rules',
    category: 'chatbot',
    categoryLabel: 'Chatbot & Automations',
    question: 'Visual Bot Flow aur Keyword Auto-Reply Rules me kya fark hai?',
    answer:
      'Automations section me aapko 2 tarah ke smart automation tools milte hain:',
    bullets: [
      'Visual Bot Flow Builder: Multi-step guided menus banane ke liye (e.g., Welcome Message → Choose Product → Send Catalogue PDF → Book Callback). Isme buttons, lists, aur conditional branching support hoti hai.',
      'Keyword Auto-Reply Rules: Specific words (jaise "price", "location", "brochure") aane par turant instant text, image ya PDF reply bhejne ke liye.',
      'Simulator: Live activate karne se pehle aap apne poore flow ko built-in Simulator me preview aur test kar sakte hain.',
    ],
  },
  {
    id: 'voice-ai-api-tool',
    category: 'tools',
    categoryLabel: 'Tools & Features',
    question: 'Voice AI & External WhatsApp API feature kya hai aur kaise use hota hai?',
    answer:
      'Agar aapke workspace me Voice AI & API feature enabled hai, to aap kisi bhi external AI calling agent, website form, ya CRM se real-time WhatsApp templates trigger kar sakte hain:',
    bullets: [
      'Named Template Triggers: Har action (jaise brochure ya payment link bhejna) ke liye ek unique Trigger Key banakar specific WhatsApp sender number aur approved template bind kar sakte hain.',
      'Live Mobile Preview: Trigger setup karte time side-by-side preview me header media, variables aur buttons verify kar sakte hain.',
      'Delivery Logs & Filters: Status, Category (Utility/Marketing), Trigger aur Date Range ke hisaab se har API call ka delivery log track hota hai.',
    ],
  },
  {
    id: 'whatsapp-coexistence-mode',
    category: 'tools',
    categoryLabel: 'Tools & Features',
    question: 'Kya ek hi WhatsApp number par Mobile Business App aur Cloud API saath chal sakte hain?',
    answer:
      'Meta ke Official Embedded Signup (WhatsApp Business App Coexistence mode) ke zariye eligible WhatsApp Business App numbers mobile app aur Cloud API dono par saath kaam kar sakte hain:',
    bullets: [
      'Connection ke liye WhatsApp Numbers tab me official Meta Embedded Signup flow follow karein.',
      'Ek number ek waqt me sirf ek hi official Meta Tech Provider / BSP se connected reh sakta hai.',
      'Number migrate ya disconnect karte time WhatsApp Business App ko uninstall ya delete na karein — hamesha official Business Platform settings ka use karein.',
    ],
  },
  {
    id: 'prepaid-wallet-billing',
    category: 'privacy',
    categoryLabel: 'Billing & Privacy',
    question: 'Prepaid Wallet & Balance kaise count hota hai?',
    answer:
      'Har delivered/dispatched message category ke hisaab se transparent prepaid wallet accounting hoti hai:',
    bullets: [
      'Categories: Marketing, Utility, Authentication aur Service rates ke hisaab se exact per-message calculation hoti hai.',
      'Auto-Tracking: Broadcast Campaigns, Drip Steps aur Voice AI API se bheje gaye messages ka itemized record Prepaid Wallet ledger me dikhta hai.',
      'Customer Service Replies: Customer ke message karne ke 24 ghante ke andar normal service replies par zero Meta conversation fee hoti hai.',
    ],
  },
  {
    id: 'data-privacy-security',
    category: 'privacy',
    categoryLabel: 'Billing & Privacy',
    question: 'Hamare workspace ka data aur login privacy kitni safe hai?',
    answer:
      'Platform strict multi-tenant data isolation aur enterprise security practices par built hai:',
    bullets: [
      'Strict Workspace Isolation: Har business workspace ka contact data, chat history, templates, campaigns aur wallet records completely isolated hote hain — kisi dusre organization ke saath share nahi hote.',
      'Account Security: Anti-bot CAPTCHA login verification, automatic inactivity session logout, aur self-service Change Password protection enabled hai.',
      'Zero Credential Exposure: Koi bhi user ID, password, private token ya sensitive API secret kabhi publicly display ya share nahi kiya jata.',
      'User Responsibility: Apna account password, workspace PIN aur private API keys kisi bhi unauthorized person ke saath share na karein. Password badalne ke liye login screen ya sidebar ke "Change Password" option ka use karein.',
    ],
  },
  {
    id: 'team-roles-permissions',
    category: 'privacy',
    categoryLabel: 'Billing & Privacy',
    question: 'Admin aur Team Users ke roles kaise manage hote hain?',
    answer:
      'Workspace Admin apne team members ke liye alag user accounts create kar sakta hai aur feature-level permissions control kar sakta hai:',
    bullets: [
      'Har team member ko sirf wahi modules (jaise Inbox, Contacts, Campaigns, Automations ya Voice AI) dikhte hain jinki permission Admin ne allow ki hai.',
      'Sensitive settings aur WhatsApp Number connections ko Admin controls aur PIN protection se secure rakha jata hai.',
    ],
  },
];

const CATEGORY_TABS: Array<{ id: FaqCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'all', label: 'All Topics', icon: BookOpen },
  { id: 'limits', label: 'Media & Limits', icon: Sliders },
  { id: 'campaigns', label: 'Campaigns & Templates', icon: Send },
  { id: 'chatbot', label: 'Chatbot & Automations', icon: Bot },
  { id: 'tools', label: 'Tools & Features', icon: Layers },
  { id: 'privacy', label: 'Billing & Privacy', icon: Lock },
];

interface FaqGuidePageProps {
  onBack?: () => void;
  onOpenLegal?: (doc: 'privacy' | 'terms') => void;
}

export const FaqGuidePage: React.FC<FaqGuidePageProps> = ({ onBack, onOpenLegal }) => {
  const { branding } = useWhiteLabel();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FaqCategory>('all');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    'campaign-media-limits': true,
    'chatbot-limits': true,
    'how-to-run-campaign': true,
  });

  const handleReturn = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleOpenLegalDoc = (doc: 'privacy' | 'terms') => {
    if (onOpenLegal) {
      onOpenLegal(doc);
    } else {
      window.history.pushState({}, '', doc === 'privacy' ? '/privacy-policy' : '/terms-of-service');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        (item.bullets || []).some((b) => b.toLowerCase().includes(q)) ||
        (item.note || '').toLowerCase().includes(q)
      );
    });
  }, [searchQuery, activeCategory]);

  const toggleItem = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    filteredFaqs.forEach((f) => {
      next[f.id] = true;
    });
    setOpenIds(next);
  };

  const collapseAll = () => {
    setOpenIds({});
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleReturn}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 -ml-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-xs font-semibold shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="h-5 w-px bg-neutral-200 dark:bg-neutral-800 hidden sm:block shrink-0" />

            <div className="flex items-center gap-2.5 min-w-0">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.brandName}
                  className="w-7 h-7 rounded-lg object-contain border border-neutral-200 dark:border-neutral-700 bg-white p-0.5 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
              )}
              <div className="truncate">
                <span className="font-bold text-sm tracking-tight text-neutral-900 dark:text-white">
                  {branding.brandName}
                </span>
                <span className="text-neutral-300 dark:text-neutral-700 mx-1.5">&middot;</span>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  User Guide &amp; FAQ
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs shrink-0">
            <button
              type="button"
              onClick={() => handleOpenLegalDoc('privacy')}
              className="hidden sm:inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Privacy Policy</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenLegalDoc('terms')}
              className="hidden sm:inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Terms</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Hero Header + Live Search */}
        <section className="space-y-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <HelpCircle className="w-4 h-4" />
              <span>Official Platform Guidelines</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Help Center, Platform Limits &amp; FAQ
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
              Media limits, chatbot rules, campaign launch steps, aur har tool ke kaam karne ka poora guide — ek hi jagah par.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-xl">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search guidelines (e.g. "media limit", "chatbot buttons", "campaign", "wallet")...'
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </section>

        {/* Quick Reference: Panel Limits Table */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Platform Quick Limits Reference
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Meta Cloud API &amp; workspace technical limits for Campaigns, Templates, and Chatbots.
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
              Meta Official Cloud API Standards
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                  <th className="py-2.5 px-5">Module</th>
                  <th className="py-2.5 px-4">Feature / Asset</th>
                  <th className="py-2.5 px-4">Maximum Limit</th>
                  <th className="py-2.5 px-5">Supported Formats &amp; Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800">
                {QUICK_LIMITS.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {row.area}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                      {row.item}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {row.limit}
                    </td>
                    <td className="py-2.5 px-5 text-neutral-600 dark:text-neutral-400">
                      {row.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4-Step Quick Workflow Guide */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Quick Start: 4 Steps to Launch Your First Campaign
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Follow this exact order for smooth WhatsApp delivery and high read rates.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                step: '01',
                title: 'Connect WhatsApp',
                desc: 'Link your official WhatsApp Business number via Meta Embedded Signup in WhatsApp Numbers.',
              },
              {
                step: '02',
                title: 'Approve Template',
                desc: 'Create a Utility or Marketing template with optional Image/Video/PDF header & up to 3 buttons.',
              },
              {
                step: '03',
                title: 'Import Audience',
                desc: 'Upload Excel/CSV contacts or organize customers with tags in the Contacts module.',
              },
              {
                step: '04',
                title: 'Launch & Track',
                desc: 'Send immediately or schedule in Campaigns, then track Sent/Read/Replies in Analytics & CRM.',
              },
            ].map((s) => (
              <div
                key={s.step}
                className="p-3.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/30 space-y-1.5"
              >
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  STEP {s.step}
                </span>
                <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                  {s.title}
                </h3>
                <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Category Filter & Accordion List */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Category Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCategory(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Expand / Collapse All */}
            <div className="flex items-center gap-3 text-xs shrink-0">
              <span className="font-mono tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400">
                {filteredFaqs.length} questions
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">&middot;</span>
              <button
                type="button"
                onClick={expandAll}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-neutral-500 dark:text-neutral-400 hover:underline font-medium cursor-pointer"
              >
                Collapse all
              </button>
            </div>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl px-6 py-12 text-center space-y-2">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                No matching guidelines found
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Try another keyword like &ldquo;media&rdquo;, &ldquo;chatbot&rdquo;, &ldquo;campaign&rdquo;, or &ldquo;wallet&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden">
              {filteredFaqs.map((faq) => {
                const isOpen = !!openIds[faq.id];
                return (
                  <div key={faq.id}>
                    <button
                      type="button"
                      onClick={() => toggleItem(faq.id)}
                      aria-expanded={isOpen}
                      className="w-full px-5 py-4 text-left flex items-start justify-between gap-4 hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer"
                    >
                      <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          {faq.categoryLabel}
                        </span>
                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">
                          {faq.question}
                        </h3>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-neutral-400 shrink-0 mt-1 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 space-y-3 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                        <p>{faq.answer}</p>
                        {faq.bullets && faq.bullets.length > 0 && (
                          <ul className="space-y-1.5 pl-1">
                            {faq.bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {faq.note && (
                          <p className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400">
                            <strong className="text-neutral-700 dark:text-neutral-300">Note:</strong>{' '}
                            {faq.note}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Privacy & Data Protection Commitment Footer Card */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                Data Privacy &amp; Account Confidentiality
              </h3>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
                This guide contains general platform documentation only. Workspace credentials, passwords, private tokens, and customer records are strictly protected and never exposed publicly. For account access or workspace assistance, please contact your authorized Workspace Administrator.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenLegalDoc('privacy')}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => handleOpenLegalDoc('terms')}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Terms of Service
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
