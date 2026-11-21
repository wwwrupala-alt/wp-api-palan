import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Webhook,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Send,
  Upload,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  Video,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Search,
  Smartphone,
  Code2,
  Play,
  Pause,
  RotateCw,
  Save,
  ShieldCheck,
  ExternalLink,
  Phone,
  CornerUpLeft,
  BadgeCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeTemplates,
  syncTemplatesFromMeta,
  uploadMediaFile,
} from '../lib/services.ts';
import type { Template, WhatsAppAccount } from '../types/index.ts';

interface ExternalApiConfig {
  apiKey: string;
  organizationId: string;
  defaultPhoneNumberId?: string;
  enabled: boolean;
  label?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

interface TriggerVariableMapping {
  mode: 'customer_name' | 'dynamic' | 'static';
  value?: string;
}

interface ExternalApiTemplateTrigger {
  id: string;
  organizationId: string;
  triggerKey: string;
  label: string;
  description?: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  templateId?: string;
  templateName: string;
  templateLanguage: string;
  templateCategory?: string;
  templateComponents?: any[];
  headerFormat?: string;
  headerMediaUrl?: string;
  headerMediaId?: string;
  headerFileName?: string;
  variableMappings?: Record<string, TriggerVariableMapping>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExternalApiLog {
  id: string;
  to: string;
  cleanPhone?: string;
  name?: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: string | null;
  caption?: string;
  triggerKey?: string;
  templateName?: string;
  source: string;
  status: 'sent' | 'failed';
  messageId?: string | null;
  error?: string | null;
  timestamp: string;
}

function normalizeTriggerSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface DetectedTemplateVariable {
  key: string;
  label: string;
  section: 'header' | 'body' | 'button';
}

function extractTemplateVariables(
  template: Template | null | undefined
): DetectedTemplateVariable[] {
  if (!template?.components) return [];
  const results: DetectedTemplateVariable[] = [];
  const seen = new Set<string>();

  for (const comp of template.components) {
    const type = String(comp.type || '').toUpperCase();
    if (type === 'HEADER' && String(comp.format || 'TEXT').toUpperCase() === 'TEXT' && comp.text) {
      const matches = comp.text.match(/\{\{(\d+)\}\}/g);
      if (matches) {
        matches.forEach((m) => {
          const num = m.replace(/[{}]/g, '');
          const key = `header_${num}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ key, label: `Header {{${num}}}`, section: 'header' });
          }
        });
      }
    } else if (type === 'BODY' && comp.text) {
      const matches = comp.text.match(/\{\{(\d+)\}\}/g);
      if (matches) {
        const nums = Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, '')))).sort(
          (a, b) => Number(a) - Number(b)
        );
        nums.forEach((num) => {
          if (!seen.has(num)) {
            seen.add(num);
            results.push({ key: num, label: `{{${num}}}`, section: 'body' });
          }
        });
      }
    } else if (type === 'BUTTONS' && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((btn, idx) => {
        if (btn?.type === 'URL' && btn.url && btn.url.includes('{{1}}')) {
          const key = `button_${idx}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              key,
              label: `Button "${btn.text || idx + 1}" URL`,
              section: 'button',
            });
          }
        }
      });
    }
  }

  return results;
}

function getTemplateHeaderInfo(template: Template | null | undefined): {
  format: string;
  text: string;
} {
  if (!template?.components) return { format: '', text: '' };
  const header = template.components.find(
    (c) => String(c.type || '').toUpperCase() === 'HEADER'
  );
  if (!header) return { format: '', text: '' };
  return {
    format: String(header.format || '').toUpperCase(),
    text: header.text || '',
  };
}

function getTemplateBodyText(template: Template | null | undefined): string {
  if (!template?.components) return '';
  const body = template.components.find(
    (c) => String(c.type || '').toUpperCase() === 'BODY'
  );
  return body?.text || '';
}

function getTemplateFooterText(template: Template | null | undefined): string {
  if (!template?.components) return '';
  const footer = template.components.find(
    (c) => String(c.type || '').toUpperCase() === 'FOOTER'
  );
  return footer?.text || '';
}

function getTemplateButtons(template: Template | null | undefined): Array<{
  type: string;
  text: string;
  url?: string;
}> {
  if (!template?.components) return [];
  const btnComp = template.components.find(
    (c) => String(c.type || '').toUpperCase() === 'BUTTONS'
  );
  return Array.isArray(btnComp?.buttons) ? btnComp.buttons : [];
}

