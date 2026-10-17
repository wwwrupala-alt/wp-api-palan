/**
 * Meta Cloud API Official Pricing Utility (India / Global)
 * Based on official Meta WhatsApp Business Conversation-Based Pricing (CBP)
 */

export interface MetaPricingRate {
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'SERVICE';
  rateINR: number;
  label: string;
  description: string;
}

export const META_INDIA_RATES: Record<string, MetaPricingRate> = {
  UTILITY: {
    category: 'UTILITY',
    rateINR: 0.115, // 11.5 paise per conversation
    label: '₹0.115',
    description: 'Utility Conversation (Order updates, transactional notices, account alerts)',
  },
  MARKETING: {
    category: 'MARKETING',
    rateINR: 0.7843, // ~78.4 paise
    label: '₹0.784',
    description: 'Marketing Conversation (Promotions, deals, announcements)',
  },
  AUTHENTICATION: {
    category: 'AUTHENTICATION',
    rateINR: 0.115,
    label: '₹0.115',
    description: 'Authentication Conversation (OTP, login security verification)',
  },
  SERVICE: {
    category: 'SERVICE',
    rateINR: 0.29,
    label: '₹0.29',
    description: 'Service Conversation (User-initiated support; first 1,000 free/month)',
  },
};

/**
 * Resolves template category based on template object or name heuristics.
 */
export function resolveTemplateCategory(
  templateName?: string,
  explicitCategory?: string
): 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'SERVICE' {
  if (explicitCategory) {
    const upper = explicitCategory.toUpperCase();
    if (upper.includes('MARKETING')) return 'MARKETING';
    if (upper.includes('AUTH')) return 'AUTHENTICATION';
    if (upper.includes('SERVICE')) return 'SERVICE';
    if (upper.includes('UTIL')) return 'UTILITY';
  }

  const name = (templateName || '').toLowerCase();
  if (
    name.includes('order') ||
    name.includes('notice') ||
    name.includes('alert') ||
    name.includes('bill') ||
    name.includes('receipt') ||
    name.includes('update') ||
    name.includes('shipping') ||
    name.includes('delivery') ||
    name.includes('cera') ||
    name.includes('payment')
  ) {
    return 'UTILITY';
  }
  if (name.includes('otp') || name.includes('auth') || name.includes('verify') || name.includes('code')) {
    return 'AUTHENTICATION';
  }
  if (name.includes('promo') || name.includes('sale') || name.includes('offer') || name.includes('discount')) {
    return 'MARKETING';
  }
  return 'UTILITY';
}

/**
 * Calculates genuine Meta Cloud API charge for a message.
 * Meta does NOT bill for failed or queued messages.
 */
export function calculateMessageCharge(
  status: string,
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'SERVICE' = 'UTILITY'
): { amount: number; formatted: string; isBillable: boolean; rateText: string } {
  if (status === 'failed' || status === 'queued') {
    return {
      amount: 0,
      formatted: '₹0.00',
      isBillable: false,
      rateText: 'No charge (Undelivered / Failed)',
    };
  }

  const rate = META_INDIA_RATES[category] || META_INDIA_RATES.UTILITY;
  return {
    amount: rate.rateINR,
    formatted: `₹${rate.rateINR.toFixed(3)}`,
    isBillable: true,
    rateText: `${rate.label} (${category})`,
  };
}
