import React, { useState } from 'react';
import {
  X,
  Bot,
  Smartphone,
  Sparkles,
  CheckCircle2,
  Plus,
  Trash2,
  Tag,
  Layers,
} from 'lucide-react';
import type {
  BotFlow,
  BotStep,
  WhatsAppAccount,
  TriggerCondition,
  TriggerScope,
} from '../types/index.ts';

interface BotFlowEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (flow: BotFlow) => Promise<void>;
  initialFlow?: BotFlow | null;
  accounts: WhatsAppAccount[];
  onOpenCanvasAfterSave?: (flow: BotFlow) => void;
}

export const BotFlowEditorModal: React.FC<BotFlowEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialFlow,
  accounts,
  onOpenCanvasAfterSave,
}) => {
  const [name, setName] = useState(initialFlow?.name || '');
  const [description, setDescription] = useState(initialFlow?.description || '');
  const [phoneNumberId, setPhoneNumberId] = useState<string>(
    initialFlow?.phoneNumberId || (accounts[0]?.phoneNumberId || 'all')
  );

  // Trigger Condition (Matching Image 1)
  const [triggerCondition, setTriggerCondition] = useState<TriggerCondition>(
    initialFlow?.triggerCondition || 'exact'
  );

  // Trigger Scope (Matching Image 2)
  const [triggerScope, setTriggerScope] = useState<TriggerScope>(
    initialFlow?.triggerScope || 'individuals_only'
  );

  // Keywords list & input
  const [keywords, setKeywords] = useState<string[]>(initialFlow?.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddKeyword = () => {
    const val = keywordInput.trim();
    if (!val) return;
    if (!keywords.includes(val.toUpperCase())) {
      setKeywords([...keywords, val.toUpperCase()]);
    }
    setKeywordInput('');
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setKeywords(keywords.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent, openCanvas: boolean = false) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please provide a name for this Chatbot Flow (e.g. CATALOGUE).');
      return;
    }

    // If condition is anything_else, keywords are optional
    if (triggerCondition !== 'anything_else' && keywords.length === 0 && !keywordInput.trim()) {
      setError('Please enter and add at least one trigger keyword/phrase.');
      return;
    }

    const finalKeywords = [...keywords];
    if (keywordInput.trim() && !finalKeywords.includes(keywordInput.trim().toUpperCase())) {
      finalKeywords.push(keywordInput.trim().toUpperCase());
    }

    setSaving(true);
    try {
      const selectedAccount = accounts.find((a) => a.phoneNumberId === phoneNumberId);
      const flowId = initialFlow?.id || `flow_${Date.now()}`;

      // Clean starter steps for the flow (editable visually on the Node Canvas!)
      const defaultSteps: BotStep[] =
        initialFlow?.steps && initialFlow.steps.length > 0
          ? initialFlow.steps
          : [
              {
                id: 'step_1',
                title: 'Step 1: Greeting & Options',
                type: 'interactive_button',
                headerType: 'none',
                body: 'Welcome! How can we assist you today?',
                footer: '',
                buttons: [
                  { id: 'btn_1', title: 'Option 1', action: 'next_step' },
                ],
              },
            ];

      const flowPayload: BotFlow = {
        id: flowId,
        name: cleanName,
        description: description.trim() || undefined,
        phoneNumberId: phoneNumberId === 'all' ? undefined : phoneNumberId,
        displayPhoneNumber: selectedAccount?.displayPhoneNumber || 'All Numbers',
        triggerType: 'keyword',
        triggerCondition,
        triggerScope,
        keywords: finalKeywords,
        initialStepId: initialFlow?.initialStepId || 'step_1',
        steps: defaultSteps,
        enabled: initialFlow?.enabled ?? true,
        isFinal: initialFlow?.isFinal,
        version: initialFlow?.version,
        createdAt: initialFlow?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSave(flowPayload);
      onClose();

      if (openCanvas && onOpenCanvasAfterSave) {
        onOpenCanvasAfterSave(flowPayload);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save Chatbot Flow');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                {initialFlow ? 'Edit Chatbot Flow' : 'Create WhatsApp Chatbot Flow'}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Configure trigger conditions, scope, and connected WhatsApp number.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Flow Name */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-800 dark:text-neutral-200">
              Flow Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CATALOGUE or Sales Inquiry"
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Connected WhatsApp Number */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Connected WhatsApp Number</span>
            </label>
            <select
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium cursor-pointer"
            >
              <option value="all">🌐 All Connected Numbers</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.phoneNumberId}>
                  📱 {acc.displayPhoneNumber} ({acc.verifiedName})
                </option>
              ))}
            </select>
          </div>

          {/* TRIGGER SCOPE (Image 2) */}
          <div className="space-y-1.5">
            <label className="font-semibold text-neutral-800 dark:text-neutral-200">
              Trigger Scope
            </label>
            <select
              value={triggerScope}
              onChange={(e) => setTriggerScope(e.target.value as TriggerScope)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium cursor-pointer"
            >
              <option value="individuals_only">Individuals Only</option>
              <option value="all">All Messages</option>
            </select>
          </div>

          {/* TRIGGER CONDITION (Image 1) */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800">
            <div className="space-y-1.5">
              <label className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1">
                <span className="text-neutral-500">If</span>
                <span className="font-bold">Condition</span>
              </label>
              <select
                value={triggerCondition}
                onChange={(e) => setTriggerCondition(e.target.value as TriggerCondition)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium cursor-pointer"
              >
                <option value="contains">Message contains</option>
                <option value="exact">Message is</option>
                <option value="whole_word">Message contains whole word</option>
                <option value="begins_with">Message begin's with</option>
                <option value="ends_with">Message end's with</option>
                <option value="anything_else">Anything else</option>
              </select>
            </div>

            {/* Keyword Input with + Add Button (Image 1) */}
            {triggerCondition !== 'anything_else' && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="e.g. CATALOGUE or HI"
                    className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white uppercase font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="px-3.5 py-2 rounded-xl border border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold text-xs flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Chips of added keywords */}
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {keywords.map((kw, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-semibold"
                      >
                        <span>{kw}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(idx)}
                          className="hover:text-rose-500 cursor-pointer ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                disabled={saving}
                onClick={(e) => handleSubmit(e, true)}
                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                title="Save and directly open the Visual Node Canvas"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Save &amp; Node Canvas ➔</span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Bot Flow'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
