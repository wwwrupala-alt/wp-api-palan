import { Request, Response } from 'express';
import {
  serverDb,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  limit as fsLimit,
} from './serverDb.ts';
import { CategoryPricing, WalletAccount, WalletTransaction } from '../types/index.ts';

// Default Category Pricing in INR
export const DEFAULT_CATEGORY_PRICING: CategoryPricing = {
  marketingRate: 0.88,
  utilityRate: 0.115,
  authenticationRate: 0.115,
  serviceRate: 0.0,
  currency: 'INR',
};

function cleanFirestoreData<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

let inMemoryPricingCache: { pricing: CategoryPricing; cachedAt: number } | null = null;
const PRICING_TTL = 30000; // 30 seconds

/**
 * Fetch global Category Pricing set by Master Admin
 */
export async function getCategoryPricing(): Promise<CategoryPricing> {
  const now = Date.now();
  if (inMemoryPricingCache && now - inMemoryPricingCache.cachedAt < PRICING_TTL) {
    return inMemoryPricingCache.pricing;
  }

  try {
    const docRef = doc(serverDb, 'systemSettings', 'wallet_pricing');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<CategoryPricing>;
      const pricing: CategoryPricing = {
        marketingRate: typeof data.marketingRate === 'number' ? data.marketingRate : DEFAULT_CATEGORY_PRICING.marketingRate,
        utilityRate: typeof data.utilityRate === 'number' ? data.utilityRate : DEFAULT_CATEGORY_PRICING.utilityRate,
        authenticationRate: typeof data.authenticationRate === 'number' ? data.authenticationRate : DEFAULT_CATEGORY_PRICING.authenticationRate,
        serviceRate: typeof data.serviceRate === 'number' ? data.serviceRate : DEFAULT_CATEGORY_PRICING.serviceRate,
        currency: data.currency || DEFAULT_CATEGORY_PRICING.currency,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
      inMemoryPricingCache = { pricing, cachedAt: now };
      return pricing;
    }
  } catch (err: any) {
    console.warn('[WalletService] Could not read wallet_pricing from Firestore, using default:', err.message);
  }

  return DEFAULT_CATEGORY_PRICING;
}

/**
 * Update global Category Pricing (Master Admin ONLY)
 */
export async function updateCategoryPricing(newPricing: Partial<CategoryPricing>, updatedBy = 'Master Admin'): Promise<CategoryPricing> {
  const current = await getCategoryPricing();
  const updated: CategoryPricing = {
    marketingRate: typeof newPricing.marketingRate === 'number' ? Math.max(0, newPricing.marketingRate) : current.marketingRate,
    utilityRate: typeof newPricing.utilityRate === 'number' ? Math.max(0, newPricing.utilityRate) : current.utilityRate,
    authenticationRate: typeof newPricing.authenticationRate === 'number' ? Math.max(0, newPricing.authenticationRate) : current.authenticationRate,
    serviceRate: typeof newPricing.serviceRate === 'number' ? Math.max(0, newPricing.serviceRate) : current.serviceRate,
    currency: newPricing.currency || current.currency || 'INR',
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  try {
    const docRef = doc(serverDb, 'systemSettings', 'wallet_pricing');
    await setDoc(docRef, cleanFirestoreData(updated), { merge: true });
    inMemoryPricingCache = { pricing: updated, cachedAt: Date.now() };
  } catch (err: any) {
    console.warn('[WalletService] Error saving wallet_pricing in Firestore:', err.message);
  }

  return updated;
}

/**
 * Get or initialize Wallet Account for an organization or user
 */
export async function getWalletAccount(organizationId: string, userId?: string): Promise<WalletAccount> {
  const targetOrg = organizationId || 'org_master_platform';
  const docRef = doc(serverDb, `organizations/${targetOrg}/wallet`, 'account');

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as WalletAccount;
    }
  } catch {}

  // Initialize new fresh wallet account
  const nowIso = new Date().toISOString();
  const newAccount: WalletAccount = {
    organizationId: targetOrg,
    userId: userId || undefined,
    balance: 0,
    totalRecharged: 0,
    totalSpent: 0,
    currency: 'INR',
    lowBalanceThreshold: 100,
    updatedAt: nowIso,
    createdAt: nowIso,
  };

  try {
    await setDoc(docRef, cleanFirestoreData(newAccount), { merge: true });
  } catch {}

  return newAccount;
}

