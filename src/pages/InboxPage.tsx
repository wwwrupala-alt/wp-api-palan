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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeConversations,
  subscribeMessages,
  subscribeTemplates,
  sendOutboundMessage,
} from '../lib/services.ts';
import type { Conversation, Message, Template } from '../types/index.ts';

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
        }
      },
      () => {}
    );
    return () => unsub();
  }, [organization?.id]);

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !activeAccount || !selectedConv) return;
    if (!inputText.trim() && !mediaUrl.trim()) return;

    setSending(true);
    setSendError(null);

    try {
      await sendOutboundMessage(organization.id, {
        phoneNumberId: activeAccount.phoneNumberId,
        accountId: activeAccount.id,
        recipientPhone: selectedConv.contactPhone,
        contactName: selectedConv.contactName,
        body: inputText.trim(),
        type: mediaUrl.trim() ? 'image' : 'text',
        mediaUrl: mediaUrl.trim() || undefined,
        conversationId: selectedConv.id,
        contactId: selectedConv.contactId,
        customToken: activeAccount.customToken,
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

  const handleSendTemplate = async (template: Template) => {
    if (!organization?.id || !activeAccount || !selectedConv) return;

    setSending(true);
    setSendError(null);

    const bodyComp = template.components?.find((c) => c.type === 'BODY');
    const textPreview = bodyComp?.text || `[Template: ${template.name}]`;

    try {
      await sendOutboundMessage(organization.id, {
        phoneNumberId: activeAccount.phoneNumberId,
        accountId: activeAccount.id,
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
        customToken: activeAccount.customToken,
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
            <div className="p-8 text-center text-neutral-400 dark:text-neutral-500 space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-xs font-semibold">No conversations yet.</p>
              <p className="text-[11px] leading-relaxed">
                Incoming messages from your WhatsApp Business Number will appear here in real time.
              </p>
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
                <h3 className="font-semibold text-xs text-neutral-900 dark:text-white">
                  {selectedConv.contactName}
                </h3>
                <p className="text-[11px] font-mono text-neutral-500">
                  {selectedConv.contactPhone} &bull; WhatsApp Cloud API
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold uppercase">
                {selectedConv.status}
              </span>
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
                      className={`max-w-md p-3 rounded-2xl text-xs shadow-2xs leading-relaxed ${
                        isOutbound
                          ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-neutral-900 dark:text-neutral-100 rounded-tr-none'
                          : 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-tl-none border border-neutral-200/50 dark:border-neutral-700/50'
                      }`}
                    >
                      {m.mediaUrl && (
                        <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                          <img
                            src={m.mediaUrl}
                            alt="Media attachment"
                            className="max-h-48 w-full object-cover"
                          />
                        </div>
                      )}

                      <p className="whitespace-pre-wrap">{m.body}</p>

                      <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] text-neutral-500 dark:text-neutral-400">
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
              className="p-2 rounded-xl text-neutral-500 hover:text-emerald-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
              className="p-2 rounded-xl text-neutral-500 hover:text-emerald-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <input
              type="text"
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
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
        <div className="flex-1 flex items-center justify-center p-8 text-neutral-400 dark:text-neutral-500 text-xs">
          Select a conversation from the left to start messaging.
        </div>
      )}

      {/* Template Picker Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                Send WhatsApp Template
              </h3>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="text-xs text-neutral-400 italic">No approved templates found. Sync in Templates tab.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleSendTemplate(tpl)}
                    className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-emerald-500 bg-neutral-50 dark:bg-neutral-800/60 cursor-pointer space-y-1 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-neutral-900 dark:text-white">{tpl.name}</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">
                        {tpl.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400 line-clamp-2">
                      {tpl.components?.find((c) => c.type === 'BODY')?.text || '(Body)'}
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