function formatShortDate(iso?: string): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const VoiceAiApiPage: React.FC = () => {
  const { organization, userProfile } = useAuth();
  const { accounts, activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const orgId =
    organization?.id ||
    userProfile?.organizationId ||
    (userProfile?.uid === 'master_admin_root'
      ? 'org_master_platform'
      : userProfile?.uid
      ? `org_${userProfile.uid}`
      : 'org_default');

  const endpointUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/send`
      : 'https://api.wabacloud.com/api/whatsapp/send';

  const [activeView, setActiveView] = useState<'triggers' | 'credentials' | 'tester' | 'logs'>('triggers');

  // Core data states
  const [config, setConfig] = useState<ExternalApiConfig | null>(null);
  const [triggers, setTriggers] = useState<ExternalApiTemplateTrigger[]>([]);
  const [logs, setLogs] = useState<ExternalApiLog[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingTriggers, setLoadingTriggers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Credentials state
  const [showKey, setShowKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDefaultSender, setSelectedDefaultSender] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [snippetMode, setSnippetMode] = useState<'trigger' | 'direct_template' | 'direct_text'>('trigger');

  // Triggers filter & modal state
  const [triggerSearch, setTriggerSearch] = useState('');
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [formTriggerKey, setFormTriggerKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPhoneNumberId, setFormPhoneNumberId] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formHeaderMediaMode, setFormHeaderMediaMode] = useState<'upload' | 'url'>('upload');
  const [formHeaderMediaUrl, setFormHeaderMediaUrl] = useState('');
  const [formHeaderMediaId, setFormHeaderMediaId] = useState('');
  const [formHeaderFileName, setFormHeaderFileName] = useState('');
  const [formVariableMappings, setFormVariableMappings] = useState<
    Record<string, TriggerVariableMapping>
  >({});
  const [formLocalMediaPreview, setFormLocalMediaPreview] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [deletingTrigger, setDeletingTrigger] = useState<ExternalApiTemplateTrigger | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live Tester state
  const [testMode, setTestMode] = useState<'trigger' | 'direct'>('trigger');
  const [testTriggerKey, setTestTriggerKey] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testName, setTestName] = useState('');
  const [testSource, setTestSource] = useState('vanidesk-voice-ai');
  const [testMessage, setTestMessage] = useState('');
  const [testMediaUrl, setTestMediaUrl] = useState('');
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [sendingTest, setSendingTest] = useState(false);
  const [testResponse, setTestResponse] = useState<{
    status: number;
    body: any;
  } | null>(null);

  // Logs filter state
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');

  const copyText = (text: string, id: string, label = 'Copied') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast.showSuccess(label, 'Copied to clipboard.');
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    });
  };

  // Load config, triggers, and logs
  const loadConfig = async () => {
    if (!orgId) return;
    setLoadingConfig(true);
    try {
      const res = await fetch(
        `/api/external-api/config?organizationId=${encodeURIComponent(orgId)}`,
        { headers: { 'x-organization-id': orgId } }
      );
      const data = await res.json();
      if (res.ok && data.ok && data.config) {
        setConfig(data.config);
        setSelectedDefaultSender(data.config.defaultPhoneNumberId || '');
      }
    } catch (err: any) {
      toast.showError('API Config Error', err?.message || 'Could not load API credentials.');
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadTriggers = async () => {
    if (!orgId) return;
    setLoadingTriggers(true);
    try {
      const res = await fetch(
        `/api/external-api/triggers?organizationId=${encodeURIComponent(orgId)}`,
        { headers: { 'x-organization-id': orgId } }
      );
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.triggers)) {
        setTriggers(data.triggers);
      }
    } catch (err: any) {
      toast.showError('Triggers Error', err?.message || 'Could not load template triggers.');
    } finally {
      setLoadingTriggers(false);
    }
  };

  const loadLogs = async () => {
    if (!orgId) return;
    setLoadingLogs(true);
    try {
      const res = await fetch(
        `/api/external-api/logs?organizationId=${encodeURIComponent(orgId)}`,
        { headers: { 'x-organization-id': orgId } }
      );
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch {
      // silent
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadTriggers();
    loadLogs();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    const unsub = subscribeTemplates(
      orgId,
      (list) => setTemplates(list),
      () => {}
    );
    return () => unsub();
  }, [orgId]);

  // Approved templates only
  const approvedTemplates = useMemo(
    () => templates.filter((t) => String(t.status || '').toUpperCase() === 'APPROVED'),
    [templates]
  );

  // Selected sender account inside Trigger modal
  const selectedFormAccount: WhatsAppAccount | undefined = useMemo(
    () =>
      accounts.find(
        (a) => a.phoneNumberId === formPhoneNumberId || a.id === formPhoneNumberId
      ),
    [accounts, formPhoneNumberId]
  );

  // Templates available for selected sender account
  const filteredApprovedTemplates = useMemo(() => {
    if (!selectedFormAccount) return approvedTemplates;
    const matching = approvedTemplates.filter(
      (t) =>
        t.whatsAppAccountId === selectedFormAccount.id ||
        t.whatsAppAccountId === selectedFormAccount.phoneNumberId ||
        !t.whatsAppAccountId
    );
    return matching.length > 0 ? matching : approvedTemplates;
  }, [approvedTemplates, selectedFormAccount]);

  const selectedTemplate = useMemo(
    () =>
      filteredApprovedTemplates.find((t) => t.id === formTemplateId) ||
      approvedTemplates.find((t) => t.id === formTemplateId) ||
      null,
    [filteredApprovedTemplates, approvedTemplates, formTemplateId]
  );

  const detectedVars = useMemo(
    () => extractTemplateVariables(selectedTemplate),
    [selectedTemplate]
  );

  const selectedHeaderInfo = useMemo(
    () => getTemplateHeaderInfo(selectedTemplate),
    [selectedTemplate]
  );

  const editingTriggerObj = useMemo(
    () => (editingTriggerId ? triggers.find((t) => t.id === editingTriggerId) || null : null),
    [editingTriggerId, triggers]
  );

  const effectiveHeaderFormat =
    selectedHeaderInfo.format || editingTriggerObj?.headerFormat || '';

  const needsHeaderMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(
    effectiveHeaderFormat
  );

  // Keep variableMappings synchronized whenever template changes
  useEffect(() => {
    if (!selectedTemplate) return;
    setFormVariableMappings((prev) => {
      const next: Record<string, TriggerVariableMapping> = {};
      detectedVars.forEach((item, idx) => {
        if (prev[item.key]) {
          next[item.key] = prev[item.key];
        } else {
          next[item.key] =
            item.section === 'body' && idx === 0
              ? { mode: 'customer_name', value: 'Customer' }
              : { mode: 'static', value: '' };
        }
      });
      return next;
    });
  }, [selectedTemplate?.id, detectedVars.map((d) => d.key).join(',')]);

  const handleSyncMetaTemplates = async () => {
    const targetAcc = selectedFormAccount || activeAccount || accounts[0];
    if (!targetAcc?.wabaId) {
      toast.showWarning(
        'No Connected Number',
        'Connect a WhatsApp Business number first in the WhatsApp Numbers tab.'
      );
      return;
    }
    setSyncingTemplates(true);
    try {
      const count = await syncTemplatesFromMeta(
        orgId,
        targetAcc.wabaId,
        targetAcc.id,
        targetAcc.customToken
      );
      toast.showSuccess(
        'Templates Synced',
        `Synced ${count} template(s) from Meta for ${targetAcc.displayPhoneNumber}.`
      );
    } catch (err: any) {
      toast.showError('Sync Failed', err?.message || 'Could not sync Meta templates.');
    } finally {
      setSyncingTemplates(false);
    }
  };

  const openCreateTriggerModal = () => {
    const defaultAcc =
      accounts.find((a) => a.phoneNumberId === config?.defaultPhoneNumberId) ||
      activeAccount ||
      accounts[0];
    setEditingTriggerId(null);
    setFormTriggerKey('');
    setFormLabel('');
    setFormDescription('');
    setFormPhoneNumberId(defaultAcc?.phoneNumberId || defaultAcc?.id || '');
    setFormTemplateId('');
    setFormHeaderMediaMode('upload');
    setFormHeaderMediaUrl('');
    setFormHeaderMediaId('');
    setFormHeaderFileName('');
    setFormLocalMediaPreview('');
    setFormVariableMappings({});
    setFormEnabled(true);
    setIsTriggerModalOpen(true);
  };

  const openEditTriggerModal = (trigger: ExternalApiTemplateTrigger) => {
    setEditingTriggerId(trigger.id);
    setFormTriggerKey(trigger.triggerKey);
    setFormLabel(trigger.label);
    setFormDescription(trigger.description || '');
    setFormPhoneNumberId(trigger.phoneNumberId);
    const matchedTpl =
      templates.find((t) => t.id === trigger.templateId) ||
      templates.find(
        (t) =>
          t.name === trigger.templateName && t.language === trigger.templateLanguage
      );
    setFormTemplateId(matchedTpl?.id || trigger.templateId || '');
    const savedUrl =
      trigger.headerMediaUrl && !trigger.headerMediaUrl.startsWith('blob:')
        ? trigger.headerMediaUrl
        : '';
    setFormHeaderMediaUrl(savedUrl);
    setFormHeaderMediaId(trigger.headerMediaId || '');
    setFormHeaderFileName(trigger.headerFileName || '');
    setFormLocalMediaPreview('');
    setFormHeaderMediaMode(
      savedUrl && !trigger.headerMediaId ? 'url' : 'upload'
    );
    setFormVariableMappings(trigger.variableMappings || {});
    setFormEnabled(trigger.enabled !== false);
    setIsTriggerModalOpen(true);
  };

  const handleHeaderMediaUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploadingMedia(true);
    const instantBlobPreview = URL.createObjectURL(file);
    setFormLocalMediaPreview(instantBlobPreview);
    try {
      const uploaded = await uploadMediaFile(
        file,
        selectedFormAccount?.customToken,
        selectedFormAccount?.phoneNumberId
      );
      const candidateUrl = uploaded.fullUrl || uploaded.url || '';
      const durableUrl = candidateUrl.startsWith('blob:') ? '' : candidateUrl;
      setFormHeaderMediaUrl(durableUrl);
      setFormHeaderMediaId(uploaded.metaMediaId || uploaded.id || '');
      setFormHeaderFileName(uploaded.originalName || file.name);
      if (durableUrl) {
        setFormLocalMediaPreview(durableUrl);
      }
      toast.showSuccess('Media Uploaded', `${file.name} is ready and will be delivered with this trigger.`);
    } catch (err: any) {
      setFormLocalMediaPreview('');
      toast.showError('Upload Failed', err?.message || 'Failed to upload media file.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = normalizeTriggerSlug(formTriggerKey);
    if (!cleanKey) {
      toast.showWarning('Trigger Key Required', 'Enter a trigger key such as send_catalog.');
      return;
    }
    if (!formPhoneNumberId) {
      toast.showWarning('Sender Required', 'Select a connected WhatsApp Business number.');
      return;
    }

    const existingTrigger = editingTriggerId
      ? triggers.find((t) => t.id === editingTriggerId)
      : null;
    const tplName = selectedTemplate?.name || existingTrigger?.templateName || '';
    const tplLang = selectedTemplate?.language || existingTrigger?.templateLanguage || 'en_US';
    if (!tplName) {
      toast.showWarning('Template Required', 'Select an APPROVED Meta WhatsApp template.');
      return;
    }

    setSavingTrigger(true);
    try {
      const res = await fetch('/api/external-api/triggers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          id: editingTriggerId || undefined,
          organizationId: orgId,
          triggerKey: cleanKey,
          label: formLabel.trim() || cleanKey,
          description: formDescription.trim(),
          phoneNumberId: selectedFormAccount?.phoneNumberId || formPhoneNumberId,
          displayPhoneNumber:
            selectedFormAccount?.displayPhoneNumber ||
            existingTrigger?.displayPhoneNumber ||
            '',
          templateId: selectedTemplate?.id || existingTrigger?.templateId || '',
          templateName: tplName,
          templateLanguage: tplLang,
          templateCategory:
            selectedTemplate?.category || existingTrigger?.templateCategory || 'UTILITY',
          templateComponents:
            selectedTemplate?.components || existingTrigger?.templateComponents || [],
          headerFormat: selectedHeaderInfo.format || existingTrigger?.headerFormat || '',
          headerMediaUrl: needsHeaderMedia ? formHeaderMediaUrl.trim() : '',
          headerMediaId: needsHeaderMedia ? formHeaderMediaId.trim() : '',
          headerFileName: needsHeaderMedia ? formHeaderFileName.trim() : '',
          variableMappings: formVariableMappings,
          enabled: formEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to save template trigger.');
      }
      toast.showSuccess(
        editingTriggerId ? 'Trigger Updated' : 'Trigger Created',
        `Voice AI can now call trigger "${cleanKey}" to send "${tplName}".`
      );
      setIsTriggerModalOpen(false);
      await loadTriggers();
    } catch (err: any) {
      toast.showError('Save Failed', err?.message || 'Could not save template trigger.');
    } finally {
      setSavingTrigger(false);
    }
  };

  const handleToggleTriggerActive = async (trigger: ExternalApiTemplateTrigger) => {
    const nextEnabled = trigger.enabled === false;
    try {
      const res = await fetch('/api/external-api/triggers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          ...trigger,
          organizationId: orgId,
          enabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Update failed.');
      setTriggers((prev) =>
        prev.map((t) => (t.id === trigger.id ? { ...t, enabled: nextEnabled } : t))
      );
      toast.showSuccess(
        nextEnabled ? 'Trigger Activated' : 'Trigger Paused',
        `"${trigger.triggerKey}" is now ${nextEnabled ? 'active' : 'paused'}.`
      );
    } catch (err: any) {
      toast.showError('Status Update Failed', err?.message || 'Could not toggle trigger.');
    }
  };

  const handleConfirmDeleteTrigger = async () => {
    if (!deletingTrigger) return;
    setConfirmingDelete(true);
    try {
      const res = await fetch(
        `/api/external-api/triggers/${encodeURIComponent(deletingTrigger.id)}?organizationId=${encodeURIComponent(orgId)}`,
        {
          method: 'DELETE',
          headers: { 'x-organization-id': orgId },
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed.');
      toast.showSuccess('Trigger Deleted', `"${deletingTrigger.triggerKey}" removed.`);
      setDeletingTrigger(null);
      await loadTriggers();
    } catch (err: any) {
      toast.showError('Delete Failed', err?.message || 'Could not delete trigger.');
    } finally {
      setConfirmingDelete(false);
    }
  };

  const handleSaveApiConfig = async (overrides?: { enabled?: boolean }) => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/external-api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          organizationId: orgId,
          defaultPhoneNumberId: selectedDefaultSender,
          enabled: overrides?.enabled !== undefined ? overrides.enabled : config?.enabled !== false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save API settings.');
      setConfig(data.config);
      toast.showSuccess('Settings Saved', 'External Voice AI API configuration updated.');
    } catch (err: any) {
      toast.showError('Save Error', err?.message || 'Could not save API settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRegenerateKey = async () => {
    setRegeneratingKey(true);
    try {
      const res = await fetch('/api/external-api/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to regenerate key.');
      setConfig(data.config);
      setShowKey(true);
      setConfirmRegenerateOpen(false);
      toast.showSuccess(
        'API Key Regenerated',
        'Update your Voice AI panel with the new x-api-key.'
      );
    } catch (err: any) {
      toast.showError('Regenerate Error', err?.message || 'Could not regenerate API key.');
    } finally {
      setRegeneratingKey(false);
    }
  };

  const buildWebhookJsonForTrigger = (trigger: ExternalApiTemplateTrigger) => {
    const dynamicVars: Record<string, string> = {};
    if (trigger.variableMappings) {
      Object.entries(trigger.variableMappings).forEach(([k, map]) => {
        if (map.mode === 'dynamic') {
          dynamicVars[k] = map.value || `dynamic_value_${k}`;
        }
      });
    }
    const payload: Record<string, any> = {
      to: '+919876543210',
      name: 'Customer Name',
      trigger: trigger.triggerKey,
      ...(Object.keys(dynamicVars).length > 0 ? { variables: dynamicVars } : {}),
      source: 'vanidesk-voice-ai',
    };
    return JSON.stringify(payload, null, 2);
  };

  const buildCurlForTrigger = (trigger: ExternalApiTemplateTrigger) => {
    const json = buildWebhookJsonForTrigger(trigger);
    return `curl -X POST "${endpointUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${config?.apiKey || 'YOUR_API_KEY'}" \\\n  -d '${json}'`;
  };

  const handleOpenTesterForTrigger = (trigger: ExternalApiTemplateTrigger) => {
    setTestMode('trigger');
    setTestTriggerKey(trigger.triggerKey);
    const initVars: Record<string, string> = {};
    if (trigger.variableMappings) {
      Object.entries(trigger.variableMappings).forEach(([k, map]) => {
        if (map.mode === 'dynamic') {
          initVars[k] = map.value || '';
        }
      });
    }
    setTestVariables(initVars);
    setTestResponse(null);
    setActiveView('tester');
  };

  const handleRunLiveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config?.apiKey) {
      toast.showError('Missing API Key', 'Generate or load your API key first.');
      return;
    }
    if (!testPhone.trim()) {
      toast.showWarning('Phone Required', 'Enter a recipient WhatsApp number to test.');
      return;
    }
    if (testMode === 'trigger' && !testTriggerKey) {
      toast.showWarning('Select Trigger', 'Choose a configured template trigger to test.');
      return;
    }
    if (testMode === 'direct' && !testMessage.trim() && !testMediaUrl.trim()) {
      toast.showWarning('Content Required', 'Enter a message or public media URL.');
      return;
    }

    setSendingTest(true);
    setTestResponse(null);
    try {
      const bodyPayload: Record<string, any> = {
        to: testPhone.trim(),
        name: testName.trim() || undefined,
        source: testSource.trim() || 'voice-ai-tester',
      };
      if (testMode === 'trigger') {
        bodyPayload.trigger = testTriggerKey;
        const cleanVars: Record<string, string> = {};
        Object.entries(testVariables).forEach(([k, v]) => {
          if (v.trim()) cleanVars[k] = v.trim();
        });
        if (Object.keys(cleanVars).length > 0) {
          bodyPayload.variables = cleanVars;
        }
        if (testMediaUrl.trim()) {
          bodyPayload.mediaUrl = testMediaUrl.trim();
        }
      } else {
        if (testMessage.trim()) bodyPayload.message = testMessage.trim();
        if (testMediaUrl.trim()) bodyPayload.mediaUrl = testMediaUrl.trim();
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
        },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      setTestResponse({ status: res.status, body: data });
      if (res.ok && data.ok) {
        toast.showSuccess('WhatsApp Sent!', `Message ID: ${data.messageId}`);
      } else {
        toast.showError('Send Failed', data.error || 'Meta API rejected test message.');
      }
      await loadLogs();
    } catch (err: any) {
      setTestResponse({ status: 500, body: { ok: false, error: err?.message || 'Request failed' } });
      toast.showError('Request Failed', err?.message || 'Could not reach endpoint.');
    } finally {
      setSendingTest(false);
    }
  };

  const filteredTriggers = useMemo(() => {
    const q = triggerSearch.trim().toLowerCase();
    if (!q) return triggers;
    return triggers.filter(
      (t) =>
        t.triggerKey.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        t.templateName.toLowerCase().includes(q) ||
        (t.displayPhoneNumber || '').toLowerCase().includes(q)
    );
  }, [triggers, triggerSearch]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((l) => {
      if (logStatusFilter !== 'all' && l.status !== logStatusFilter) return false;
      if (!q) return true;
      return (
        (l.to || '').toLowerCase().includes(q) ||
        (l.name || '').toLowerCase().includes(q) ||
        (l.triggerKey || '').toLowerCase().includes(q) ||
        (l.templateName || '').toLowerCase().includes(q) ||
        (l.source || '').toLowerCase().includes(q) ||
        (l.message || '').toLowerCase().includes(q)
      );
    });
  }, [logs, logSearch, logStatusFilter]);

  const activeTestTrigger = useMemo(
    () => triggers.find((t) => t.triggerKey === testTriggerKey) || null,
    [triggers, testTriggerKey]
  );

  const activeTriggerCount = triggers.filter((t) => t.enabled !== false).length;
  const maskedKey = config?.apiKey
    ? `${config.apiKey.slice(0, 12)}${'•'.repeat(24)}${config.apiKey.slice(-6)}`
    : 'Loading...';

  const sampleTriggerKey = triggers[0]?.triggerKey || 'send_catalog';
  const sampleTemplateName = approvedTemplates[0]?.name || 'product_catalog_link';
  const codeSnippet = useMemo(() => {
    const keyDisplay = config?.apiKey || 'YOUR_SECRET_API_KEY';
    if (snippetMode === 'trigger') {
      return `POST ${endpointUrl}
Headers:
  Content-Type: application/json
  x-api-key: ${keyDisplay}

Body:
{
  "to": "+919876543210",
  "name": "Rahul Sharma",
  "trigger": "${sampleTriggerKey}",
  "variables": {
    "2": "https://wabacloud.com/demo"
  },
  "source": "vanidesk-voice-ai"
}`;
    }
    if (snippetMode === 'direct_template') {
      return `POST ${endpointUrl}
Headers:
  Content-Type: application/json
  x-api-key: ${keyDisplay}

Body:
{
  "to": "+919876543210",
  "name": "Rahul Sharma",
  "templateName": "${sampleTemplateName}",
  "templateLanguage": "en_US",
  "variables": {
    "1": "Rahul Sharma",
    "2": "https://wabacloud.com/brochure"
  },
  "phoneNumberId": "${accounts[0]?.phoneNumberId || 'OPTIONAL_SENDER_PHONE_ID'}",
  "source": "vanidesk-voice-ai"
}`;
    }
    return `POST ${endpointUrl}
Headers:
  Content-Type: application/json
  x-api-key: ${keyDisplay}

Body:
{
  "to": "+919876543210",
  "name": "Rahul Sharma",
  "message": "Here is the link you requested on our call: https://wabacloud.com",
  "mediaUrl": "https://example.com/catalog.pdf",
  "source": "vanidesk-voice-ai"
}`;
  }, [snippetMode, endpointUrl, config?.apiKey, sampleTriggerKey, sampleTemplateName, accounts]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Action Header & Workspace Metrics */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Voice AI Call Triggers &amp; WhatsApp API
            </h2>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
            Map named webhook triggers to your connected WhatsApp Business numbers and Meta-approved templates so your AI calling agent can instantly send links, brochures, or offers during live calls.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
            <span>{activeTriggerCount} active triggers</span>
            <span aria-hidden="true">·</span>
            <span>{accounts.length} connected numbers</span>
            <span aria-hidden="true">·</span>
            <span>{approvedTemplates.length} approved templates</span>
            <span aria-hidden="true">·</span>
            <span className={config?.enabled !== false ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
              API {config?.enabled !== false ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSyncMetaTemplates}
            disabled={syncingTemplates || accounts.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingTemplates ? 'animate-spin' : ''}`} />
            <span>Sync Meta Templates</span>
          </button>
          <button
            type="button"
            onClick={openCreateTriggerModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Template Trigger</span>
          </button>
        </div>
      </div>

      {/* Segmented Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-fit overflow-x-auto max-w-full">
          {(
            [
              { id: 'triggers', label: 'Template Triggers', count: triggers.length },
              { id: 'credentials', label: 'API Key & Endpoint' },
              { id: 'tester', label: 'Live Test' },
              { id: 'logs', label: 'Delivery Logs', count: logs.length },
            ] as const
          ).map((tab) => {
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                {'count' in tab && typeof tab.count === 'number' && (
                  <span className="font-mono tabular-nums text-[11px] text-neutral-400 dark:text-neutral-500">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Copy Endpoint bar */}
        <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 min-w-0">
          <span className="font-mono truncate max-w-[260px] sm:max-w-[340px]" title={endpointUrl}>
            POST {endpointUrl}
          </span>
          <button
            type="button"
            onClick={() => copyText(endpointUrl, 'top_endpoint', 'Endpoint Copied')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium cursor-pointer shrink-0"
          >
            {copiedId === 'top_endpoint' ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>Copy</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: TEMPLATE TRIGGERS */}
      {activeView === 'triggers' && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                AI Call Template Triggers
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Each trigger binds a short key (e.g. <code className="font-mono text-neutral-800 dark:text-neutral-200">send_catalog</code>) to a specific sender number and approved Meta template.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={triggerSearch}
                onChange={(e) => setTriggerSearch(e.target.value)}
                placeholder="Search trigger or template..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {loadingTriggers ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 animate-pulse"
                />
              ))}
            </div>
          ) : filteredTriggers.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-3">
              <div className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 flex items-center justify-center mx-auto">
                <Webhook className="w-5 h-5" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {triggerSearch
                    ? 'No triggers match your search'
                    : 'No AI Call Template Triggers yet'}
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {triggerSearch
                    ? 'Try another trigger key, template name, or phone number.'
                    : 'Create your first trigger so your Voice AI agent can send a Meta-approved WhatsApp template from your connected number when a customer asks for a link or brochure.'}
                </p>
              </div>
              {!triggerSearch && (
                <button
                  type="button"
                  onClick={openCreateTriggerModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Trigger</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    <th className="py-3 px-5">Trigger Key &amp; Label</th>
                    <th className="py-3 px-4">WhatsApp Sender</th>
                    <th className="py-3 px-4">Approved Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80 dark:divide-neutral-800 text-xs">
                  {filteredTriggers.map((trg) => {
                    const matchedAcc = accounts.find(
                      (a) =>
                        a.phoneNumberId === trg.phoneNumberId || a.id === trg.phoneNumberId
                    );
                    const varCount = Object.keys(trg.variableMappings || {}).length;
                    const isActive = trg.enabled !== false;
                    return (
                      <tr
                        key={trg.id}
                        className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                              {trg.triggerKey}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyText(
                                  trg.triggerKey,
                                  `key_${trg.id}`,
                                  'Trigger Key Copied'
                                )
                              }
                              title={`Copy trigger key "${trg.triggerKey}"`}
                              aria-label={`Copy trigger key ${trg.triggerKey}`}
                              className="p-1 rounded-md text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
                            >
                              {copiedId === `key_${trg.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[220px]">
                            {trg.label}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <div className="font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                            {matchedAcc?.displayPhoneNumber || trg.displayPhoneNumber || trg.phoneNumberId}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[180px]">
                            {matchedAcc?.verifiedName || 'Connected WhatsApp'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {trg.templateName}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 font-mono tabular-nums">
                            <span>{trg.templateLanguage}</span>
                            {trg.headerFormat && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{trg.headerFormat}</span>
                              </>
                            )}
                            {varCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{varCount} vars</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-middle">
                          <button
                            type="button"
                            onClick={() => handleToggleTriggerActive(trg)}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                              isActive
                                ? 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-800'
                                : 'text-amber-700 dark:text-amber-400 hover:text-amber-800'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Active</span>
                              </>
                            ) : (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                <span>Paused</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-5 align-middle text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                copyText(
                                  buildWebhookJsonForTrigger(trg),
                                  `json_${trg.id}`,
                                  'AI Webhook JSON Copied'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium cursor-pointer whitespace-nowrap"
                              title="Copy JSON payload for Voice AI calling panel"
                            >
                              {copiedId === `json_${trg.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Code2 className="w-3.5 h-3.5" />
                              )}
                              <span>Copy JSON</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenTesterForTrigger(trg)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium cursor-pointer whitespace-nowrap"
                              title="Test this trigger live"
                            >
                              <Play className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Test</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditTriggerModal(trg)}
                              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                              title="Edit trigger"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingTrigger(trg)}
                              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-neutral-600 hover:text-rose-600 dark:text-neutral-300 dark:hover:text-rose-400 cursor-pointer"
                              title="Delete trigger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* VIEW 2: API KEY & ENDPOINT */}
      {activeView === 'credentials' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Webhook Credentials &amp; Default Sender
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Paste these credentials in your external Voice AI calling panel.
                </p>
              </div>
              <button
                type="button"
                disabled={savingConfig || loadingConfig}
                onClick={() =>
                  handleSaveApiConfig({ enabled: !(config?.enabled !== false) })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  config?.enabled !== false
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                }`}
              >
                {config?.enabled !== false ? 'API Active' : 'API Paused'}
              </button>
            </div>

            {loadingConfig ? (
              <div className="space-y-4">
                <div className="h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
                <div className="h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* Endpoint */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                    POST Endpoint URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={endpointUrl}
                      className="flex-1 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(endpointUrl, 'cred_url', 'Endpoint Copied')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer shrink-0"
                    >
                      {copiedId === 'cred_url' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                {/* Secret API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Secret API Key (<code className="font-mono">x-api-key</code>)
                    </label>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
                      Last used: {formatShortDate(config?.lastUsedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        readOnly
                        value={showKey ? config?.apiKey || '' : maskedKey}
                        className="w-full px-3.5 py-2 pr-10 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                        title={showKey ? 'Hide API key' : 'Reveal API key'}
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        config?.apiKey && copyText(config.apiKey, 'cred_key', 'API Key Copied')
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer shrink-0"
                    >
                      {copiedId === 'cred_key' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRegenerateOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold text-neutral-700 hover:text-rose-600 dark:text-neutral-200 dark:hover:text-rose-400 cursor-pointer shrink-0"
                      title="Rotate secret key"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate</span>
                    </button>
                  </div>
                </div>

                {/* Default Sender Number */}
                <div className="space-y-1.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                    Default Fallback WhatsApp Sender
                  </label>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Used when your AI panel calls the API without specifying a trigger or <code className="font-mono">phoneNumberId</code>. Named Template Triggers always use their own assigned number.
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <select
                      value={selectedDefaultSender}
                      onChange={(e) => setSelectedDefaultSender(e.target.value)}
                      className="flex-1 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="">Auto-select first connected WhatsApp number</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.phoneNumberId}>
                          {acc.displayPhoneNumber} — {acc.verifiedName || 'WhatsApp Business'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={savingConfig}
                      onClick={() => handleSaveApiConfig()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      {savingConfig ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>Save Sender</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Code Integration Guide */}
          <section className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                AI Calling Panel Request Format
              </h3>
              <button
                type="button"
                onClick={() => copyText(codeSnippet, 'snippet_copy', 'Request Snippet Copied')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-200 cursor-pointer"
              >
                {copiedId === 'snippet_copy' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy</span>
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
              {(
                [
                  { id: 'trigger', label: 'Named Trigger' },
                  { id: 'direct_template', label: 'Direct Template' },
                  { id: 'direct_text', label: 'Text / Media' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSnippetMode(m.id)}
                  className={`flex-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    snippetMode === m.id
                      ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <pre className="p-4 rounded-xl bg-neutral-950 text-neutral-100 font-mono text-[11px] leading-relaxed overflow-x-auto border border-neutral-800">
              {codeSnippet}
            </pre>

            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Phone numbers accept 10-digit Indian format (<code className="font-mono">9876543210</code>) or E.164 (<code className="font-mono">+919876543210</code>). Every dispatched message automatically appears in your Team Inbox and Delivery Logs.
            </p>
          </section>
        </div>
      )}

      {/* VIEW 3: LIVE ENDPOINT TESTER */}
      {activeView === 'tester' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
            <form onSubmit={handleRunLiveTest} className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-neutral-200 dark:border-neutral-800">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Live Webhook Test
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Sends a real WhatsApp message through <code className="font-mono">POST /api/whatsapp/send</code> using your active API key.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTestMode('trigger')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      testMode === 'trigger'
                        ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Saved Trigger
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMode('direct')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      testMode === 'direct'
                        ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Direct Text / Media
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                    Recipient WhatsApp Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+919876543210"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Rahul Sharma"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              {testMode === 'trigger' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                      Select Template Trigger
                    </label>
                    <select
                      value={testTriggerKey}
                      onChange={(e) => {
                        setTestTriggerKey(e.target.value);
                        const found = triggers.find((t) => t.triggerKey === e.target.value);
                        const nextVars: Record<string, string> = {};
                        if (found?.variableMappings) {
                          Object.entries(found.variableMappings).forEach(([k, map]) => {
                            if (map.mode === 'dynamic') nextVars[k] = map.value || '';
                          });
                        }
                        setTestVariables(nextVars);
                      }}
                      className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="">Choose a configured trigger...</option>
                      {triggers.map((t) => (
                        <option key={t.id} value={t.triggerKey}>
                          {t.triggerKey} — {t.templateName} ({t.displayPhoneNumber || t.phoneNumberId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeTestTrigger &&
                    activeTestTrigger.variableMappings &&
                    Object.keys(activeTestTrigger.variableMappings).length > 0 && (
                      <div className="space-y-2.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                        <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                          Variable Overrides (Optional)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {Object.entries(activeTestTrigger.variableMappings).map(([k, map]) => (
                            <div key={k} className="space-y-1">
                              <label className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 block">
                                {`{{${k}}}`} · {map.mode}
                              </label>
                              <input
                                type="text"
                                placeholder={
                                  map.mode === 'customer_name'
                                    ? 'Uses Customer Name above'
                                    : map.value || `Value for {{${k}}}`
                                }
                                value={testVariables[k] || ''}
                                onChange={(e) =>
                                  setTestVariables((prev) => ({
                                    ...prev,
                                    [k]: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                      Message Text
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Hi! Here is the product link you asked for on the call..."
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                      Public Media URL (Optional PDF / Image / Video)
                    </label>
                    <input
                      type="url"
                      placeholder="https://example.com/brochure.pdf"
                      value={testMediaUrl}
                      onChange={(e) => setTestMediaUrl(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                  Source Tag
                </label>
                <input
                  type="text"
                  value={testSource}
                  onChange={(e) => setTestSource(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={sendingTest || !config?.apiKey}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {sendingTest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{sendingTest ? 'Dispatching...' : 'Send Live Test'}</span>
                </button>
              </div>
            </form>
          </section>

          {/* Response Output */}
          <section className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                API Response
              </h3>
              {testResponse && (
                <span
                  className={`font-mono text-xs font-semibold ${
                    testResponse.status >= 200 && testResponse.status < 300
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  HTTP {testResponse.status}
                </span>
              )}
            </div>

            {testResponse ? (
              <pre className="p-4 rounded-xl bg-neutral-950 text-neutral-100 font-mono text-[11px] leading-relaxed overflow-x-auto border border-neutral-800">
                {JSON.stringify(testResponse.body, null, 2)}
              </pre>
            ) : (
              <div className="py-12 text-center text-xs text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                Run a test request on the left to inspect the live JSON response from Meta Cloud API.
              </div>
            )}

            {activeTestTrigger && (
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    cURL for {activeTestTrigger.triggerKey}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        buildCurlForTrigger(activeTestTrigger),
                        'test_curl',
                        'cURL Copied'
                      )
                    }
                    className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy cURL</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-neutral-950 text-neutral-200 font-mono text-[10px] overflow-x-auto border border-neutral-800">
                  {buildCurlForTrigger(activeTestTrigger)}
                </pre>
              </div>
            )}
          </section>
        </div>
      )}

      {/* VIEW 4: ACTIVITY LOGS */}
      {activeView === 'logs' && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                External API Delivery Logs
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Latest 100 WhatsApp messages triggered via Voice AI webhooks.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                {(['all', 'sent', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setLogStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize cursor-pointer ${
                      logStatusFilter === st
                        ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <div className="relative w-48 sm:w-56">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search phone or trigger..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={loadLogs}
                disabled={loadingLogs}
                className="p-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingLogs ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 animate-pulse"
                />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-2">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                No API delivery logs yet
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                When your Voice AI agent triggers a template or you run a Live Test, delivery records will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    <th className="py-3 px-5">Time</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Trigger / Template</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-5">Message ID / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80 dark:divide-neutral-800 text-xs">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-3 px-5 font-mono tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                        {formatShortDate(log.timestamp)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono tabular-nums text-neutral-900 dark:text-white">
                          {log.to}
                        </div>
                        {log.name && (
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {log.name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-neutral-900 dark:text-neutral-100">
                          {log.triggerKey || log.templateName || 'Direct Message'}
                        </div>
                        {log.templateName && log.triggerKey && (
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {log.templateName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {log.source || 'external-api'}
                      </td>
                      <td className="py-3 px-4">
                        {log.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Sent</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 max-w-[280px]">
                        {log.status === 'sent' ? (
                          <span
                            className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400 block truncate"
                            title={log.messageId || ''}
                          >
                            {log.messageId || '—'}
                          </span>
                        ) : (
                          <span
                            className="text-[11px] text-rose-600 dark:text-rose-400 block truncate"
                            title={log.error || ''}
                          >
                            {log.error || 'Failed to send'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* CREATE / EDIT TRIGGER MODAL WITH LIVE WHATSAPP MOBILE PREVIEW */}
      {isTriggerModalOpen && (() => {
        const previewMediaSrc =
          formLocalMediaPreview ||
          (formHeaderMediaUrl && !formHeaderMediaUrl.startsWith('blob:')
            ? formHeaderMediaUrl
            : '') ||
          (formHeaderMediaId && selectedFormAccount?.phoneNumberId
            ? `/api/meta/media-proxy?mediaId=${encodeURIComponent(formHeaderMediaId)}&phoneNumberId=${encodeURIComponent(selectedFormAccount.phoneNumberId)}&organizationId=${encodeURIComponent(orgId)}`
            : '');

        const resolvePreviewValue = (key: string, fallbackPlaceholder: string) => {
          const map = formVariableMappings[key];
          if (!map) return fallbackPlaceholder;
          if (map.mode === 'customer_name') {
            return map.value?.trim() || 'Rahul Sharma';
          }
          return map.value?.trim() || fallbackPlaceholder;
        };

        const rawBody = getTemplateBodyText(selectedTemplate);
        const previewBodyText = rawBody
          ? rawBody.replace(/\{\{(\d+)\}\}/g, (_m, idx) =>
              resolvePreviewValue(idx, `{{${idx}}}`)
            )
          : '';

        const previewHeaderText = selectedHeaderInfo.text
          ? selectedHeaderInfo.text.replace(/\{\{(\d+)\}\}/g, (_m, idx) =>
              resolvePreviewValue(`header_${idx}`, `{{${idx}}}`)
            )
          : '';

        const previewFooterText = getTemplateFooterText(selectedTemplate);
        const previewButtons = getTemplateButtons(selectedTemplate);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {editingTriggerId ? 'Edit AI Call Template Trigger' : 'New AI Call Template Trigger'}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Bind a Voice AI trigger key to a WhatsApp number, Meta-approved template, exact media, and variable values.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTriggerModalOpen(false)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                {/* LEFT COLUMN: Configuration Form */}
                <form
                  id="voice-ai-trigger-form"
                  onSubmit={handleSaveTrigger}
                  className="lg:col-span-7 overflow-y-auto px-6 py-5 space-y-5 text-xs lg:border-r border-neutral-200 dark:border-neutral-800"
                >
                  {/* Trigger Key & Label */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-neutral-700 dark:text-neutral-300 block">
                        Trigger Key (Used by Voice AI)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. send_catalog"
                        value={formTriggerKey}
                        onChange={(e) => setFormTriggerKey(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-white"
                      />
                      {formTriggerKey && (
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          <span>
                            Slug:{' '}
                            <code className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                              {normalizeTriggerSlug(formTriggerKey) || 'invalid'}
                            </code>
                          </span>
                          {normalizeTriggerSlug(formTriggerKey) && (
                            <button
                              type="button"
                              onClick={() =>
                                copyText(
                                  normalizeTriggerSlug(formTriggerKey),
                                  'modal_trigger_slug',
                                  'Trigger Key Copied'
                                )
                              }
                              title="Copy trigger key"
                              aria-label="Copy trigger key"
                              className="p-0.5 rounded text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            >
                              {copiedId === 'modal_trigger_slug' ? (
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-semibold text-neutral-700 dark:text-neutral-300 block">
                        Display Label
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Send Product Brochure Link"
                        value={formLabel}
                        onChange={(e) => setFormLabel(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Connected WhatsApp Sender */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 block">
                      Specific WhatsApp Business Sender Number
                    </label>
                    {accounts.length === 0 ? (
                      <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 shrink-0" />
                        <span>
                          No WhatsApp number connected yet. Connect a number in the WhatsApp Numbers tab first.
                        </span>
                      </div>
                    ) : (
                      <select
                        required
                        value={formPhoneNumberId}
                        onChange={(e) => setFormPhoneNumberId(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                      >
                        <option value="">Select connected WhatsApp number...</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.phoneNumberId}>
                            {acc.displayPhoneNumber} — {acc.verifiedName || 'WhatsApp Business'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Approved Meta Template */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                        Meta Approved Template
                      </label>
                      <button
                        type="button"
                        onClick={handleSyncMetaTemplates}
                        disabled={syncingTemplates || accounts.length === 0}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingTemplates ? 'animate-spin' : ''}`} />
                        <span>Sync from Meta</span>
                      </button>
                    </div>
                    <select
                      required={!editingTriggerId}
                      value={formTemplateId}
                      onChange={(e) => setFormTemplateId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="">
                        {filteredApprovedTemplates.length > 0
                          ? 'Choose an APPROVED WhatsApp template...'
                          : 'No approved templates found (click Sync from Meta)'}
                      </option>
                      {filteredApprovedTemplates.map((tpl) => {
                        const hdr = getTemplateHeaderInfo(tpl);
                        return (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name} ({tpl.language} · {tpl.category}
                            {hdr.format ? ` · ${hdr.format}` : ''})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Conditional Header Media */}
                  {needsHeaderMedia && (
                    <div className="space-y-2.5 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                          Template Header {effectiveHeaderFormat}
                        </label>
                        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                          <button
                            type="button"
                            onClick={() => setFormHeaderMediaMode('upload')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                              formHeaderMediaMode === 'upload'
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white'
                                : 'text-neutral-500'
                            }`}
                          >
                            Upload PC
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormHeaderMediaMode('url')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                              formHeaderMediaMode === 'url'
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white'
                                : 'text-neutral-500'
                            }`}
                          >
                            Public URL
                          </button>
                        </div>
                      </div>

                      {formHeaderMediaMode === 'upload' ? (
                        <div className="flex items-center gap-3">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={
                              effectiveHeaderFormat === 'IMAGE'
                                ? 'image/*'
                                : effectiveHeaderFormat === 'VIDEO'
                                ? 'video/*'
                                : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
                            }
                            onChange={(e) => handleHeaderMediaUpload(e.target.files?.[0])}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={uploadingMedia}
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer shrink-0"
                          >
                            {uploadingMedia ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>{uploadingMedia ? 'Uploading...' : 'Choose File'}</span>
                          </button>
                          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-neutral-600 dark:text-neutral-300 truncate font-mono">
                              {formHeaderFileName || formHeaderMediaId || formHeaderMediaUrl || 'No file uploaded yet'}
                            </span>
                            {(formHeaderMediaId || formHeaderMediaUrl || formLocalMediaPreview) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFormHeaderMediaUrl('');
                                  setFormHeaderMediaId('');
                                  setFormHeaderFileName('');
                                  setFormLocalMediaPreview('');
                                }}
                                className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer shrink-0"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <LinkIcon className="w-4 h-4 text-neutral-400 shrink-0" />
                          <input
                            type="url"
                            placeholder="https://example.com/catalog.jpg"
                            value={formHeaderMediaUrl}
                            onChange={(e) => {
                              setFormHeaderMediaUrl(e.target.value);
                              setFormHeaderMediaId('');
                              setFormLocalMediaPreview(e.target.value);
                            }}
                            className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono text-xs text-neutral-900 dark:text-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Variable Mappings */}
                  {detectedVars.length > 0 && (
                    <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                      <div>
                        <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                          Template Variable Values
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          Jo values aap yahan set karenge wahi exact values mobile preview me dikhengi aur call trigger hone par deliver hongi.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {detectedVars.map((item) => {
                          const mapping = formVariableMappings[item.key] || {
                            mode: 'static',
                            value: '',
                          };
                          return (
                            <div
                              key={item.key}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                            >
                              <div
                                className="sm:col-span-3 font-mono font-semibold text-neutral-800 dark:text-neutral-200 truncate"
                                title={item.label}
                              >
                                {item.label}
                              </div>
                              <div className="sm:col-span-4">
                                <select
                                  value={mapping.mode}
                                  onChange={(e) =>
                                    setFormVariableMappings((prev) => ({
                                      ...prev,
                                      [item.key]: {
                                        ...mapping,
                                        mode: e.target.value as TriggerVariableMapping['mode'],
                                      },
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                                >
                                  <option value="static">Fixed Exact Value</option>
                                  <option value="customer_name">Customer Name (AI Call)</option>
                                  <option value="dynamic">Dynamic (Fallback Below)</option>
                                </select>
                              </div>
                              <div className="sm:col-span-5">
                                <input
                                  type="text"
                                  placeholder={
                                    mapping.mode === 'customer_name'
                                      ? 'Fallback name (e.g. Customer)'
                                      : mapping.mode === 'static'
                                      ? 'Exact value to deliver (e.g. https://...)'
                                      : 'Default value if AI does not pass'
                                  }
                                  value={mapping.value || ''}
                                  onChange={(e) =>
                                    setFormVariableMappings((prev) => ({
                                      ...prev,
                                      [item.key]: {
                                        ...mapping,
                                        value: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs text-neutral-900 dark:text-white"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Active toggle */}
                  <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                        Trigger Status
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Paused triggers reject incoming Voice AI requests until re-enabled.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formEnabled}
                        onChange={(e) => setFormEnabled(e.target.checked)}
                        className="rounded text-emerald-600 w-4 h-4"
                      />
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {formEnabled ? 'Active' : 'Paused'}
                      </span>
                    </label>
                  </div>
                </form>

                {/* RIGHT COLUMN: LIVE WHATSAPP MOBILE PREVIEW */}
                <div className="lg:col-span-5 bg-neutral-50 dark:bg-neutral-950/60 p-5 flex flex-col items-center justify-start overflow-y-auto">
                  <div className="w-full max-w-[300px] space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                        Live WhatsApp Mobile Preview
                      </span>
                      <span className="font-mono">
                        {selectedTemplate?.language || 'en_US'}
                      </span>
                    </div>

                    {/* Realistic Phone Frame */}
                    <div className="rounded-[28px] border-[6px] border-neutral-900 dark:border-neutral-800 bg-neutral-900 shadow-lg overflow-hidden">
                      {/* Phone Notch / Status Bar */}
                      <div className="bg-[#075E54] text-white px-3.5 pt-2 pb-2.5 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold shrink-0">
                          {(selectedFormAccount?.verifiedName || 'W').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold truncate">
                              {selectedFormAccount?.verifiedName || 'WhatsApp Business'}
                            </span>
                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                          </div>
                          <p className="text-[10px] text-white/80 font-mono truncate">
                            {selectedFormAccount?.displayPhoneNumber || '+91 00000 00000'}
                          </p>
                        </div>
                      </div>

                      {/* Chat Wallpaper Canvas */}
                      <div className="bg-[#EFEAE2] dark:bg-[#0B141A] p-3 min-h-[340px] flex flex-col justify-between">
                        {!selectedTemplate ? (
                          <div className="my-auto text-center px-3 py-8 rounded-xl bg-white/85 dark:bg-neutral-900/90 border border-neutral-200/70 dark:border-neutral-800 space-y-1.5">
                            <Smartphone className="w-5 h-5 text-neutral-400 mx-auto" />
                            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                              Select an Approved Template
                            </p>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              Your live WhatsApp message preview will appear here.
                            </p>
                          </div>
                        ) : (
                          <div className="bg-white dark:bg-[#202C33] rounded-xl rounded-tl-xs shadow-xs overflow-hidden text-neutral-900 dark:text-neutral-100 border border-black/5 dark:border-white/5">
                            {/* Header Media or Text */}
                            {effectiveHeaderFormat === 'IMAGE' && (
                              <div className="bg-neutral-100 dark:bg-neutral-800">
                                {previewMediaSrc ? (
                                  <img
                                    src={previewMediaSrc}
                                    alt="Header preview"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-36 object-cover block"
                                  />
                                ) : (
                                  <div className="h-32 flex flex-col items-center justify-center text-neutral-400 gap-1">
                                    <ImageIcon className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">
                                      Upload or paste image URL
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {effectiveHeaderFormat === 'VIDEO' && (
                              <div className="bg-neutral-900">
                                {previewMediaSrc ? (
                                  <video
                                    src={previewMediaSrc}
                                    controls
                                    className="w-full h-36 object-cover block"
                                  />
                                ) : (
                                  <div className="h-32 flex flex-col items-center justify-center text-neutral-400 gap-1">
                                    <Video className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">
                                      Upload or paste video URL
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {effectiveHeaderFormat === 'DOCUMENT' && (
                              <div className="p-2.5 bg-neutral-100/90 dark:bg-neutral-800/80 border-b border-neutral-200/70 dark:border-neutral-700/60 flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold truncate text-neutral-900 dark:text-white">
                                    {formHeaderFileName || (previewMediaSrc ? 'Attached Document.pdf' : 'No document attached')}
                                  </p>
                                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                    PDF / Document Attachment
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Body & Footer */}
                            <div className="px-3 py-2.5 space-y-1.5">
                              {effectiveHeaderFormat === 'TEXT' && previewHeaderText && (
                                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                                  {previewHeaderText}
                                </p>
                              )}

                              <p className="text-[12px] leading-[1.45] whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-100">
                                {previewBodyText || '(No body text)'}
                              </p>

                              <div className="flex items-end justify-between gap-2 pt-0.5">
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                  {previewFooterText || ''}
                                </p>
                                <span className="text-[9px] text-neutral-400 font-mono tabular-nums shrink-0">
                                  12:00 PM
                                </span>
                              </div>
                            </div>

                            {/* Interactive Template Buttons */}
                            {previewButtons.length > 0 && (
                              <div className="border-t border-neutral-200/80 dark:border-neutral-700/70 divide-y divide-neutral-200/80 dark:divide-neutral-700/70">
                                {previewButtons.map((btn, idx) => (
                                  <div
                                    key={idx}
                                    className="px-3 py-2 text-center text-[11px] font-semibold text-[#00A884] dark:text-[#53BDEB] flex items-center justify-center gap-1.5"
                                  >
                                    {btn.type === 'URL' && <ExternalLink className="w-3 h-3" />}
                                    {btn.type === 'PHONE_NUMBER' && <Phone className="w-3 h-3" />}
                                    {btn.type === 'QUICK_REPLY' && <CornerUpLeft className="w-3 h-3" />}
                                    <span className="truncate">{btn.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-3 text-[10px] text-center text-neutral-500 dark:text-neutral-400">
                          Exact media &amp; values shown above will be delivered on WhatsApp
                        </div>
                      </div>
                    </div>

                    {/* Delivery Readiness Summary */}
                    {selectedTemplate && (
                      <div className="text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1 pt-1">
                        <div className="flex items-center justify-between">
                          <span>Template</span>
                          <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-200 truncate max-w-[165px]">
                            {selectedTemplate.name}
                          </span>
                        </div>
                        {needsHeaderMedia && (
                          <div className="flex items-center justify-between">
                            <span>Header {effectiveHeaderFormat}</span>
                            <span
                              className={`font-semibold ${
                                formHeaderMediaId || formHeaderMediaUrl
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {formHeaderMediaId || formHeaderMediaUrl ? 'Attached' : 'Not set'}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span>Variables Set</span>
                          <span className="font-mono tabular-nums font-semibold text-neutral-900 dark:text-neutral-200">
                            {
                              detectedVars.filter((v) =>
                                Boolean(formVariableMappings[v.key]?.value?.trim())
                              ).length
                            }
                            /{detectedVars.length}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/60 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsTriggerModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="voice-ai-trigger-form"
                  disabled={savingTrigger || uploadingMedia}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingTrigger ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{editingTriggerId ? 'Save Trigger' : 'Create Trigger'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DELETE TRIGGER CONFIRM MODAL */}
      {deletingTrigger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Delete Trigger &ldquo;{deletingTrigger.triggerKey}&rdquo;?
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Any Voice AI call referencing <code className="font-mono">{deletingTrigger.triggerKey}</code> will stop sending WhatsApp templates until you recreate it.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTrigger(null)}
                className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmingDelete}
                onClick={handleConfirmDeleteTrigger}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {confirmingDelete && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Trigger</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGENERATE API KEY CONFIRM MODAL */}
      {confirmRegenerateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Rotate Secret API Key?
              </h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              The existing key will immediately stop working. You must update the new <code className="font-mono">x-api-key</code> inside your external Voice AI calling panel.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRegenerateOpen(false)}
                className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={regeneratingKey}
                onClick={handleRegenerateKey}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {regeneratingKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Rotate Key</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