/**
 * Recharge / Add Funds to Wallet
 */
export async function rechargeWallet(params: {
  organizationId: string;
  userId?: string;
  amount: number;
  note?: string;
  paymentReference?: string;
}): Promise<{ account: WalletAccount; transaction: WalletTransaction }> {
  const { organizationId, userId, amount, note, paymentReference } = params;
  if (!amount || amount <= 0) {
    throw new Error('Recharge amount must be greater than 0.');
  }

  const current = await getWalletAccount(organizationId, userId);
  const nowIso = new Date().toISOString();

  const newBalance = Number((current.balance + amount).toFixed(3));
  const newTotalRecharged = Number((current.totalRecharged + amount).toFixed(3));

  const updatedAccount: WalletAccount = {
    ...current,
    balance: newBalance,
    totalRecharged: newTotalRecharged,
    updatedAt: nowIso,
  };

  // 1. Save updated account
  const accountRef = doc(serverDb, `organizations/${organizationId}/wallet`, 'account');
  await setDoc(accountRef, cleanFirestoreData(updatedAccount), { merge: true });

  // 2. Record Transaction
  const txId = `tx_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const transaction: WalletTransaction = {
    id: txId,
    organizationId,
    userId: userId || undefined,
    type: 'credit',
    amount,
    balanceAfter: newBalance,
    category: 'RECHARGE',
    description: note || 'Prepaid Wallet Funds Added',
    paymentReference: paymentReference || undefined,
    createdAt: nowIso,
  };

  try {
    const txRef = doc(serverDb, `organizations/${organizationId}/wallet/account/transactions`, txId);
    await setDoc(txRef, cleanFirestoreData(transaction));
  } catch (err: any) {
    console.warn('[WalletService] Could not write transaction doc:', err.message);
  }

  return { account: updatedAccount, transaction };
}

/**
 * Automatically deduct wallet charges when a campaign or message is sent
 */
export async function deductWalletForCampaign(params: {
  organizationId: string;
  userId?: string;
  category: string; // 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE'
  count: number;
  campaignId?: string;
  campaignName?: string;
}): Promise<{
  success: boolean;
  deducted: number;
  ratePerMessage: number;
  newBalance: number;
  isLowBalance: boolean;
}> {
  const { organizationId, userId, category, count, campaignId, campaignName } = params;
  if (!count || count <= 0) {
    const current = await getWalletAccount(organizationId, userId);
    return {
      success: true,
      deducted: 0,
      ratePerMessage: 0,
      newBalance: current.balance,
      isLowBalance: current.balance <= current.lowBalanceThreshold,
    };
  }

  const pricing = await getCategoryPricing();
  const normalizedCategory = String(category || 'UTILITY').toUpperCase();

  let rate = pricing.utilityRate;
  if (normalizedCategory.includes('MARKET')) rate = pricing.marketingRate;
  else if (normalizedCategory.includes('AUTH')) rate = pricing.authenticationRate;
  else if (normalizedCategory.includes('SERV')) rate = pricing.serviceRate;

  const totalDeduction = Number((count * rate).toFixed(3));
  const current = await getWalletAccount(organizationId, userId);
  const nowIso = new Date().toISOString();

  const newBalance = Number((current.balance - totalDeduction).toFixed(3));
  const newTotalSpent = Number((current.totalSpent + totalDeduction).toFixed(3));

  const updatedAccount: WalletAccount = {
    ...current,
    balance: newBalance,
    totalSpent: newTotalSpent,
    updatedAt: nowIso,
  };

  // 1. Update wallet balance
  try {
    const accountRef = doc(serverDb, `organizations/${organizationId}/wallet`, 'account');
    await setDoc(accountRef, cleanFirestoreData(updatedAccount), { merge: true });
  } catch (err: any) {
    console.warn('[WalletService] Error updating balance doc:', err.message);
  }

  // 2. Record debit transaction
  const txId = `tx_deb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const transaction: WalletTransaction = {
    id: txId,
    organizationId,
    userId: userId || undefined,
    type: 'debit',
    amount: totalDeduction,
    balanceAfter: newBalance,
    category: normalizedCategory as any,
    description: campaignName ? `Campaign: ${campaignName} (${count} msgs)` : `Outbound ${normalizedCategory} messages (${count} msgs)`,
    campaignId: campaignId || undefined,
    campaignName: campaignName || undefined,
    messageCount: count,
    ratePerMessage: rate,
    createdAt: nowIso,
  };

  try {
    const txRef = doc(serverDb, `organizations/${organizationId}/wallet/account/transactions`, txId);
    await setDoc(txRef, cleanFirestoreData(transaction));
  } catch (err: any) {
    console.warn('[WalletService] Error writing debit transaction doc:', err.message);
  }

  return {
    success: true,
    deducted: totalDeduction,
    ratePerMessage: rate,
    newBalance,
    isLowBalance: newBalance <= current.lowBalanceThreshold,
  };
}

