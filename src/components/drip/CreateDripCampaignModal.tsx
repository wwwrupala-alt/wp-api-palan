import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Workflow,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Smartphone,
  Users,
  FileText,
  Send,
  Loader2,
  Copy,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  Play,
  HelpCircle,
  Eye,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Video,
  UploadCloud,
  Link as LinkIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  createDripCampaign,
  updateDripCampaign,
  enrollDripSubscribersApi,
  testSendDripStepApi,
  subscribeTemplates,
  subscribeGroups,
  subscribeContacts,
  uploadMediaFile,
} from '../../lib/services.ts';
import type {
  DripCampaign,
  DripStep,
  Template,
  ContactGroup,
  Contact,
} from '../../types/index.ts';
import { DripBlueprintsModal, DRIP_BLUEPRINTS, DripBlueprint } from './DripBlueprintsModal.tsx';

interface CreateDripCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignToEdit?: DripCampaign | null;
  onSuccess?: (campaignId: string) => void;
}

export const CreateDripCampaignModal: React.FC<CreateDripCampaignModalProps> = ({
  isOpen,
  onClose,
  campaignToEdit,
  onSuccess,
}) => {
  const { organization } = useAuth();
  const { accounts, activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [whatsAppAccountId, setWhatsAppAccountId] = useState('');
  const [triggerType, setTriggerType] = useState<'group_enrollment' | 'all_opted_in' | 'manual_contacts'>('group_enrollment');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [manualPhoneList, setManualPhoneList] = useState('');
  const [autoEnrollExisting, setAutoEnrollExisting] = useState(true);

  // Steps State
  const [steps, setSteps] = useState<DripStep[]>([
    {
      id: 'step_1',
      stepNumber: 1,
      title: 'Step 1: Immediate Welcome & Greeting',
      delayValue: 0,
      delayUnit: 'minutes',
      templateId: '',
      templateName: '',
      condition: 'always',
      variableValues: { body_1: 'Customer' },
    },
    {
      id: 'step_2',
      stepNumber: 2,
      title: 'Step 2: Day 1 Value & Proof Follow-Up',
      delayValue: 24,
      delayUnit: 'hours',
      templateId: '',
      templateName: '',
      condition: 'always',
      variableValues: { body_1: 'Customer' },
    },
  ]);

  // Step Testing State
  const [testingStepNum, setTestingStepNum] = useState<number | null>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [uploadingStepIndex, setUploadingStepIndex] = useState<number | null>(null);
  const [stepMediaModes, setStepMediaModes] = useState<Record<number, 'url' | 'upload'>>({});

  const [saving, setSaving] = useState(false);

  // Subscribe to real data
  useEffect(() => {
    if (!isOpen || !organization?.id) return;

    const unsubTpl = subscribeTemplates(
      organization.id,
      (t) => {
        // filter to approved templates
        const approved = t.filter((item) => (item.status || '').toUpperCase() === 'APPROVED');
        setTemplates(approved.length > 0 ? approved : t);
      },
      () => {}
    );

    const unsubGrp = subscribeGroups(
      organization.id,
      (g) => setGroups(g),
      () => {}
    );

    const unsubCnt = subscribeContacts(
      organization.id,
      (c) => setContacts(c),
      () => {}
    );

    return () => {
      unsubTpl();
      unsubGrp();
      unsubCnt();
    };
  }, [isOpen, organization?.id]);

  // Initial population or reset
  useEffect(() => {
    if (!isOpen) return;

    if (campaignToEdit) {
      setName(campaignToEdit.name || '');
      setDescription(campaignToEdit.description || '');
      setWhatsAppAccountId(campaignToEdit.whatsAppAccountId || activeAccount?.phoneNumberId || '');
      setTriggerType(campaignToEdit.triggerType || 'group_enrollment');
      setTargetGroupId(campaignToEdit.targetGroupId || '');
      const sanitized = (campaignToEdit.steps || []).map((s, idx) => ({
        ...s,
        title: s.title || `Step ${s.stepNumber || idx + 1}`,
        delayValue: s.delayValue ?? 0,
        delayUnit: s.delayUnit || 'minutes',
        condition: s.condition || 'always',
        templateId: s.templateId || '',
        templateName: s.templateName || '',
        headerMediaUrl: s.headerMediaUrl || '',
        variableValues: s.variableValues || {},
      }));
      setSteps(sanitized.length > 0 ? sanitized : []);
      setAutoEnrollExisting(false);
    } else {
      setName('');
      setDescription('');
      setWhatsAppAccountId(activeAccount?.phoneNumberId || accounts[0]?.phoneNumberId || '');
      setTriggerType('group_enrollment');
      setTargetGroupId(groups[0]?.id || '');
      setManualPhoneList('');
      setAutoEnrollExisting(true);
      setSteps([
        {
          id: `step_${Date.now()}_1`,
          stepNumber: 1,
          title: 'Step 1: Immediate Welcome & Greeting',
          delayValue: 0,
          delayUnit: 'minutes',
          templateId: '',
          templateName: '',
          condition: 'always',
          variableValues: { body_1: 'Customer' },
        },
        {
          id: `step_${Date.now()}_2`,
          stepNumber: 2,
          title: 'Step 2: Day 1 Value & Proof Follow-Up',
          delayValue: 24,
          delayUnit: 'hours',
          templateId: '',
          templateName: '',
          condition: 'if_not_replied',
          variableValues: { body_1: 'Customer' },
        },
      ]);
    }
  }, [isOpen, campaignToEdit?.id, activeAccount?.phoneNumberId]);

  // Add Step
  const handleAddStep = () => {
    const nextNum = steps.length + 1;
    const newStep: DripStep = {
      id: `step_${Date.now()}_${nextNum}`,
      stepNumber: nextNum,
      title: `Step ${nextNum}: Follow-up Message`,
      delayValue: 24,
      delayUnit: 'hours',
      templateId: '',
      templateName: '',
      condition: 'always',
      variableValues: { body_1: 'Customer' },
    };
    setSteps([...steps, newStep]);
  };

  // Remove Step
  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) {
      toast.showWarning('Minimum Step', 'A drip campaign must contain at least 1 step.');
      return;
    }
    const updated = steps
      .filter((_, i) => i !== index)
      .map((st, i) => ({ ...st, stepNumber: i + 1 }));
    setSteps(updated);
  };

  // Move Step Up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...steps];
    const temp = newSteps[index - 1];
    newSteps[index - 1] = newSteps[index];
    newSteps[index] = temp;
    setSteps(newSteps.map((st, i) => ({ ...st, stepNumber: i + 1 })));
  };

  // Move Step Down
  const handleMoveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    const temp = newSteps[index + 1];
    newSteps[index + 1] = newSteps[index];
    newSteps[index] = temp;
    setSteps(newSteps.map((st, i) => ({ ...st, stepNumber: i + 1 })));
  };

  // Duplicate Step
  const handleDuplicateStep = (index: number) => {
    const source = steps[index];
    const copy: DripStep = {
      ...source,
      id: `step_${Date.now()}`,
      title: `${source.title} (Copy)`,
    };
    const newSteps = [...steps];
    newSteps.splice(index + 1, 0, copy);
    setSteps(newSteps.map((st, i) => ({ ...st, stepNumber: i + 1 })));
  };

  // Update specific step field
  const handleUpdateStep = (index: number, updates: Partial<DripStep>) => {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  // Template helper: check header format
  const getTemplateHeaderFormat = (tpl?: Template): 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null => {
    if (!tpl?.components) return null;
    const headerComp = tpl.components.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
    if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(headerComp.format || '').toUpperCase())) {
      return String(headerComp.format).toUpperCase() as any;
    }
    return null;
  };

  // Template helper: extract all body and header dynamic variables
  const getTemplateVariables = (tpl?: Template) => {
    if (!tpl?.components) return [];
    const vars: Array<{ key: string; num: string; label: string; sample: string }> = [];
    const bodyComp = tpl.components.find((c) => String(c.type || '').toUpperCase() === 'BODY');
    if (bodyComp?.text) {
      const matches = Array.from(bodyComp.text.matchAll(/\{\{(\d+)\}\}/g));
      matches.forEach((m) => {
        const num = m[1];
        const sample = bodyComp.example?.body_text?.[0]?.[parseInt(num, 10) - 1] || '';
        const label = num === '1' ? 'Variable {{1}} (Contact Name)' : `Variable {{${num}}}`;
        if (!vars.some((v) => v.key === `body_${num}`)) {
          vars.push({ key: `body_${num}`, num, label, sample });
        }
      });
    }
    const headerComp = tpl.components.find((c) => String(c.type || '').toUpperCase() === 'HEADER' && c.format === 'TEXT');
    if (headerComp?.text) {
      const matches = Array.from(headerComp.text.matchAll(/\{\{(\d+)\}\}/g));
      matches.forEach((m) => {
        const num = m[1];
        const sample = headerComp.example?.header_text?.[parseInt(num, 10) - 1] || '';
        if (!vars.some((v) => v.key === `header_${num}`)) {
          vars.push({ key: `header_${num}`, num, label: `Header {{${num}}}`, sample });
        }
      });
    }
    return vars;
  };

  // Template helper: live text preview with replaced variables
  const renderPreviewText = (text?: string, vars?: Record<string, string>) => {
    if (!text) return '';
    let out = text;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        if (k.startsWith('body_')) {
          const num = k.replace('body_', '');
          out = out.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), v || (num === '1' ? 'John Doe' : `[Value {{${num}}}]`));
        }
      });
    }
    return out.replace(/\{\{(\d+)\}\}/g, (_, n) => (n === '1' ? 'John Doe' : `[Value {{${n}}}]`));
  };

  // Step media upload handler
  const handleStepMediaFileSelected = async (stepIndex: number, file: File) => {
    if (!file) return;
    setUploadingStepIndex(stepIndex);
    try {
      const selectedAccount = accounts.find((a) => a.phoneNumberId === whatsAppAccountId);
      const res = await uploadMediaFile(file, selectedAccount?.customToken);
      handleUpdateStep(stepIndex, {
        headerMediaUrl: res.url || res.fullUrl,
      });
      toast.showSuccess('Media Ready', `Uploaded "${file.name}" for Step ${steps[stepIndex].stepNumber}.`);
    } catch (err: any) {
      toast.showError('Upload Failed', err?.message || 'Failed to upload media file.');
    } finally {
      setUploadingStepIndex(null);
    }
  };

  // Template change handler for a step
  const handleSelectTemplateForStep = (index: number, templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId || t.name === templateId);
    if (!tpl) {
      handleUpdateStep(index, {
        templateId: '',
        templateName: '',
        template: undefined,
        headerMediaUrl: '',
        variableValues: {},
      });
      return;
    }

    // Extract dynamic variables
    const vars: Record<string, string> = {};
    const tplVars = getTemplateVariables(tpl);
    tplVars.forEach((v) => {
      vars[v.key] = v.num === '1' ? 'Customer' : v.sample || `Value ${v.num}`;
    });

    const headerComp = tpl.components?.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
    const existingMedia = headerComp?.example?.header_handle?.[0] || '';

    handleUpdateStep(index, {
      templateId: tpl.id || tpl.name,
      templateName: tpl.name,
      templateCategory: tpl.category,
      template: tpl,
      headerMediaUrl: existingMedia || steps[index]?.headerMediaUrl || '',
      variableValues: vars,
    });
  };

  // Apply Blueprint
  const handleApplyBlueprint = (bp: DripBlueprint) => {
    setName(bp.name);
    setDescription(bp.description);
    const newSteps: DripStep[] = bp.steps.map((st, i) => {
      // attempt to match an existing template
      const matchedTpl = templates.find(
        (t) =>
          t.name.toLowerCase().includes(st.suggestedTemplateName.toLowerCase()) ||
          t.name.toLowerCase().includes('welcome') ||
          t.name.toLowerCase().includes('offer')
      );

      return {
        id: `step_${Date.now()}_${i + 1}`,
        stepNumber: i + 1,
        title: st.title,
        delayValue: st.delayValue,
        delayUnit: st.delayUnit,
        condition: st.condition,
        templateId: matchedTpl?.id || '',
        templateName: matchedTpl?.name || st.suggestedTemplateName,
        templateCategory: matchedTpl?.category,
        template: matchedTpl,
        variableValues: { body_1: 'Customer' },
      };
    });

    setSteps(newSteps);
    toast.showSuccess(
      'Blueprint Loaded',
      `Imported "${bp.name}" with ${bp.stepsCount} pre-configured sequence steps.`
    );
  };

  // Step Test Send
  const handleSendTestStep = async (stepIndex: number) => {
    if (!testPhoneNumber.trim()) {
      toast.showWarning('Phone Number Required', 'Please enter a test WhatsApp phone number.');
      return;
    }
    const targetStep = steps[stepIndex];
    if (!targetStep.template && !targetStep.templateId) {
      toast.showWarning('Missing Template', 'Please select an approved template for this step first.');
      return;
    }

    setIsSendingTest(true);
    try {
      const selectedAccount = accounts.find((a) => a.phoneNumberId === whatsAppAccountId);
      const res = await testSendDripStepApi(
        organization?.id || '',
        campaignToEdit?.id || 'temp_preview',
        targetStep.stepNumber,
        testPhoneNumber.trim(),
        selectedAccount?.customToken,
        targetStep,
        whatsAppAccountId
      );
      toast.showSuccess(
        'Test Message Sent',
        res.message || `Test of Step ${targetStep.stepNumber} successfully dispatched to ${testPhoneNumber}!`
      );
    } catch (err: any) {
      toast.showError('Test Dispatch Failed', err?.message || 'Could not send test template.');
    } finally {
      setIsSendingTest(false);
      setTestingStepNum(null);
    }
  };

  // Form Submission
  const handleSubmit = async (targetStatus: 'active' | 'paused') => {
    if (!organization?.id) return;
    if (!name.trim()) {
      toast.showWarning('Name Required', 'Please enter a name for this Drip Campaign.');
      return;
    }
    if (!whatsAppAccountId) {
      toast.showWarning('WhatsApp Account Required', 'Please choose a sender WhatsApp account.');
      return;
    }

    // Validate that each step has a template selected
    for (const st of steps) {
      if (!st.templateName && !st.templateId) {
        toast.showWarning(
          'Missing Template',
          `Please select a WhatsApp Template for "${st.title || `Step ${st.stepNumber}`}".`
        );
        return;
      }
    }

    setSaving(true);
    try {
      // Prepare recipients to enroll if autoEnrollExisting is checked
      const recipientsToEnroll: Array<{ phone: string; name?: string }> = [];

      if (autoEnrollExisting) {
        if (triggerType === 'group_enrollment' && targetGroupId) {
          const selectedGrp = groups.find((g) => g.id === targetGroupId);
          if (selectedGrp && Array.isArray((selectedGrp as any).contacts)) {
            (selectedGrp as any).contacts.forEach((c: any) => {
              if (c.phone) recipientsToEnroll.push({ phone: c.phone, name: c.name || 'Customer' });
            });
          }
        } else if (triggerType === 'all_opted_in') {
          contacts.forEach((c) => {
            if (c.phone && c.optInStatus !== 'opted_out') {
              recipientsToEnroll.push({ phone: c.phone, name: c.name || 'Customer' });
            }
          });
        } else if (triggerType === 'manual_contacts' && manualPhoneList.trim()) {
          const lines = manualPhoneList.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
          lines.forEach((p) => recipientsToEnroll.push({ phone: p, name: 'Contact' }));
        }
      }

      const campaignPayload = {
        organizationId: organization.id,
        name: name.trim(),
        description: description.trim(),
        whatsAppAccountId,
        status: targetStatus,
        triggerType,
        targetGroupId: triggerType === 'group_enrollment' ? targetGroupId : undefined,
        steps,
        enrolledCount: recipientsToEnroll.length,
        activeSubscribers: targetStatus === 'active' ? recipientsToEnroll.length : 0,
        completedSubscribers: 0,
        stats: {
          totalMessagesSent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
        },
      };

      let finalCampaignId = campaignToEdit?.id;

      if (campaignToEdit?.id) {
        await updateDripCampaign(organization.id, campaignToEdit.id, campaignPayload);
        toast.showSuccess(
          'Drip Campaign Updated',
          `"${name}" sequence updated successfully.`
        );
      } else {
        finalCampaignId = await createDripCampaign(organization.id, campaignPayload as any);
        toast.showSuccess(
          'Drip Campaign Created',
          `"${name}" created with ${steps.length} sequential steps!`
        );
      }

      // If recipients should be enrolled into this new campaign
      if (finalCampaignId && recipientsToEnroll.length > 0) {
        try {
          await enrollDripSubscribersApi(organization.id, finalCampaignId, recipientsToEnroll);
          toast.showSuccess(
            'Audience Enrolled',
            `Successfully enrolled ${recipientsToEnroll.length} contacts into sequence.`
          );
        } catch (enrollErr) {
          console.warn('[DripModal] Enrollment notice:', enrollErr);
        }
      }

      onSuccess?.(finalCampaignId || '');
      onClose();
    } catch (err: any) {
      toast.showError('Operation Failed', err?.message || 'Could not save drip campaign.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 dark:text-white text-base flex items-center space-x-2">
                <span>{campaignToEdit ? 'Edit Drip Campaign' : 'Create Multi-Step Drip Campaign'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                  Automated Sequence
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Design automated time-delayed WhatsApp sequences with smart reply conditions.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setBlueprintsOpen(true)}
              className="px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center space-x-1.5 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Browse Blueprints</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Section 1: Campaign Details */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/30 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>1. Campaign Information & Sender Setup</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Sequence Name *
                </label>
                <input
                  type="text"
                  value={name || ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 5-Day Onboarding & Offer Sequence"
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Sender WhatsApp Number *
                </label>
                <select
                  value={whatsAppAccountId || ''}
                  onChange={(e) => setWhatsAppAccountId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Connected WhatsApp Number --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.phoneNumberId}>
                      {acc.verifiedName || acc.displayPhoneNumber || 'Account'} ({acc.displayPhoneNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Goal / Internal Description (Optional)
                </label>
                <input
                  type="text"
                  value={description || ''}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Nurture incoming website leads into paying demo bookings."
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Trigger & Audience */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/30 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center space-x-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>2. Audience Trigger & Enrollment Source</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setTriggerType('group_enrollment')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  triggerType === 'group_enrollment'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <span className="font-bold text-xs block">Contact Group</span>
                <span className="text-[11px] text-neutral-500 block mt-0.5">
                  Subscribers from a targeted contact group
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTriggerType('all_opted_in')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  triggerType === 'all_opted_in'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <span className="font-bold text-xs block">All Opted-In Contacts</span>
                <span className="text-[11px] text-neutral-500 block mt-0.5">
                  All active contacts who opted into WhatsApp
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTriggerType('manual_contacts')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  triggerType === 'manual_contacts'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <span className="font-bold text-xs block">Manual List / Paste</span>
                <span className="text-[11px] text-neutral-500 block mt-0.5">
                  Paste raw phone numbers directly
                </span>
              </button>
            </div>

            {triggerType === 'group_enrollment' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Choose Target Contact Group:
                </label>
                <select
                  value={targetGroupId || ''}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  className="w-full max-w-md px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Select Contact Group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({(g as any).contactCount || (g as any).contacts?.length || 0} contacts)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {triggerType === 'manual_contacts' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Paste Phone Numbers (comma or newline separated):
                </label>
                <textarea
                  rows={2}
                  value={manualPhoneList || ''}
                  onChange={(e) => setManualPhoneList(e.target.value)}
                  placeholder="+919876543210&#10;+919123456789"
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            <div className="pt-1 flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoEnrollCheck"
                checked={autoEnrollExisting}
                onChange={(e) => setAutoEnrollExisting(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-neutral-300 focus:ring-emerald-500"
              />
              <label htmlFor="autoEnrollCheck" className="text-xs text-neutral-700 dark:text-neutral-300 font-medium cursor-pointer">
                Auto-enroll existing audience into sequence upon creation
              </label>
            </div>
          </div>

          {/* Section 3: Multi-Step Drip Sequence Visual Builder */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center space-x-2">
                  <Workflow className="w-4 h-4 text-emerald-600" />
                  <span>3. Multi-Step Drip Sequence Builder ({steps.length} Steps)</span>
                </h4>
                <p className="text-xs text-neutral-500">
                  Set delay timings, conditions (e.g. stop if replied), and approved templates for each step.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddStep}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Next Step</span>
              </button>
            </div>

            {/* List of Steps */}
            <div className="space-y-4">
              {steps.map((st, index) => {
                const isFirst = index === 0;
                const isLast = index === steps.length - 1;

                return (
                  <div
                    key={st.id || index}
                    className="p-5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 shadow-xs hover:border-emerald-500/60 transition-all space-y-4 relative"
                  >
                    {/* Step Card Top Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center space-x-3">
                        <span className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-black text-xs flex items-center justify-center font-mono">
                          {st.stepNumber}
                        </span>
                        <input
                          type="text"
                          value={st.title || ''}
                          onChange={(e) => handleUpdateStep(index, { title: e.target.value })}
                          placeholder={`Step ${st.stepNumber} Title`}
                          className="font-bold text-sm text-neutral-900 dark:text-white bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-emerald-500 px-1 py-0.5 focus:outline-hidden"
                        />
                      </div>

                      {/* Step Actions: Up, Down, Copy, Delete */}
                      <div className="flex items-center space-x-1 self-end sm:self-auto">
                        <button
                          type="button"
                          title="Move step up"
                          disabled={isFirst}
                          onClick={() => handleMoveUp(index)}
                          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Move step down"
                          disabled={isLast}
                          onClick={() => handleMoveDown(index)}
                          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Duplicate step"
                          onClick={() => handleDuplicateStep(index)}
                          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete step"
                          disabled={steps.length <= 1}
                          onClick={() => handleRemoveStep(index)}
                          className="p-1 rounded-lg text-rose-500 hover:text-rose-700 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Delay & Condition Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Delay Setting */}
                      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60">
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Delay Before Sending:</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="0"
                            value={st.delayValue ?? 0}
                            onChange={(e) => handleUpdateStep(index, { delayValue: Number(e.target.value) })}
                            className="w-20 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono font-bold"
                          />
                          <select
                            value={st.delayUnit || 'minutes'}
                            onChange={(e) => handleUpdateStep(index, { delayUnit: e.target.value as any })}
                            className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                        <p className="text-[10px] text-neutral-500 mt-1">
                          {isFirst && st.delayValue === 0
                            ? '⚡ Dispatches immediately when contact is enrolled'
                            : `Waits ${st.delayValue ?? 0} ${st.delayUnit || 'minutes'} after ${isFirst ? 'enrollment' : 'previous step'}`}
                        </p>
                      </div>

                      {/* Smart Condition Rule */}
                      <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60">
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center space-x-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                          <span>Dispatch Condition Rule:</span>
                        </label>
                        <select
                          value={st.condition || 'always'}
                          onChange={(e) => handleUpdateStep(index, { condition: e.target.value as any })}
                          className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold"
                        >
                          <option value="always">Always Send (Recommended - Dispatches after delay)</option>
                          <option value="if_not_replied">Stop / Skip if Customer Replied (Smart Reply Guard)</option>
                          <option value="if_read">Wait for Read Receipt (Blue Tick Gate)</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-1">
                          {st.condition === 'if_not_replied'
                            ? 'Protects marketing budget & avoids spamming contacts who already engaged.'
                            : st.condition === 'if_read'
                            ? 'Waits for contact to read previous message. (If contact disabled blue ticks, auto-releases after 1 hour).'
                            : 'Fires automatically once the scheduled delay elapses.'}
                        </p>
                      </div>
                    </div>

                    {/* Template Picker & Preview */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Select Approved WhatsApp Template:</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setTestingStepNum(testingStepNum === st.stepNumber ? null : st.stepNumber)}
                          className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center space-x-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>{testingStepNum === st.stepNumber ? 'Close Test Send' : 'Test Send Step'}</span>
                        </button>
                      </div>

                      <select
                        value={st.templateId || st.templateName || ''}
                        onChange={(e) => handleSelectTemplateForStep(index, e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- Choose WhatsApp Template --</option>
                        {templates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id || tpl.name}>
                            {tpl.name} ({tpl.language}) - [{tpl.category || 'MARKETING'}]
                          </option>
                        ))}
                      </select>

                      {/* Header Media, Dynamic Variables & Live Bubble Preview */}
                      {st.template && (() => {
                        const headerComp = st.template.components?.find((c: any) => String(c.type || '').toUpperCase() === 'HEADER');
                        const headerFormat = getTemplateHeaderFormat(st.template);
                        const bodyComp = st.template.components?.find((c: any) => String(c.type || '').toUpperCase() === 'BODY');
                        const footerComp = st.template.components?.find((c: any) => String(c.type || '').toUpperCase() === 'FOOTER');
                        const buttonComp = st.template.components?.find((c: any) => String(c.type || '').toUpperCase() === 'BUTTONS');
                        const stepVariables = getTemplateVariables(st.template);
                        const isUploadingThisStep = uploadingStepIndex === index;
                        const mediaMode = stepMediaModes[index] || 'url';

                        return (
                          <div className="space-y-3 pt-1">
                            {/* 1. Header Media Configuration (if template has Media Header) */}
                            {headerFormat && (
                              <div className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 space-y-3 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-1.5">
                                    {headerFormat === 'IMAGE' && <ImageIcon className="w-4 h-4 text-amber-600" />}
                                    {headerFormat === 'VIDEO' && <Video className="w-4 h-4 text-amber-600" />}
                                    {headerFormat === 'DOCUMENT' && <FileText className="w-4 h-4 text-amber-600" />}
                                    <span>Step Header Media ({headerFormat})</span>
                                  </label>
                                  <div className="flex items-center space-x-1 bg-white dark:bg-neutral-900 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[10px]">
                                    <button
                                      type="button"
                                      onClick={() => setStepMediaModes((prev) => ({ ...prev, [index]: 'url' }))}
                                      className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                                        mediaMode === 'url' ? 'bg-amber-500 text-white' : 'text-neutral-600 dark:text-neutral-400'
                                      }`}
                                    >
                                      Public URL
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setStepMediaModes((prev) => ({ ...prev, [index]: 'upload' }))}
                                      className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                                        mediaMode === 'upload' ? 'bg-amber-500 text-white' : 'text-neutral-600 dark:text-neutral-400'
                                      }`}
                                    >
                                      Upload Device
                                    </button>
                                  </div>
                                </div>

                                {mediaMode === 'url' ? (
                                  <div className="space-y-1">
                                    <input
                                      type="url"
                                      value={st.headerMediaUrl || ''}
                                      onChange={(e) => handleUpdateStep(index, { headerMediaUrl: e.target.value })}
                                      placeholder={`Enter direct public ${headerFormat.toLowerCase()} URL (https://...)`}
                                      className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono focus:ring-2 focus:ring-amber-500"
                                    />
                                    <p className="text-[10px] text-neutral-500">
                                      This media will be dispatched with Step {st.stepNumber} to all subscribers.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <input
                                      type="file"
                                      id={`step-file-${index}`}
                                      className="hidden"
                                      accept={
                                        headerFormat === 'IMAGE'
                                          ? 'image/jpeg,image/png,image/webp'
                                          : headerFormat === 'VIDEO'
                                          ? 'video/mp4,video/3gpp'
                                          : 'application/pdf,.pdf'
                                      }
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleStepMediaFileSelected(index, f);
                                      }}
                                    />
                                    <div className="flex items-center space-x-2">
                                      <button
                                        type="button"
                                        disabled={isUploadingThisStep}
                                        onClick={() => document.getElementById(`step-file-${index}`)?.click()}
                                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 hover:border-amber-400 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                                      >
                                        {isUploadingThisStep ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <UploadCloud className="w-3.5 h-3.5 text-amber-600" />
                                        )}
                                        <span>{isUploadingThisStep ? 'Uploading...' : `Upload ${headerFormat} File`}</span>
                                      </button>
                                      {st.headerMediaUrl && (
                                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold truncate max-w-xs">
                                          ✓ Attached: {st.headerMediaUrl.split('/').pop()?.split('?')[0] || 'Media'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Media Preview Box */}
                                {st.headerMediaUrl && (
                                  <div className="relative rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 max-h-36 bg-black/5 flex items-center justify-center">
                                    {headerFormat === 'IMAGE' ? (
                                      <img
                                        src={st.headerMediaUrl}
                                        alt="Step Header"
                                        className="w-full h-32 object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div className="py-4 text-center text-xs font-mono font-semibold text-neutral-600 dark:text-neutral-400 flex items-center space-x-2">
                                        {headerFormat === 'VIDEO' ? <Video className="w-5 h-5 text-amber-500" /> : <FileText className="w-5 h-5 text-red-500" />}
                                        <span>{st.headerMediaUrl}</span>
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateStep(index, { headerMediaUrl: '' })}
                                      className="absolute top-2 right-2 p-1 rounded-md bg-black/60 hover:bg-black text-white text-[10px] cursor-pointer"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 2. Dynamic Variable Inputs (if template has {{1}}, {{2}} etc.) */}
                            {stepVariables.length > 0 && (
                              <div className="p-3.5 rounded-2xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2.5 animate-fadeIn">
                                <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                                  <span className="flex items-center space-x-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Template Dynamic Variables ({stepVariables.length})</span>
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-normal">
                                    Personalized per subscriber
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {stepVariables.map((v) => {
                                    const curVal = st.variableValues?.[v.key] ?? '';
                                    const isNameVar = v.num === '1';

                                    return (
                                      <div key={v.key} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                          <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                            {v.label}
                                          </label>
                                          {isNameVar && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdateStep(index, {
                                                  variableValues: { ...(st.variableValues || {}), [v.key]: 'Customer' },
                                                })
                                              }
                                              className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                                            >
                                              Auto Contact Name
                                            </button>
                                          )}
                                        </div>

                                        <input
                                          type="text"
                                          value={curVal}
                                          onChange={(e) =>
                                            handleUpdateStep(index, {
                                              variableValues: { ...(st.variableValues || {}), [v.key]: e.target.value },
                                            })
                                          }
                                          placeholder={isNameVar ? 'Fallback name if contact has no name' : v.sample || `Value for {{${v.num}}}`}
                                          className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 3. Real-Time WhatsApp Message Preview Bubble */}
                            <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500">
                                <span className="flex items-center space-x-1">
                                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Live WhatsApp Bubble Preview:</span>
                                </span>
                                <span className="uppercase text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                  {st.template.status || 'APPROVED'}
                                </span>
                              </div>

                              {/* WhatsApp Bubble */}
                              <div className="max-w-md bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80 shadow-xs overflow-hidden">
                                {/* Header Media in Preview */}
                                {st.headerMediaUrl && headerFormat === 'IMAGE' && (
                                  <img
                                    src={st.headerMediaUrl}
                                    alt="Header"
                                    className="w-full h-32 object-cover border-b border-neutral-100 dark:border-neutral-800"
                                  />
                                )}
                                {st.headerMediaUrl && headerFormat === 'VIDEO' && (
                                  <div className="w-full h-24 bg-neutral-900 text-white flex items-center justify-center border-b border-neutral-800">
                                    <Video className="w-8 h-8 text-emerald-400" />
                                  </div>
                                )}
                                {st.headerMediaUrl && headerFormat === 'DOCUMENT' && (
                                  <div className="p-2.5 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 flex items-center space-x-2 text-xs">
                                    <FileText className="w-4 h-4 text-red-500" />
                                    <span className="font-semibold truncate">{st.headerMediaUrl.split('/').pop() || 'Document.pdf'}</span>
                                  </div>
                                )}

                                {/* Body Text with Variables Substituted */}
                                <div className="p-3 space-y-1.5">
                                  <p className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed">
                                    {renderPreviewText(bodyComp?.text, st.variableValues)}
                                  </p>

                                  {footerComp?.text && (
                                    <p className="text-[10px] text-neutral-400 pt-1">
                                      {footerComp.text}
                                    </p>
                                  )}
                                </div>

                                {/* Action Buttons if any */}
                                {buttonComp?.buttons && (
                                  <div className="border-t border-neutral-100 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
                                    {buttonComp.buttons.map((b: any, bIdx: number) => (
                                      <div key={bIdx} className="py-2 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        {b.text || 'Button'}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Test Send Input Box if opened for this step */}
                      {testingStepNum === st.stepNumber && (
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center space-x-2 animate-fadeIn">
                          <input
                            type="text"
                            value={testPhoneNumber || ''}
                            onChange={(e) => setTestPhoneNumber(e.target.value)}
                            placeholder="Enter phone with country code (e.g. +919876543210)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                          />
                          <button
                            type="button"
                            disabled={isSendingTest}
                            onClick={() => handleSendTestStep(index)}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                          >
                            {isSendingTest && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>Send Test Now</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            Total Steps: <strong className="text-neutral-900 dark:text-white">{steps.length}</strong> •
            Subscribers enter sequence and progress step-by-step automatically.
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit('paused')}
              className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-bold text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer"
            >
              Save as Paused
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit('active')}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs font-bold flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : '🚀 Launch Drip Campaign'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Blueprint Picker Modal */}
      <DripBlueprintsModal
        isOpen={blueprintsOpen}
        onClose={() => setBlueprintsOpen(false)}
        onSelectBlueprint={handleApplyBlueprint}
      />
    </div>
  );
};
