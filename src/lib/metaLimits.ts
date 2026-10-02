export interface MessagingLimitInfo {
  tier: string;
  limit: number;
  label: string;
  shortLabel: string;
  badgeColor: 'emerald' | 'blue' | 'purple' | 'indigo' | 'amber';
  description: string;
  upgradeRequirement: string;
}

export function parseMessagingLimitTier(tier?: string): MessagingLimitInfo {
  const normalized = (tier || 'TIER_250').toUpperCase().trim();

  switch (normalized) {
    case 'TIER_50':
      return {
        tier: 'TIER_50',
        limit: 50,
        label: '50 Unique Users / 24 hrs',
        shortLabel: '50 / 24h',
        badgeColor: 'amber',
        description: 'Trial or restricted limit. You can initiate conversations with up to 50 unique customers in a rolling 24-hour period.',
        upgradeRequirement: 'Send messages to 25+ unique users with High/Green quality rating to upgrade to Tier 250.',
      };
    case 'TIER_250':
    case 'TIER_NOT_SET':
    case 'TIER_TRIAL':
      return {
        tier: 'TIER_250',
        limit: 250,
        label: '250 Unique Users / 24 hrs',
        shortLabel: '250 / 24h',
        badgeColor: 'emerald',
        description: 'Standard Unverified Meta Business limit. You can initiate broadcast or direct conversations with up to 250 unique customers every 24 hours.',
        upgradeRequirement: 'Complete Meta Business Verification or send high-volume campaigns to upgrade to Tier 1K (1,000 / 24h).',
      };
    case 'TIER_1K':
      return {
        tier: 'TIER_1K',
        limit: 1000,
        label: '1,000 Unique Users / 24 hrs',
        shortLabel: '1,000 / 24h',
        badgeColor: 'blue',
        description: 'Tier 1 Verified limit. Send up to 1,000 business-initiated conversations to unique customers in any rolling 24-hour window.',
        upgradeRequirement: 'Send 500+ messages in a 7-day period while maintaining Green quality rating to upgrade to Tier 10K.',
      };
    case 'TIER_10K':
      return {
        tier: 'TIER_10K',
        limit: 10000,
        label: '10,000 Unique Users / 24 hrs',
        shortLabel: '10,000 / 24h',
        badgeColor: 'purple',
        description: 'Tier 2 Scale limit. Send up to 10,000 business-initiated conversations to unique customers in any rolling 24-hour window.',
        upgradeRequirement: 'Send 5,000+ messages in a 7-day period while maintaining Green quality rating to upgrade to Tier 100K.',
      };
    case 'TIER_100K':
      return {
        tier: 'TIER_100K',
        limit: 100000,
        label: '100,000 Unique Users / 24 hrs',
        shortLabel: '100,000 / 24h',
        badgeColor: 'indigo',
        description: 'Tier 3 Enterprise limit. Send up to 100,000 business-initiated conversations to unique customers every 24 hours.',
        upgradeRequirement: 'Send 50,000+ messages in a 7-day period with Green quality to unlock Unlimited tier.',
      };
    case 'TIER_UNLIMITED':
      return {
        tier: 'TIER_UNLIMITED',
        limit: 999999999,
        label: 'Unlimited Messages / 24 hrs',
        shortLabel: 'Unlimited',
        badgeColor: 'emerald',
        description: 'Tier 4 Maximum limit. No daily cap on business-initiated conversations.',
        upgradeRequirement: 'Highest tier available on Meta WhatsApp Business Cloud API.',
      };
    default:
      return {
        tier: normalized,
        limit: 250,
        label: `${normalized.replace('TIER_', '')} / 24 hrs`,
        shortLabel: `${normalized.replace('TIER_', '')}`,
        badgeColor: 'emerald',
        description: 'Meta WhatsApp Business Cloud API messaging limit.',
        upgradeRequirement: 'Maintain Green quality rating to scale limits automatically.',
      };
  }
}