/**
 * Fetch wallet transactions for an organization
 */
export async function getWalletTransactions(organizationId: string, limitCount = 50): Promise<WalletTransaction[]> {
  const targetOrg = organizationId || 'org_master_platform';
  try {
    const txCol = collection(serverDb, `organizations/${targetOrg}/wallet/account/transactions`);
    const q = query(txCol, fsLimit(limitCount));
    const snap = await getDocs(q);

    const list: WalletTransaction[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...(d.data() as any) });
    });

    // Chronological in-memory sort descending (most recent first)
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return list;
  } catch (err: any) {
    console.warn('[WalletService] Error fetching transactions:', err.message);
    return [];
  }
}

// -------------------------------------------------------------
// EXPRESS ROUTE HANDLERS
// -------------------------------------------------------------

/**
 * GET /api/wallet
 * Returns current wallet account, transaction history, and pricing rates
 */
export async function handleGetWallet(req: Request, res: Response): Promise<void> {
  const orgId = String(req.query.organizationId || req.headers['x-organization-id'] || 'org_master_platform').trim();
  const userId = req.query.userId ? String(req.query.userId).trim() : undefined;

  try {
    const [account, pricing, transactions] = await Promise.all([
      getWalletAccount(orgId, userId),
      getCategoryPricing(),
      getWalletTransactions(orgId, 50),
    ]);

    res.json({
      success: true,
      account,
      pricing,
      transactions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch wallet info.' });
  }
}

/**
 * POST /api/wallet/recharge
 * Adds funds to the organization wallet
 */
export async function handleRechargeWallet(req: Request, res: Response): Promise<void> {
  try {
    const { organizationId, userId, amount, note, paymentReference } = req.body;
    const targetOrg = organizationId || req.headers['x-organization-id'] || 'org_master_platform';

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      res.status(400).json({ error: 'Please enter a valid positive recharge amount.' });
      return;
    }

    const result = await rechargeWallet({
      organizationId: String(targetOrg),
      userId,
      amount: numAmount,
      note,
      paymentReference,
    });

    res.json({
      success: true,
      message: `₹${numAmount.toFixed(2)} added to wallet successfully.`,
      account: result.account,
      transaction: result.transaction,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to recharge wallet.' });
  }
}

/**
 * GET /api/wallet/pricing
 * Returns global category pricing
 */
export async function handleGetPricing(req: Request, res: Response): Promise<void> {
  try {
    const pricing = await getCategoryPricing();
    res.json({ success: true, pricing });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch pricing.' });
  }
}

/**
 * POST /api/wallet/pricing
 * Updates global category pricing (Master Admin ONLY)
 */
export async function handleUpdatePricing(req: Request, res: Response): Promise<void> {
  try {
    const { marketingRate, utilityRate, authenticationRate, serviceRate, currency, updatedBy } = req.body;

    const updated = await updateCategoryPricing(
      {
        marketingRate: typeof marketingRate === 'number' ? marketingRate : Number(marketingRate),
        utilityRate: typeof utilityRate === 'number' ? utilityRate : Number(utilityRate),
        authenticationRate: typeof authenticationRate === 'number' ? authenticationRate : Number(authenticationRate),
        serviceRate: typeof serviceRate === 'number' ? serviceRate : Number(serviceRate),
        currency: currency || 'INR',
      },
      updatedBy || 'Master Admin'
    );

    res.json({
      success: true,
      message: 'Category pricing rates updated successfully.',
      pricing: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update pricing.' });
  }
}
