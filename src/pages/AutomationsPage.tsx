import React, { useEffect, useState } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  UserCheck,
  CheckCircle2,
  X,
  Smartphone,
  Sparkles,
  Play,
  RotateCcw,
  ExternalLink,
  Phone,
  Layers,
  ArrowRight,
  Copy,
  Edit3,
  Sliders,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeAutomations,
  addAutomation,
  toggleAutomation,
  deleteAutomation,
  subscribeBotFlows,
  saveBotFlow,
  toggleBotFlow,
  deleteBotFlow,
} from '../lib/services.ts';
import { BotFlowSimulator } from '../components/BotFlowSimulator.tsx';
import { BotFlowEditorModal } from '../components/BotFlowEditorModal.tsx';
import { VisualNodeFlowCanvas } from '../components/VisualNodeFlowCanvas.tsx';
import type { Automation, BotFlow, BotStep } from '../types/index.ts';

export const AutomationsPage: React.FC = () => {
  const { organization } = useAuth();
  const { accounts, activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  // Top tabs: only clean Interactive Bot Flows and simple Keyword Auto-Replies
  const [activeTab, setActiveTab] = useState<'flows' | 'rules'>('flows');
  const [botFlows, setBotFlows] = useState<BotFlow[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter flows by WhatsApp Account
  const [accountFilter, setAccountFilter] = useState<string>('all');

  // Dedicated Visual Node Canvas Modal (Opens when user clicks "Node Canvas" on a flow)
  const [canvasModalFlow, setCanvasModalFlow] = useState<BotFlow | null>(null);

  // Dedicated Live Phone Simulator Modal (Opens when user clicks "Test in Phone" on a flow)
  const [testingPhoneFlow, setTestingPhoneFlow] = useState<BotFlow | null>(null);

  // Flow Editor Modal (Blank fresh for new flow or editing existing)
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<BotFlow | null>(null);

  // Delete Flow Confirmation State (Prevents iframe alert/confirm issues)
  const [flowToDelete, setFlowToDelete] = useState<BotFlow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick Rule Modal (Legacy/Simple rules)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleTriggerType, setRuleTriggerType] = useState<'keyword_exact' | 'keyword_contains' | 'welcome' | 'fallback'>('keyword_exact');
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleResponseType, setRuleResponseType] = useState<'text' | 'image' | 'document' | 'assign_agent'>('text');
  const [ruleResponseContent, setRuleResponseContent] = useState('');
  const [ruleMediaUrl, setRuleMediaUrl] = useState('');
  const [ruleMediaName, setRuleMediaName] = useState('');

  // 1. Subscribe to Bot Flows (NO auto-seed on empty, so deleted flows STAY deleted!)
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeBotFlows(
      organization.id,
      (data) => {
        setBotFlows(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [organization?.id]);

  // 2. Subscribe to Simple Automations
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeAutomations(
      organization.id,
      (data) => setAutomations(data),
      () => {}
    );
    return () => unsub();
  }, [organization?.id]);

  // Save Bot Flow
  const handleSaveBotFlow = async (flow: BotFlow) => {
    if (!organization?.id) return;
    await saveBotFlow(organization.id, flow);
    // If updating currently opened canvas, keep state in sync
    if (canvasModalFlow?.id === flow.id) {
      setCanvasModalFlow(flow);
    }
    toast.showSuccess('Chatbot Flow Deployed', `Flow "${flow.name}" saved and active.`);
  };

  // Toggle Flow Active/Paused
  const handleToggleFlow = async (flow: BotFlow) => {
    if (!organization?.id) return;
    // Optimistic toggle
    setBotFlows((prev) =>
      prev.map((f) => (f.id === flow.id ? { ...f, enabled: !f.enabled } : f))
    );
    await toggleBotFlow(organization.id, flow.id, !flow.enabled);
    toast.showSuccess(
      flow.enabled ? 'Flow Paused' : 'Flow Activated',
      `Flow "${flow.name}" is now ${!flow.enabled ? 'active & listening' : 'temporarily paused'}.`
    );
  };

  // Real Delete with In-UI Confirmation
  const confirmDeleteAction = async () => {
    if (!organization?.id || !flowToDelete) return;
    const targetId = flowToDelete.id;
    const targetName = flowToDelete.name;

    setDeleting(true);
    // 1. Optimistic removal from UI immediately
    setBotFlows((prev) => prev.filter((f) => f.id !== targetId));
    setFlowToDelete(null);

    try {
      // 2. Remove permanently from Firestore
      await deleteBotFlow(organization.id, targetId);
      toast.showSuccess('Flow Deleted', `"${targetName}" was permanently removed.`);
    } catch (err: any) {
      toast.showError('Delete Failed', err);
    } finally {
      setDeleting(false);
    }
  };

  // Simple Rule handler
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    await addAutomation(organization.id, {
      trigger: ruleTriggerType === 'keyword_exact' ? `Exact match: ${ruleKeyword}` : ruleTriggerType,
      triggerType: ruleTriggerType,
      keyword: ruleKeyword.trim().toUpperCase(),
      responseType: ruleResponseType,
      responseContent: ruleResponseContent.trim(),
      mediaUrl: ruleMediaUrl.trim() || undefined,
      mediaName: ruleMediaName.trim() || undefined,
      enabled: true,
    });

    setIsRuleModalOpen(false);
    setRuleKeyword('');
    setRuleResponseContent('');
    setRuleMediaUrl('');
    setRuleMediaName('');
    toast.showSuccess('Rule Created', 'Quick keyword reply rule added.');
  };

  // Filtered flows
  const displayedFlows = botFlows.filter((f) => {
    if (accountFilter === 'all') return true;
    return f.phoneNumberId === accountFilter || !f.phoneNumberId;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
              <span>WhatsApp Chatbot Flows &amp; Automations</span>
              <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Official Cloud API
              </span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Interactive Buttons &bull; Multi-Step Menus &bull; PDF Catalogs &bull; Dedicated Per-Number Routing
            </p>
          </div>
        </div>

        {/* Action Button: Create Completely Blank/Fresh Bot Flow */}
        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto">
          <button
            onClick={() => {
              setEditingFlow(null);
              setIsEditorOpen(true);
            }}
            className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Bot Flow</span>
          </button>
        </div>
      </div>

      {/* Main Clean Tab Navigation (Only Interactive Bot Flows & Simple Keyword Replies) */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 space-x-2 sm:space-x-6 text-xs sm:text-sm">
        <button
          onClick={() => setActiveTab('flows')}
          className={`pb-3 border-b-2 font-medium flex items-center space-x-2 cursor-pointer transition-colors ${
            activeTab === 'flows'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Interactive Bot Flows ({botFlows.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 border-b-2 font-medium flex items-center space-x-2 cursor-pointer transition-colors ${
            activeTab === 'rules'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Keyword Auto-Replies ({automations.length})</span>
        </button>
      </div>

      {/* TAB 1: INTERACTIVE BOT FLOWS LIST */}
      {activeTab === 'flows' && (
        <div className="space-y-4">
          {/* Account Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center space-x-2 text-xs">
              <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                Filter by WhatsApp Number:
              </span>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs font-medium cursor-pointer"
              >
                <option value="all">🌐 All Numbers</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.phoneNumberId}>
                    📱 {acc.displayPhoneNumber} ({acc.verifiedName})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-neutral-500">
              Each connected number can run its own independent bot flow or share default flows.
            </p>
          </div>

          {/* Flows Grid */}
          {displayedFlows.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
                <Bot className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  No Chatbot Flows Found
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Click "+ Create Bot Flow" to build a brand new, clean WhatsApp interactive bot from scratch.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingFlow(null);
                  setIsEditorOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer inline-flex items-center space-x-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Blank Bot Flow</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedFlows.map((flow) => (
                <div
                  key={flow.id}
                  className="p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Flow Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2">
                          <span>{flow.name}</span>
                          {flow.enabled ? (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-[10px] bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5 rounded-full font-bold">
                              PAUSED
                            </span>
                          )}
                        </h4>
                        {flow.description && (
                          <p className="text-xs text-neutral-500 line-clamp-2">{flow.description}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleFlow(flow)}
                        className="cursor-pointer text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        title={flow.enabled ? 'Pause Flow' : 'Activate Flow'}
                      >
                        {flow.enabled ? (
                          <ToggleRight className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-7 h-7 text-neutral-400" />
                        )}
                      </button>
                    </div>

                    {/* Meta Target Number Badge */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center space-x-1">
                        <Smartphone className="w-3 h-3 text-emerald-600" />
                        <span>{flow.displayPhoneNumber || 'All Numbers'}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold">
                        {flow.steps?.length || 0} Steps Pipeline
                      </span>
                    </div>

                    {/* Keywords Chips */}
                    {flow.keywords && flow.keywords.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-neutral-400 uppercase font-semibold">
                          Trigger Keywords:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {flow.keywords.map((kw, kIdx) => (
                            <span
                              key={kIdx}
                              className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-mono text-[10px] border border-neutral-200/60 dark:border-neutral-700"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step Visual Preview Pill */}
                    {flow.steps && flow.steps.length > 0 && (
                      <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                        <p className="text-[10px] text-neutral-500 font-medium">Flow Execution Steps:</p>
                        <div className="flex items-center space-x-1.5 overflow-x-auto text-[11px] text-neutral-700 dark:text-neutral-300">
                          {flow.steps.map((st, sIdx) => (
                            <React.Fragment key={st.id || sIdx}>
                              <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shrink-0 font-medium">
                                {st.type === 'interactive_button'
                                  ? '🔘 Buttons'
                                  : st.type === 'media'
                                  ? '📄 Media'
                                  : st.type === 'agent_transfer'
                                  ? '👤 Agent'
                                  : '💬 Text'}
                              </span>
                              {sIdx < flow.steps.length - 1 && (
                                <ArrowRight className="w-3 h-3 text-neutral-400 shrink-0" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      {/* Node Canvas Button: Opens exact visual canvas for THIS bot */}
                      <button
                        type="button"
                        onClick={() => setCanvasModalFlow(flow)}
                        className="px-3 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                        title="Open Visual Node Canvas with connecting wires"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                        <span>🎨 Node Canvas</span>
                      </button>

                      {/* Test in Phone: Opens exact phone preview for THIS bot */}
                      <button
                        type="button"
                        onClick={() => setTestingPhoneFlow(flow)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                        title="Test this specific bot in WhatsApp phone preview"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Test in Phone</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Edit Flow Details */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFlow(flow);
                          setIsEditorOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Edit Flow Steps"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {/* Delete Flow (Opens Clean In-UI Confirmation) */}
                      <button
                        type="button"
                        onClick={() => setFlowToDelete(flow)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete this Bot Flow"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SIMPLE KEYWORD AUTO-REPLIES */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              Simple instant 1-step auto-replies for quick automated answers to specific words.
            </p>
            <button
              onClick={() => setIsRuleModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Keyword Rule</span>
            </button>
          </div>

          {automations.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-400">
              No keyword auto-replies yet. Click "+ Add Keyword Rule" to create one.
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 uppercase text-[10px] font-semibold">
                    <th className="py-3 px-4">Trigger</th>
                    <th className="py-3 px-4">Keyword</th>
                    <th className="py-3 px-4">Response Type</th>
                    <th className="py-3 px-4">Content</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {automations.map((auto) => (
                    <tr key={auto.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                      <td className="py-3 px-4 font-medium capitalize">{auto.triggerType}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                        {auto.keyword || '-'}
                      </td>
                      <td className="py-3 px-4 capitalize">{auto.responseType}</td>
                      <td className="py-3 px-4 max-w-xs truncate text-neutral-600 dark:text-neutral-400">
                        {auto.responseContent}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            auto.enabled
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'
                          }`}
                        >
                          {auto.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => toggleAutomation(organization!.id, auto.id, !auto.enabled)}
                          className="text-neutral-400 hover:text-neutral-600 cursor-pointer text-xs"
                        >
                          {auto.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          onClick={() => deleteAutomation(organization!.id, auto.id)}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FULL-SCREEN VISUAL NODE CANVAS MODAL (Exact match to Reference Image) */}
      {canvasModalFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="w-full h-full max-w-[98vw] max-h-[96vh] rounded-3xl overflow-hidden shadow-2xl relative flex flex-col">
            <VisualNodeFlowCanvas
              initialFlow={canvasModalFlow}
              onSaveFlow={handleSaveBotFlow}
              onTestInSimulator={(flow) => {
                setTestingPhoneFlow(flow);
              }}
              onClose={() => setCanvasModalFlow(null)}
            />
          </div>
        </div>
      )}

      {/* LIVE WHATSAPP PHONE SIMULATOR MODAL (Exact Bot Preview & Pipeline View) */}
      {testingPhoneFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-5xl w-full max-h-[94vh] overflow-y-auto relative flex flex-col">
            {/* Header */}
            <div className="w-full flex items-center justify-between pb-3.5 border-b border-neutral-200 dark:border-neutral-800 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2">
                    <span>Testing Bot Flow: {testingPhoneFlow.name}</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      {testingPhoneFlow.steps?.length || 0} Steps Pipeline
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Interactive simulation displaying both the step branching pipeline and the live WhatsApp phone screen.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTestingPhoneFlow(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Exact Simulator for this flow with side-by-side Pipeline */}
            <BotFlowSimulator
              key={testingPhoneFlow.id}
              flow={testingPhoneFlow}
              businessName={activeAccount?.verifiedName || 'CloudWABA Business'}
              displayPhoneNumber={activeAccount?.displayPhoneNumber || '+91 9974428034'}
            />
          </div>
        </div>
      )}

      {/* NEW & EDIT BOT FLOW MODAL (Completely Blank Fresh for New Flows) */}
      {isEditorOpen && (
        <BotFlowEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSaveBotFlow}
          initialFlow={editingFlow}
          accounts={accounts}
          onOpenCanvasAfterSave={(flow) => setCanvasModalFlow(flow)}
        />
      )}

      {/* DELETE FLOW CONFIRMATION DIALOG (Guaranteed delete without iframe issues) */}
      {flowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Delete Chatbot Flow?
              </h3>
              <p className="text-neutral-500 leading-relaxed">
                Are you sure you want to permanently delete <strong>"{flowToDelete.name}"</strong>? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setFlowToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteAction}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors cursor-pointer shadow-xs"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIMPLE KEYWORD RULE MODAL */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-sm">Add Keyword Auto-Reply</h3>
              <button onClick={() => setIsRuleModalOpen(false)}>
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold">Trigger Keyword</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PRICE or ADDRESS"
                  value={ruleKeyword}
                  onChange={(e) => setRuleKeyword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 uppercase font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold">Reply Message</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Type auto-reply text..."
                  value={ruleResponseContent}
                  onChange={(e) => setRuleResponseContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 rounded-xl border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium cursor-pointer"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
