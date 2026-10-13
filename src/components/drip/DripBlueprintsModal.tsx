import React from 'react';
import {
  X,
  Sparkles,
  Zap,
  ShoppingBag,
  Calendar,
  Star,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { DripStep } from '../../types/index.ts';

export interface DripBlueprint {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  badge: string;
  stepsCount: number;
  totalDuration: string;
  steps: Array<{
    title: string;
    delayValue: number;
    delayUnit: 'minutes' | 'hours' | 'days';
    condition: 'always' | 'if_not_replied' | 'if_read';
    suggestedTemplateName: string;
    description: string;
  }>;
}

export const DRIP_BLUEPRINTS: DripBlueprint[] = [
  {
    id: 'lead-nurture-3step',
    name: '3-Day High-Converting Lead Nurture',
    description: 'Turn cold inquiries into paid customers with a warm welcome, value-first case study, and urgent limited discount.',
    icon: Zap,
    category: 'Sales & Conversion',
    badge: 'Popular',
    stepsCount: 3,
    totalDuration: '3 Days',
    steps: [
      {
        title: 'Step 1: Warm Welcome & Special Offer',
        delayValue: 0,
        delayUnit: 'minutes',
        condition: 'always',
        suggestedTemplateName: 'welcome_lead_offer',
        description: 'Sent immediately when user signs up or opts in. Delivers catalog and initial greeting.',
      },
      {
        title: 'Step 2: Educational Case Study & Proof',
        delayValue: 24,
        delayUnit: 'hours',
        condition: 'if_not_replied',
        suggestedTemplateName: 'case_study_proof',
        description: 'Sent after 24 hours if lead has not replied yet. Shares customer success story.',
      },
      {
        title: 'Step 3: 20% Promo Code Expiry Warning',
        delayValue: 48,
        delayUnit: 'hours',
        condition: 'if_not_replied',
        suggestedTemplateName: 'urgent_discount_ending',
        description: 'Sent 48 hours later. Creates urgency with deadline countdown and direct WhatsApp CTA.',
      },
    ],
  },
  {
    id: 'abandoned-cart-recovery',
    name: 'Abandoned Cart & Checkout Recovery',
    description: 'Recover lost e-commerce checkouts on WhatsApp with friendly reminders and automatic coupon incentives.',
    icon: ShoppingBag,
    category: 'E-Commerce',
    badge: 'High ROI',
    stepsCount: 3,
    totalDuration: '48 Hours',
    steps: [
      {
        title: 'Step 1: Friendly Cart Reminder',
        delayValue: 45,
        delayUnit: 'minutes',
        condition: 'always',
        suggestedTemplateName: 'cart_left_behind',
        description: 'Triggered 45 mins after checkout abandonment with a direct resume link.',
      },
      {
        title: 'Step 2: Free Shipping / 10% Unlock',
        delayValue: 20,
        delayUnit: 'hours',
        condition: 'if_not_replied',
        suggestedTemplateName: 'free_shipping_unlock',
        description: 'Delivers a special coupon code if the user has not completed payment.',
      },
      {
        title: 'Step 3: Final Call Before Item Release',
        delayValue: 24,
        delayUnit: 'hours',
        condition: 'if_not_replied',
        suggestedTemplateName: 'final_cart_notice',
        description: 'Last-chance message before reserved stock is released back into inventory.',
      },
    ],
  },
  {
    id: 'event-webinar-maximizer',
    name: 'Webinar & Live Event Attendance Maximizer',
    description: 'Ensure 70%+ live show-up rates for workshops, product demos, consultations, and webinars.',
    icon: Calendar,
    category: 'Events & Education',
    badge: 'Essential',
    stepsCount: 3,
    totalDuration: '24 Hours',
    steps: [
      {
        title: 'Step 1: Registration Confirmation & Calendar',
        delayValue: 0,
        delayUnit: 'minutes',
        condition: 'always',
        suggestedTemplateName: 'event_confirmation_link',
        description: 'Immediate ticket confirmation with one-tap Add-to-Calendar link.',
      },
      {
        title: 'Step 2: 24-Hour Preparation & Speaker Highlights',
        delayValue: 24,
        delayUnit: 'hours',
        condition: 'always',
        suggestedTemplateName: 'event_workbook_brief',
        description: 'Sent 1 day before live session with downloadable agenda and prep questions.',
      },
      {
        title: 'Step 3: "We Are Starting Now!" Live Link Alert',
        delayValue: 60,
        delayUnit: 'minutes',
        condition: 'always',
        suggestedTemplateName: 'live_room_open',
        description: 'Direct join button sent 15 minutes before the session starts.',
      },
    ],
  },
  {
    id: 'post-purchase-reviews',
    name: 'Post-Purchase Onboarding & Review Collector',
    description: 'Delight customers post-delivery, offer setup tips, and gather 5-star Google & Trustpilot reviews.',
    icon: Star,
    category: 'Customer Success',
    badge: 'Retention',
    stepsCount: 2,
    totalDuration: '5 Days',
    steps: [
      {
        title: 'Step 1: Order Delivered & Quick Guide',
        delayValue: 2,
        delayUnit: 'days',
        condition: 'always',
        suggestedTemplateName: 'order_delivered_tips',
        description: 'Friendly check-in after delivery with tips on how to get the most out of their purchase.',
      },
      {
        title: 'Step 2: 5-Star Feedback & Loyalty Cashback',
        delayValue: 3,
        delayUnit: 'days',
        condition: 'always',
        suggestedTemplateName: 'review_request_gift',
        description: 'Polite request for review with a 10% coupon for their next order as thank-you.',
      },
    ],
  },
];

interface DripBlueprintsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBlueprint: (blueprint: DripBlueprint) => void;
}

export const DripBlueprintsModal: React.FC<DripBlueprintsModalProps> = ({
  isOpen,
  onClose,
  onSelectBlueprint,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 dark:text-white text-base flex items-center space-x-2">
                <span>Drip Campaign Blueprints</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Ready-To-Launch
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Pre-configured multi-step WhatsApp sequences optimized for conversions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Blueprint Cards Grid */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DRIP_BLUEPRINTS.map((bp) => {
              const Icon = bp.icon;
              return (
                <div
                  key={bp.id}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/60 p-5 hover:border-amber-400 dark:hover:border-amber-500/60 transition-all hover:shadow-md flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                            {bp.category}
                          </span>
                          <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                            {bp.name}
                          </h4>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                        {bp.badge}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">
                      {bp.description}
                    </p>

                    {/* Step Timeline Pills */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        Sequence Flow ({bp.stepsCount} Steps • {bp.totalDuration}):
                      </span>
                      <div className="space-y-1">
                        {bp.steps.map((st, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800"
                          >
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[200px]">
                              {st.title}
                            </span>
                            <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded shrink-0">
                              {st.delayValue === 0 ? '⚡ Immediate' : `+${st.delayValue} ${st.delayUnit}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectBlueprint(bp);
                      onClose();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <span>Use This Blueprint</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
