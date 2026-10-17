/**
 * Generates direct Meta Billing Hub URLs for WhatsApp Business Accounts.
 * Allows customers to directly open Meta's billing details to add payment methods (UPI, Card, NetBanking)
 * or recharge prepaid balances.
 *
 * Example URL format:
 * https://business.facebook.com/latest/billing_hub/accounts/details/?payment_account_id=...&asset_id=...&business_id=...&placement=whatsapp_ads
 */

export interface MetaBillingHubParams {
  wabaId: string;
  businessPortfolioId?: string;
  businessId?: string;
  paymentAccountId?: string;
  primaryFundingId?: string;
}

export function buildMetaBillingHubUrl(params: MetaBillingHubParams): string {
  const assetId = (params.wabaId || '').trim();
  const businessId = (params.businessPortfolioId || params.businessId || '').trim();
  const paymentAccountId = (params.paymentAccountId || params.primaryFundingId || '').trim();

  const queryParams = new URLSearchParams();

  if (paymentAccountId) {
    queryParams.set('payment_account_id', paymentAccountId);
  }
  if (assetId) {
    queryParams.set('asset_id', assetId);
  }
  if (businessId) {
    queryParams.set('business_id', businessId);
  }
  queryParams.set('placement', 'whatsapp_ads');

  return `https://business.facebook.com/latest/billing_hub/accounts/details/?${queryParams.toString()}`;
}
