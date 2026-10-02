import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Send,
  RotateCcw,
  CheckCheck,
  ExternalLink,
  Phone,
  FileText,
  User,
  Sparkles,
  Bot,
  Image as ImageIcon,
  Play,
  Download,
  Layers,
  ArrowRight,
  GitBranch,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import type { BotFlow, BotStep } from '../types/index.ts';

interface BotFlowSimulatorProps {
  flow: BotFlow;
  businessName?: string;
  displayPhoneNumber?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  type: 'text' | 'interactive_button' | 'interactive_list' | 'media' | 'agent_transfer';
  body: string;
  headerType?: string;
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  buttons?: Array<{ id: string; title: string; action: string; targetStepId?: string; url?: string; phoneNumber?: string }>;
  listButtonText?: string;
  listSections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string; targetStepId?: string }> }>;
  mediaType?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  mediaFileName?: string;
  timestamp: string;
}

export const BotFlowSimulator: React.FC<BotFlowSimulatorProps> = ({
  flow,
  businessName = 'CloudWABA Business',
  displayPhoneNumber = '+91 9974428034',
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const firstStep = flow.steps.find((s) => s.id === flow.initialStepId) || flow.steps[0];
    if (!firstStep) return [];

    return [
      {
        id: `sim_${Date.now()}`,
        sender: 'bot',
        type: firstStep.type,
        body: firstStep.body,
        headerType: firstStep.headerType,
        headerText: firstStep.headerText,
        headerMediaUrl: firstStep.headerMediaUrl,
        footer: firstStep.footer,
        buttons: firstStep.buttons,
        listButtonText: firstStep.listButtonText,
        listSections: firstStep.listSections,
        mediaType: firstStep.mediaType,
        mediaUrl: firstStep.mediaUrl,
        mediaCaption: firstStep.mediaCaption,
        mediaFileName: firstStep.mediaFileName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [inputText, setInputText] = useState('');
  const [activeStepId, setActiveStepId] = useState<string>(flow.initialStepId || flow.steps[0]?.id || '');
  const [activeListMenu, setActiveListMenu] = useState<string | null>(null);

  const resetSimulator = () => {
    const firstStep = flow.steps.find((s) => s.id === flow.initialStepId) || flow.steps[0];
    const initialId = firstStep?.id || flow.initialStepId || '';
    setActiveStepId(initialId);
    setActiveListMenu(null);
    setInputText('');

    if (firstStep) {
      setMessages([
        {
          id: `sim_${Date.now()}`,
          sender: 'bot',
          type: firstStep.type,
          body: firstStep.body,
          headerType: firstStep.headerType,
          headerText: firstStep.headerText,
          headerMediaUrl: firstStep.headerMediaUrl,
          footer: firstStep.footer,
          buttons: firstStep.buttons,
          listButtonText: firstStep.listButtonText,
          listSections: firstStep.listSections,
          mediaType: firstStep.mediaType,
          mediaUrl: firstStep.mediaUrl,
          mediaCaption: firstStep.mediaCaption,
          mediaFileName: firstStep.mediaFileName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } else {
      setMessages([]);
    }
  };

  useEffect(() => {
    resetSimulator();
  }, [flow.id, flow.updatedAt, flow.steps]);

  const handleStepTransition = (targetStepId?: string, userLabel?: string) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Add user click/message to chat
    if (userLabel) {
      setMessages((prev) => [
        ...prev,
        {
          id: `usr_${Date.now()}`,
          sender: 'user',
          type: 'text',
          body: userLabel,
          timestamp: now,
        },
      ]);
    }

    if (!targetStepId) return;

    // 2. Find target step in pipeline
    const nextStep = flow.steps.find((s) => s.id === targetStepId);
    if (!nextStep) return;

    setActiveStepId(targetStepId);

    // 3. Bot responds after realistic delay
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_${Date.now()}`,
          sender: 'bot',
          type: nextStep.type,
          body: nextStep.body,
          headerType: nextStep.headerType,
          headerText: nextStep.headerText,
          headerMediaUrl: nextStep.headerMediaUrl,
          footer: nextStep.footer,
          buttons: nextStep.buttons,
          listButtonText: nextStep.listButtonText,
          listSections: nextStep.listSections,
          mediaType: nextStep.mediaType,
          mediaUrl: nextStep.mediaUrl,
          mediaCaption: nextStep.mediaCaption,
          mediaFileName: nextStep.mediaFileName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 450);
  };

  // Jump directly to test any step in the pipeline
  const handleJumpToStep = (step: BotStep) => {
    setActiveStepId(step.id);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: `sim_${Date.now()}`,
        sender: 'bot',
        type: step.type,
        body: step.body,
        headerType: step.headerType,
        headerText: step.headerText,
        headerMediaUrl: step.headerMediaUrl,
        footer: step.footer,
        buttons: step.buttons,
        listButtonText: step.listButtonText,
        listSections: step.listSections,
        mediaType: step.mediaType,
        mediaUrl: step.mediaUrl,
        mediaCaption: step.mediaCaption,
        mediaFileName: step.mediaFileName,
        timestamp: now,
      },
    ]);
  };

  const handleSendCustomText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const query = inputText.trim();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages((prev) => [
      ...prev,
      {
        id: `usr_${Date.now()}`,
        sender: 'user',
        type: 'text',
        body: query,
        timestamp: now,
      },
    ]);

    setInputText('');

    // Check if custom message matches any button label in current step
    const currentStep = flow.steps.find((s) => s.id === activeStepId);
    const matchedBtn = currentStep?.buttons?.find(
      (b) => b.title.trim().toLowerCase() === query.toLowerCase()
    );

    if (matchedBtn?.targetStepId) {
      handleStepTransition(matchedBtn.targetStepId);
    } else {
      // Default echo reply
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `sim_${Date.now()}`,
            sender: 'bot',
            type: 'text',
            body: `Thank you for your response: "${query}". Please tap one of the option buttons above to proceed.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }, 400);
    }
  };

  return (
    <div className="w-full flex flex-col lg:flex-row items-start justify-center gap-6 animate-fadeIn">
      {/* 1. LEFT COLUMN: CHATBOT PIPELINE & STEP ARCHITECTURE */}
      <div className="w-full lg:w-1/2 flex flex-col space-y-3.5 text-xs">
        {/* Pipeline Summary Bar */}
        <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                Chatbot Steps Pipeline ({flow.steps?.length || 0} Steps)
              </h4>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
              Meta WhatsApp Cloud API
            </span>
          </div>

          {/* Trigger Info */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1">
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center space-x-1">
              <span className="text-neutral-400">Trigger:</span>
              <strong className="text-neutral-800 dark:text-white uppercase font-mono">
                {flow.triggerCondition === 'exact'
                  ? 'Message is'
                  : flow.triggerCondition === 'contains'
                  ? 'Message contains'
                  : flow.triggerCondition || 'Keyword'}
              </strong>
            </span>

            {flow.keywords && flow.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flow.keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[10px]"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Sequence Cards List */}
        <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
          {flow.steps?.map((step, idx) => {
            const isActive = activeStepId === step.id;
            return (
              <div
                key={step.id || idx}
                className={`p-3.5 rounded-2xl border transition-all duration-200 relative ${
                  isActive
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                {/* Step Header */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <h5 className="font-bold text-xs text-neutral-900 dark:text-white flex items-center space-x-1.5">
                        <span>{step.title || `Step ${idx + 1}`}</span>
                        {isActive && (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider animate-pulse">
                            ACTIVE ON PHONE
                          </span>
                        )}
                      </h5>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {/* Step Type Badge */}
                    <span className="px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[10px] font-semibold">
                      {step.type === 'interactive_button'
                        ? '🔘 Buttons'
                        : step.type === 'media'
                        ? '📄 PDF/Media'
                        : step.type === 'agent_transfer'
                        ? '👤 Agent'
                        : '💬 Message'}
                    </span>

                    {/* Test This Step Button */}
                    <button
                      type="button"
                      onClick={() => handleJumpToStep(step)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : 'border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                      title="Simulate this specific step in the phone right now"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{isActive ? 'Current' : 'Test Step'}</span>
                    </button>
                  </div>
                </div>

                {/* Step Body Preview */}
                {step.body && (
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-2 bg-neutral-50 dark:bg-neutral-800/40 p-2 rounded-xl border border-neutral-100 dark:border-neutral-800 font-sans">
                    {step.body}
                  </p>
                )}

                {/* Media Attachment Info */}
                {step.mediaFileName && (
                  <div className="mt-1.5 flex items-center space-x-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Attached Document: {step.mediaFileName}</span>
                  </div>
                )}

                {/* Buttons Branching Links */}
                {step.buttons && step.buttons.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80 space-y-1">
                    <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                      Branching Actions:
                    </p>
                    <div className="space-y-1">
                      {step.buttons.map((btn, bIdx) => {
                        const targetStep = flow.steps.find((s) => s.id === btn.targetStepId);
                        return (
                          <div
                            key={btn.id || bIdx}
                            className="flex items-center justify-between p-1.5 rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 text-[11px]"
                          >
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1">
                              <span>🔘 {btn.title}</span>
                            </span>

                            <div className="flex items-center space-x-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                              <ArrowRight className="w-3 h-3 text-neutral-400" />
                              <span>
                                {targetStep ? `Next: ${targetStep.title}` : btn.action === 'assign_agent' ? 'Talk to Agent' : 'End of Flow'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. RIGHT COLUMN: INTERACTIVE WHATSAPP PHONE MOCKUP */}
      <div className="w-full lg:w-auto flex flex-col items-center shrink-0">
        <div className="w-full max-w-[340px] sm:max-w-[360px] h-[640px] bg-neutral-900 rounded-[44px] p-3 shadow-2xl border-4 border-neutral-700/80 flex flex-col relative overflow-hidden">
          {/* Phone Speaker Notch */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-neutral-800 rounded-full z-20 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-neutral-900 border border-neutral-700 ml-auto mr-3" />
          </div>

          {/* WhatsApp App Screen Container */}
          <div className="w-full h-full bg-[#EFEAE2] dark:bg-[#0b141a] rounded-[36px] overflow-hidden flex flex-col relative text-neutral-800 dark:text-neutral-100">
            {/* WhatsApp Header */}
            <div className="bg-[#008069] dark:bg-[#202c33] text-white px-4 pt-7 pb-2.5 flex items-center justify-between shrink-0 shadow-xs z-10">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-bold text-xs">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold leading-tight line-clamp-1">{businessName}</h4>
                  <div className="flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[10px] text-emerald-100">{displayPhoneNumber}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={resetSimulator}
                title="Restart Bot Simulation"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/90 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Active Flow Pipeline Badge */}
            <div className="bg-emerald-700 text-white text-[10px] py-1 px-3 flex items-center justify-between">
              <span className="font-semibold line-clamp-1">Flow: {flow.name}</span>
              <span className="opacity-80">Interactive Preview</span>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[radial-gradient(#d1d5db_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:16px_16px]">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-fadeIn`}
                >
                  {/* User Message Bubble */}
                  {msg.sender === 'user' ? (
                    <div className="max-w-[80%] rounded-2xl rounded-tr-xs bg-[#D9FDD3] dark:bg-[#005c4b] text-neutral-900 dark:text-white px-3 py-1.5 text-xs shadow-xs">
                      <p className="leading-relaxed">{msg.body}</p>
                      <div className="flex items-center justify-end space-x-1 mt-0.5 text-[9px] text-neutral-500 dark:text-neutral-300">
                        <span>{msg.timestamp}</span>
                        <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                  ) : (
                    /* Bot Message Bubble */
                    <div className="max-w-[88%] w-full rounded-2xl rounded-tl-xs bg-white dark:bg-[#202c33] text-neutral-900 dark:text-white shadow-xs border border-neutral-200/60 dark:border-neutral-700/60 overflow-hidden text-xs">
                      {/* Header: Text or Media */}
                      {msg.headerType === 'text' && msg.headerText && (
                        <div className="px-3 pt-2.5 font-bold text-xs text-neutral-900 dark:text-white">
                          {msg.headerText}
                        </div>
                      )}

                      {msg.headerType === 'image' && msg.headerMediaUrl && (
                        <div className="w-full h-36 bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                          <img
                            src={msg.headerMediaUrl}
                            alt="Bot Header"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}

                      {/* Dedicated Media Step View (PDF Document) */}
                      {msg.type === 'media' && msg.mediaUrl && (
                        <div className="p-2 space-y-2">
                          {msg.mediaType === 'image' ? (
                            <div className="rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 max-h-40">
                              <img
                                src={msg.mediaUrl}
                                alt="Media Content"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-xs truncate">
                                  {msg.mediaFileName || 'Digital_Catalog.pdf'}
                                </p>
                                <p className="text-[10px] text-neutral-500">Official WhatsApp PDF</p>
                              </div>
                              <Download className="w-4 h-4 text-neutral-400" />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Body Text */}
                      {msg.body && (
                        <div className="px-3 py-2 text-xs leading-relaxed whitespace-pre-line text-neutral-800 dark:text-neutral-200">
                          {msg.body}
                        </div>
                      )}

                      {/* Footer Text */}
                      {msg.footer && (
                        <div className="px-3 pb-1 text-[10px] text-neutral-400 dark:text-neutral-500 italic">
                          {msg.footer}
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="px-3 pb-1.5 text-right text-[9px] text-neutral-400">
                        {msg.timestamp}
                      </div>

                      {/* Meta Quick Reply Buttons */}
                      {msg.buttons && msg.buttons.length > 0 && (
                        <div className="border-t border-neutral-100 dark:border-neutral-700/80 divide-y divide-neutral-100 dark:divide-neutral-700/80 bg-neutral-50/50 dark:bg-neutral-800/40">
                          {msg.buttons.map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => {
                                if (btn.action === 'url' && btn.url) {
                                  window.open(btn.url, '_blank');
                                } else {
                                  handleStepTransition(btn.targetStepId, btn.title);
                                }
                              }}
                              className="w-full py-2 px-3 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                            >
                              <span>{btn.title}</span>
                              {btn.action === 'url' && <ExternalLink className="w-3 h-3 opacity-60" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={handleSendCustomText}
              className="p-2 bg-white dark:bg-[#202c33] border-t border-neutral-200 dark:border-neutral-800 flex items-center space-x-1.5 shrink-0"
            >
              <input
                type="text"
                placeholder="Type a message or tap button..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-xs focus:outline-hidden"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="w-8 h-8 rounded-full bg-[#008069] disabled:opacity-40 text-white flex items-center justify-center transition-opacity cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
