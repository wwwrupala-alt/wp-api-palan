import React, { createContext, useContext, useState, useEffect } from 'react';
import type { WhiteLabelBranding } from '../types/index.ts';

interface DnsVerificationResult {
  verified: boolean;
  domain: string;
  targetCname: string;
  records?: string[];
  details?: string;
  message: string;
}

interface WhiteLabelContextType {
  branding: WhiteLabelBranding;
  loading: boolean;
  activeDomain: string;
  isPreviewMode: boolean;
  previewDomain: (domain: string) => void;
  resetPreview: () => void;
  verifyDns: (domain: string, organizationId?: string, adminId?: string) => Promise<DnsVerificationResult>;
  refreshBranding: () => Promise<void>;
}

const DEFAULT_BRANDING: WhiteLabelBranding = {
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

const WhiteLabelContext = createContext<WhiteLabelContextType>({
  branding: DEFAULT_BRANDING,
  loading: true,
  activeDomain: '',
  isPreviewMode: false,
  previewDomain: () => {},
  resetPreview: () => {},
  verifyDns: async () => ({ verified: false, domain: '', targetCname: 'wabacloud.in', message: '' }),
  refreshBranding: async () => {},
});

export const WhiteLabelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<WhiteLabelBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  // Read URL preview params if any (e.g. ?preview_domain=waba.myclient.com)
  const getPreviewParam = (): string => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('preview_domain') || sp.get('whitelabel_domain') || '';
    } catch {
      return '';
    }
  };

  const [overrideDomain, setOverrideDomain] = useState<string>(getPreviewParam);
  const activeDomain = overrideDomain || window.location.hostname;
  const isPreviewMode = Boolean(overrideDomain);

  const fetchBranding = async (domainToResolve: string) => {
    try {
      const clean = domainToResolve.trim().toLowerCase().split(':')[0];
      const res = await fetch(`/api/whitelabel/resolve?domain=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const resolved: WhiteLabelBranding = {
            isCustomDomain: data.isCustomDomain || false,
            domain: data.domain || clean,
            brandName: data.brandName || DEFAULT_BRANDING.brandName,
            logoUrl: data.logoUrl || DEFAULT_BRANDING.logoUrl,
            faviconUrl: data.faviconUrl || DEFAULT_BRANDING.faviconUrl,
            supportPhone: data.supportPhone || DEFAULT_BRANDING.supportPhone,
            supportEmail: data.supportEmail || DEFAULT_BRANDING.supportEmail,
            themeColor: data.themeColor || DEFAULT_BRANDING.themeColor,
            organizationId: data.organizationId || '',
            cnameVerified: data.cnameVerified || false,
            targetCname: data.targetCname || 'wabacloud.in',
          };
          setBranding(resolved);

          // Update dynamic browser title
          if (resolved.isCustomDomain && resolved.brandName) {
            document.title = `${resolved.brandName} Portal - WhatsApp Business API`;
          }

          // Update dynamic favicon if custom exists
          if (resolved.faviconUrl && resolved.faviconUrl !== '/favicon.ico') {
            const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
            if (link) {
              link.href = resolved.faviconUrl;
            }
          }
          return;
        }
      }
    } catch (err) {
      console.warn('[WhiteLabel] Failed to resolve custom branding:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding(activeDomain);
  }, [activeDomain]);

  const previewDomain = (domain: string) => {
    setOverrideDomain(domain);
    const url = new URL(window.location.href);
    url.searchParams.set('preview_domain', domain);
    window.history.replaceState({}, '', url.toString());
  };

  const resetPreview = () => {
    setOverrideDomain('');
    const url = new URL(window.location.href);
    url.searchParams.delete('preview_domain');
    url.searchParams.delete('whitelabel_domain');
    window.history.replaceState({}, '', url.toString());
    fetchBranding(window.location.hostname);
  };

  const verifyDns = async (
    domain: string,
    organizationId?: string,
    adminId?: string
  ): Promise<DnsVerificationResult> => {
    try {
      const res = await fetch('/api/whitelabel/verify-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, organizationId, adminId }),
      });
      const data = await res.json();
      return {
        verified: Boolean(data.verified),
        domain: data.domain || domain,
        targetCname: data.targetCname || 'wabacloud.in',
        records: data.records,
        details: data.details,
        message: data.message || '',
      };
    } catch (err: any) {
      return {
        verified: false,
        domain,
        targetCname: 'wabacloud.in',
        message: err.message || 'DNS verification request failed.',
      };
    }
  };

  const refreshBranding = async () => {
    await fetchBranding(activeDomain);
  };

  return (
    <WhiteLabelContext.Provider
      value={{
        branding,
        loading,
        activeDomain,
        isPreviewMode,
        previewDomain,
        resetPreview,
        verifyDns,
        refreshBranding,
      }}
    >
      {children}
    </WhiteLabelContext.Provider>
  );
};

export const useWhiteLabel = () => useContext(WhiteLabelContext);
