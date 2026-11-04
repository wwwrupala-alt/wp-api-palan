import dns from 'dns';
import type { Request, Response } from 'express';
import {
  serverDb,
  doc,
  getDocs,
  collection,
  updateDoc,
} from './serverDb.ts';
import type { WhiteLabelBranding, Organization, UserProfile } from '../types/index.ts';

// Default Master Platform Branding
export const DEFAULT_BRANDING: WhiteLabelBranding = {
  isCustomDomain: false,
  brandName: 'WABACLOUD',
  logoUrl: '/uploads/logo_org_9099268034.png',
  faviconUrl: '/favicon.ico',
  supportPhone: '+91 99744 28034',
  supportEmail: 'support@wabacloud.in',
  themeColor: '#059669',
  organizationId: 'org_master_platform',
  cnameVerified: true,
  targetCname: 'wabacloud.in',
};

// In-memory cache for ultra-fast domain resolution without consuming Firestore reads
let cachedDomainMap = new Map<string, { branding: WhiteLabelBranding; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export function invalidateWhiteLabelCache() {
  cachedDomainMap.clear();
}

/**
 * Clean & normalize domain names (removes port, protocol, path, trailing slashes, whitespace)
 */
export function normalizeDomain(raw: string): string {
  if (!raw) return '';
  let cleaned = String(raw).trim().toLowerCase();
  // Strip protocol
  cleaned = cleaned.replace(/^https?:\/\//, '');
  // Strip path and query
  cleaned = cleaned.split('/')[0].split('?')[0];
  // Strip port
  cleaned = cleaned.split(':')[0];
  return cleaned.trim();
}

/**
 * Resolves a hostname or requested domain to an Organization's custom white-label profile
 */
export async function getBrandingForDomain(domainInput: string): Promise<WhiteLabelBranding> {
  const clean = normalizeDomain(domainInput);

  // Default platform hosts
  const isDefaultPlatformHost =
    !clean ||
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean === 'wabacloud.in' ||
    clean === 'www.wabacloud.in' ||
    clean.endsWith('.aistudio.google.com') ||
    clean.endsWith('.usercontent.goog');

  if (isDefaultPlatformHost) {
    return { ...DEFAULT_BRANDING };
  }

  // Check in-memory cache
  const cached = cachedDomainMap.get(clean);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.branding;
  }

  try {
    // 1. Check organizations collection
    const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
    for (const d of orgsSnap.docs) {
      const org = d.data() as Organization;
      const orgDomain = normalizeDomain(org.customDomain || '');
      if (orgDomain && orgDomain === clean) {
        const branding: WhiteLabelBranding = {
          isCustomDomain: true,
          domain: org.customDomain,
          brandName: org.customBrandName || org.adminBrandName || org.name || 'WhatsApp Portal',
          logoUrl: org.customLogoUrl || org.logoUrl || DEFAULT_BRANDING.logoUrl,
          faviconUrl: org.customFaviconUrl || DEFAULT_BRANDING.faviconUrl,
          supportPhone: org.supportPhone || org.contactPhone || DEFAULT_BRANDING.supportPhone,
          supportEmail: org.supportEmail || DEFAULT_BRANDING.supportEmail,
          themeColor: org.themeColor || DEFAULT_BRANDING.themeColor,
          organizationId: org.id,
          cnameVerified: Boolean(org.cnameVerified),
          targetCname: 'wabacloud.in',
        };
        cachedDomainMap.set(clean, { branding, cachedAt: Date.now() });
        return branding;
      }
    }

    // 2. Check users collection for admin accounts that have customDomain configured
    const usersSnap = await getDocs(collection(serverDb, 'users'));
    for (const d of usersSnap.docs) {
      const u = d.data() as UserProfile;
      const uDomain = normalizeDomain((u as any).customDomain || '');
      if (uDomain && uDomain === clean) {
        const branding: WhiteLabelBranding = {
          isCustomDomain: true,
          domain: (u as any).customDomain,
          brandName: (u as any).adminBrandName || u.businessName || u.displayName || 'WhatsApp Portal',
          logoUrl: (u as any).customLogoUrl || u.adminLogoUrl || u.logoUrl || DEFAULT_BRANDING.logoUrl,
          faviconUrl: (u as any).customFaviconUrl || DEFAULT_BRANDING.faviconUrl,
          supportPhone: (u as any).supportPhone || u.adminContactPhone || u.contactPhone || u.phone || DEFAULT_BRANDING.supportPhone,
          supportEmail: (u as any).supportEmail || u.email || DEFAULT_BRANDING.supportEmail,
          themeColor: (u as any).themeColor || DEFAULT_BRANDING.themeColor,
          organizationId: u.organizationId,
          cnameVerified: Boolean((u as any).cnameVerified),
          targetCname: 'wabacloud.in',
        };
        cachedDomainMap.set(clean, { branding, cachedAt: Date.now() });
        return branding;
      }
    }
  } catch (err) {
    console.warn('[whiteLabelService] Domain lookup error:', err);
  }

  // Not matched: Return default platform branding
  const fallback = { ...DEFAULT_BRANDING };
  return fallback;
}

/**
 * Controller: GET /api/whitelabel/resolve?domain=...
 */
export async function handleResolveWhiteLabel(req: Request, res: Response): Promise<void> {
  // Allow domain from query, header (Host or X-Forwarded-Host), or preview param
  const queryDomain = (req.query.domain as string) || (req.query.preview_domain as string) || '';
  const hostHeader = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const domainToResolve = queryDomain || hostHeader;

  const branding = await getBrandingForDomain(domainToResolve);
  res.json({
    success: true,
    resolvedDomain: normalizeDomain(domainToResolve),
    ...branding,
  });
}

/**
 * Controller: POST /api/whitelabel/verify-dns
 * Checks if the customer's custom domain CNAME points to wabacloud.in
 */
export async function handleVerifyDnsCname(req: Request, res: Response): Promise<void> {
  try {
    const { domain, organizationId, adminId } = req.body;
    if (!domain) {
      res.status(400).json({ success: false, error: 'Domain name is required to verify DNS.' });
      return;
    }

    const clean = normalizeDomain(domain);
    if (!clean) {
      res.status(400).json({ success: false, error: 'Invalid domain format.' });
      return;
    }

    let records: string[] = [];
    let isCnameValid = false;
    let checkDetails = '';

    try {
      // 1. Try resolving CNAME records
      records = await dns.promises.resolveCname(clean);
      isCnameValid = records.some(
        (rec) => rec.toLowerCase().includes('wabacloud.in') || rec.toLowerCase().includes('wabacloud')
      );
      checkDetails = `CNAME resolved to: ${records.join(', ')}`;
    } catch (dnsErr: any) {
      // If direct CNAME lookup fails or domain uses Cloudflare proxy (which flattens CNAME to A/AAAA records)
      try {
        const addresses = await dns.promises.resolve4(clean);
        if (addresses && addresses.length > 0) {
          // If domain has valid A records configured, consider provisionally verified
          isCnameValid = true;
          checkDetails = `Domain resolves to IP(s): ${addresses.join(', ')} (Cloudflare/Proxy mode detected)`;
        } else {
          checkDetails = dnsErr.message || 'DNS resolution failed';
        }
      } catch (aErr: any) {
        checkDetails = dnsErr.message || 'No DNS records found for this subdomain';
      }
    }

    // Update organization if organizationId provided
    if (organizationId) {
      try {
        await updateDoc(doc(serverDb, 'organizations', organizationId), {
          cnameVerified: isCnameValid,
          cnameCheckedAt: new Date().toISOString(),
          cnameDetails: checkDetails,
        });
        invalidateWhiteLabelCache();
      } catch (dbErr) {
        console.warn('[whiteLabelService] Could not update organization cnameVerified:', dbErr);
      }
    }

    // Update user if adminId provided
    if (adminId) {
      try {
        await updateDoc(doc(serverDb, 'users', adminId), {
          cnameVerified: isCnameValid,
          cnameCheckedAt: new Date().toISOString(),
        });
        invalidateWhiteLabelCache();
      } catch (dbErr) {
        console.warn('[whiteLabelService] Could not update user cnameVerified:', dbErr);
      }
    }

    res.json({
      success: true,
      domain: clean,
      targetCname: 'wabacloud.in',
      verified: isCnameValid,
      records,
      details: checkDetails,
      instructions: {
        type: 'CNAME',
        name: clean.split('.')[0] || 'subdomain',
        target: 'wabacloud.in',
        ttl: '3600 (Auto)',
      },
      message: isCnameValid
        ? `Great! DNS CNAME for ${clean} is correctly connected to wabacloud.in.`
        : `DNS CNAME for ${clean} has not propagated yet. Please add a CNAME record pointing to wabacloud.in in your domain registrar (GoDaddy, Cloudflare, Namecheap, Hostinger).`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'DNS verification failed.',
    });
  }
}

/**
 * Endpoint for Tenant Admin to update their custom branding & contact support details
 */
export async function handleUpdateAdminBranding(req: Request, res: Response) {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;
    const userId = (req.headers['x-user-id'] as string) || req.body.userId;
    const { customBrandName, logoUrl, contactPhone, supportPhone, supportEmail } = req.body;

    if (!orgId) {
      res.status(400).json({ error: 'Organization ID is required.' });
      return;
    }

    const orgRef = doc(serverDb, 'organizations', orgId);
    const updates: any = {};
    if (customBrandName !== undefined) {
      updates.adminBrandName = customBrandName.trim();
      updates.customBrandName = customBrandName.trim();
    }
    if (logoUrl !== undefined) {
      updates.logoUrl = logoUrl;
      updates.customLogoUrl = logoUrl;
    }
    if (contactPhone !== undefined || supportPhone !== undefined) {
      const phone = (supportPhone || contactPhone || '').trim();
      updates.contactPhone = phone;
      updates.supportPhone = phone;
    }
    if (supportEmail !== undefined) {
      updates.supportEmail = supportEmail.trim();
    }

    await updateDoc(orgRef, updates);

    if (userId) {
      try {
        await updateDoc(doc(serverDb, 'users', userId), {
          adminBrandName: updates.adminBrandName,
          adminLogoUrl: updates.logoUrl,
          adminContactPhone: updates.contactPhone,
          supportEmail: updates.supportEmail,
        });
      } catch (uErr) {
        console.warn('Could not update user profile with branding:', uErr);
      }
    }

    invalidateWhiteLabelCache();

    res.json({
      success: true,
      message: 'Branding details saved successfully.',
      branding: updates,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update branding.' });
  }
}
