import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Smartphone,
  User,
  Tag,
  Clock,
  AlertCircle,
  FileText,
  X,
  ExternalLink,
  Sparkles,
  Bot,
  Play,
  RotateCcw,
  Edit2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeConversations,
  subscribeMessages,
  subscribeTemplates,
  sendOutboundMessage,
  simulateIncomingCustomerMessageAndRunBot,
  handleInboxButtonClick,
  updateConversationContactName,
} from '../lib/services.ts';
import type { Conversation, Message, Template, BotButton } from '../types/index.ts';

export const InboxPage: React.FC = () => {
  const { organization, userProfile } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [search, setSearch] = useState('');
  const [inputText, setInputText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Template Picker Modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Simulator / Test Customer Message Modal
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simPhone, setSimPhone] = useState('+919974428034');
  const [simName, setSimName] = useState('Customer');
  const [simMessageText, setSimMessageText] = useState('CATALOGUE');
  const [simulating, setSimulating] = useState(false);

  // Inline Contact Name Editing State
  const [isEditingContactName, setIsEditingContactName] = useState(false);
  const [editedName, setEditedName] = useState('');

  const handleStartEditName = () => {
    if (selectedConv) {
      setEditedName(selectedConv.contactName || selectedConv.contactPhone);
      setIsEditingContactName(true);
    }
  };

  const handleSaveContactName = async () => {
    if (!organization?.id || !selectedConv) return;
    const newName = editedName.trim() || selectedConv.contactPhone;
    try {
      await updateConversationContactName(
        organization.id,
        selectedConv.id,
        selectedConv.contactPhone,
        newName
      );
      setSelectedConv((prev) => (prev ? { ...prev, contactName: newName } : null));
      toast.showSuccess('Contact Name Updated', `Contact renamed to "${newName}".`);
    } catch (err: any) {
      toast.showError('Failed to rename contact', err);
    } finally {
      setIsEditingContactName(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to conversations
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeConversations(
      organization.id,
      (data) => {
        setConversations(data);
        if (!selectedConv && data.length > 0) {
          setSelectedConv(data[0]);
        } else if (selectedConv) {
          // Keep active conversation selection in sync
          const updated = data.find((c) => c.id === selectedConv.id);
          if (updated) setSelectedConv(updated);
        }
      },
      () => {}
    );
    return () => unsub();
  }, [organization?.id, selectedConv?.id]);

  // Subscribe to templates
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeTemplates(
      organization.id,
      (data) => setTemplates(data.filter((t) => t.status === 'APPROVED')),
      () => {}
    );
    return () => unsub();
  }, [organization?.id]);

  // Subscribe to messages of selected conversation
  useEffect(() => {
    if (!organization?.id || !selectedConv) {
      setMessages([]);
      return;
    }

    const unsub = subscribeMessages(
      organization.id,
      selectedConv.id,
      (data) => {
        setMessages(data);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      () => {}
    );

    return () => unsub();
  }, [organization?.id, selectedConv?.id]);

  // Outbound Manual Message Send
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !selectedConv) return;
    if (!inputText.trim() && !mediaUrl.trim()) return;

    setSending(true);
    setSendError(null);

    try {
      await sendOutboundMessage(organization.id, {
        phoneNumberId: activeAccount?.phoneNumberId || 'test_phone_id',
        accountId: activeAccount?.id || 'test_account',
        recipientPhone: selectedConv.contactPhone,
        contactName: selectedConv.contactName,
        body: inputText.trim(),
        type: mediaUrl.trim() ? 'image' : 'text',
        mediaUrl: mediaUrl.trim() || undefined,
        conversationId: selectedConv.id,
        contactId: selectedConv.contactId,
        customToken: activeAccount?.customToken,
      });

      setInputText('');
      setMediaUrl('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send WhatsApp message via Meta Cloud API.';
      setSendError(msg);
      toast.showError('Message Failed to Send', err);
    } finally {
      setSending(false);
    }
  };

  // Run Test Customer Message & Trigger Chatbot
  const handleTriggerSimulatedMessage = async (customText?: string) => {
    if (!organization?.id) return;
    const textToSend = customText || simMessageText;
    if (!textToSend.trim()) return;

    setSimulating(true);
    try {
      const result = await simulateIncomingCustomerMessageAndRunBot(organization.id, {
        senderPhone: simPhone,
        senderName: simName,
        messageText: textToSend.trim(),
        phoneNumberId: activeAccount?.phoneNumberId,
        accountId: activeAccount?.id,
        customToken: activeAccount?.customToken,
      });

      setIsSimulateModalOpen(false);

      if (result.matched) {
        toast.showSuccess(
          'Bot Triggered Successfully!',
          `Flow "${result.flowName}" answered with ${result.botStep?.title || 'response'}.`
        );
      } else {
        toast.showInfo(
          'Incoming Message Received',
          `Message "${textToSend}" arrived in Inbox. (No bot keyword matched)`
        );
      }
    } catch (err: any) {
      toast.showError('Failed to simulate message', err);
    } finally {
      setSimulating(false);
    }
  };

  // Interactive Button Click inside Inbox Message Bubble
  const handleButtonClick = async (button: BotButton) => {
    if (!organization?.id || !selectedConv) return;
    try {
      await handleInboxButtonClick(organization.id, {
        conversationId: selectedConv.id,
        contactPhone: selectedConv.contactPhone,
        contactName: selectedConv.contactName,
        button,
        accountId: activeAccount?.id,
      });
    } catch (err: any) {
      toast.showError('Button action failed', err);
    }
  };

  const handleSendTemplate = async (template: Template) => {
    if (!organization?.id || !selectedConv) return;

    setSending(true);
    setSendError(null);

    const bodyComp = template.components?.find((c) => c.type === 'BODY');
    const textPreview = bodyComp?.text || `[Template: ${template.name}]`;

    try {
      await sendOutboundMessage(organization.id, {
        phoneNumberId: activeAccount?.phoneNumberId || 'test_phone_id',
        accountId: activeAccount?.id || 'test_account',
        recipientPhone: selectedConv.contactPhone,
        contactName: selectedConv.contactName,
        body: textPreview,
        type: 'template',
        template: {
          name: template.name,
          language: template.language || 'en_US',
          components: template.components || [],
        },
        conversationId: selectedConv.id,
        contactId: selectedConv.contactId,
        customToken: activeAccount?.customToken,
      });

      toast.showSuccess('Template Dispatched', `Template "${template.name}" sent to ${selectedConv.contactName}.`);
      setIsTemplateModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error sending template message.';
      setSendError(msg);
      toast.showError('Template Send Failed', err);
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPhone.includes(search) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row overflow-hidden bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 animate-fadeIn">
      {/* Left Column: Conversation List */}
      <div className="w-full md:w-80 lg:w-96 border-r border-neutral-200 dark:border-neutral-800 flex flex-col shrink-0 bg-neutral-50/50 dark:bg-neutral-900/60">
        <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
          {/* Quick Simulation / Test Chatbot Button */}
          <button
            onClick={() => setIsSimulateModalOpen(true)}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>⚡ Test Chatbot (Simulate Customer)</span>
          </button>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search chat or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* List of Conversations */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/80">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-neutral-400 dark:text-neutral-500 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  No conversations yet
                </p>
                <p className="text-[11px] leading-relaxed text-neutral-500">
                  Target Number: <strong>{activeAccount?.displayPhoneNumber || '+1 555-169-2443'}</strong>
                </p>
              </div>

              {/* 1-Click Trigger Actions */}
              <div className="pt-2 space-y-1.5">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Click to test incoming message:
                </p>
                <button
                  onClick={() => handleTriggerSimulatedMessage('CATALOGUE')}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 font-semibold text-xs cursor-pointer flex items-center justify-between"
                >
                  <span>💬 Send "CATALOGUE"</span>
                  <span className="text-[10px] opacity-75">Triggers Bot ➔</span>
                </button>
                <button
                  onClick={() => handleTriggerSimulatedMessage('HI')}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 text-neutral-700 dark:text-neutral-300 font-semibold text-xs cursor-pointer flex items-center justify-between"
                >
                  <span>💬 Send "HI"</span>
                  <span className="text-[10px] opacity-75">Triggers Bot ➔</span>
                </button>
              </div>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConv?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConv(conv)}
                  className={`p-3.5 flex items-start space-x-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-600'
                      : 'hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0">
                    {conv.contactName ? conv.contactName.charAt(0).toUpperCase() : '#'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                        {conv.contactName}
                      </p>
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                      {conv.contactPhone}
                    </p>

                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate mt-1">
                      {conv.lastMessage}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Chat Window */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col h-full bg-[#efeae2] dark:bg-neutral-950 overflow-hidden">
          {/* Chat Header */}
          <div className="h-16 px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                {selectedConv.contactName ? selectedConv.contactName.charAt(0).toUpperCase() : '#'}
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  {isEditingContactName ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        autoFocus
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveContactName();
                          if (e.key === 'Escape') setIsEditingContactName(false);
                        }}
                        placeholder="Customer name..."
                        className="px-2 py-0.5 rounded-lg border border-emerald-500 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleSaveContactName}
                        className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                        title="Save Name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingContactName(false)}
                        className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <h3 className="font-semibold text-xs text-neutral-900 dark:text-white">
                        {selectedConv.contactName}
                      </h3>
                      <button
                        type="button"
                        onClick={handleStartEditName}
                        className="p-1 rounded-md text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        title="Click to rename contact"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                        WhatsApp Active
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] font-mono text-neutral-500">
                  {selectedConv.contactPhone} &bull; Number: {activeAccount?.displayPhoneNumber || 'Test Number'}
                </p>
              </div>
            </div>

            {/* Header Right Action */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsSimulateModalOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Simulate Customer Reply</span>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 dark:text-neutral-500 text-xs">
                No message history yet for this conversation thread.
              </div>
            ) : (
              messages.map((m) => {
                const isOutbound = m.direction === 'outbound';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-md p-3.5 rounded-2xl text-xs shadow-xs leading-relaxed ${
                        isOutbound
                          ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-neutral-900 dark:text-neutral-100 rounded-tr-none'
                          : 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-tl-none border border-neutral-200/50 dark:border-neutral-700/50'
                      }`}
                    >
                      {/* Header Text if present */}
                      {m.headerText && (
                        <p className="font-bold text-xs mb-1 text-emerald-900 dark:text-emerald-200">
                          {m.headerText}
                        </p>
                      )}

                      {/* PDF / Document Card */}
                      {m.mediaFileName && (
                        <div className="mb-2 p-2.5 rounded-xl bg-white/70 dark:bg-neutral-800/70 border border-black/10 dark:border-white/10 flex items-center justify-between space-x-2">
                          <div className="flex items-center space-x-2 truncate">
                            <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                            <div className="truncate">
                              <p className="font-bold truncate text-[11px]">{m.mediaFileName}</p>
                              <p className="text-[9px] text-neutral-500">PDF Document &bull; WhatsApp Media</p>
                            </div>
                          </div>
                          {m.mediaUrl && (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px] hover:underline shrink-0"
                            >
                              View PDF
                            </a>
                          )}
                        </div>
                      )}

                      {/* Image Preview */}
                      {m.mediaUrl && !m.mediaFileName && (
                        <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                          <img
                            src={m.mediaUrl}
                            alt="Media attachment"
                            className="max-h-48 w-full object-cover"
                          />
                        </div>
                      )}

                      {/* Body Message */}
                      <p className="whitespace-pre-wrap">{m.body}</p>

                      {/* Interactive Buttons (WhatsApp Quick Reply Buttons) */}
                      {m.buttons && m.buttons.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10 space-y-1.5">
                          {m.buttons.map((btn) => (
                            <button
                              key={btn.id}
                              onClick={() => handleButtonClick(btn)}
                              className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-emerald-800 dark:text-emerald-300 font-semibold text-center border border-black/10 dark:border-white/10 shadow-2xs transition-colors cursor-pointer text-xs"
                            >
                              {btn.title}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Timestamp & Delivery Ticks */}
                      <div className="flex items-center justify-end space-x-1 mt-1.5 text-[9px] text-neutral-500 dark:text-neutral-400">
                        <span>
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOutbound && (
                          <span>
                            {m.messageStatus === 'read' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                            ) : m.messageStatus === 'delivered' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-neutral-500" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-neutral-500" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error notice if message failed */}
          {sendError && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-950/80 border-t border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
              <span>{sendError}</span>
              <button onClick={() => setSendError(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Media URL Input Drawer (Optional) */}
          {mediaUrl && (
            <div className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs">
              <span className="truncate max-w-sm font-mono text-neutral-700 dark:text-neutral-300">
                Media: {mediaUrl}
              </span>
              <button onClick={() => setMediaUrl('')} className="text-neutral-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center space-x-2 shrink-0"
          >
            <button
              type="button"
              onClick={() => setIsTemplateModalOpen(true)}
              title="Send Approved WhatsApp Template"
              className="p-2 rounded-xl text-neutral-500 hover:text-emerald-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <FileText className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const url = window.prompt('Enter public image or document URL:');
                if (url) setMediaUrl(url);
              }}
              title="Attach Image/Document"
              className="p-2 rounded-xl text-neutral-500 hover:text-emerald-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <input
              type="text"
              placeholder="Type a message as agent..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />

            <button
              type="submit"
              disabled={sending || (!inputText.trim() && !mediaUrl.trim())}
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center p-8 bg-[#f0f2f5] dark:bg-neutral-950 text-neutral-400">
          <div className="text-center space-y-3 max-w-sm">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-base text-neutral-800 dark:text-neutral-200">
              Select or Start a Conversation
            </h3>
            <p className="text-xs text-neutral-500">
              Pick a customer chat from the left or click below to simulate an incoming customer message to test your chatbot.
            </p>
            <button
              onClick={() => setIsSimulateModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              ⚡ Test Chatbot with Test Customer
            </button>
          </div>
        </div>
      )}

      {/* SIMULATE INCOMING CUSTOMER MESSAGE MODAL */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3 border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                  Simulate WhatsApp Customer Message
                </h3>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-neutral-500 leading-relaxed">
              Send a test message as a WhatsApp customer to your connected test number (
              <strong>{activeAccount?.displayPhoneNumber || '+1 555-169-2443'}</strong>). Your active Chatbot Flow will automatically process and reply in real time!
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Customer Phone Number
                </label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                />
              </div>

              {/* Quick Triggers Pills */}
              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Quick Keyword Triggers
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['CATALOGUE', 'HI', 'MENU', 'PRICE'].map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => setSimMessageText(kw)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                        simMessageText === kw
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200'
                      }`}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Customer Message Body
                </label>
                <textarea
                  rows={2}
                  value={simMessageText}
                  onChange={(e) => setSimMessageText(e.target.value)}
                  placeholder="e.g. CATALOGUE"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={simulating || !simMessageText.trim()}
                onClick={() => handleTriggerSimulatedMessage()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{simulating ? 'Sending...' : 'Send as Customer & Run Bot'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE PICKER MODAL */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm">Send WhatsApp Template</h3>
              <button onClick={() => setIsTemplateModalOpen(false)}>
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">
                No approved templates found for this account.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleSendTemplate(tpl)}
                    className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-emerald-500 cursor-pointer text-xs"
                  >
                    <p className="font-bold text-neutral-900 dark:text-white">{tpl.name}</p>
                    <p className="text-neutral-500 text-[11px] truncate">
                      {tpl.components?.find((c) => c.type === 'BODY')?.text || tpl.category}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
