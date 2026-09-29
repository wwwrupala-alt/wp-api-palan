import React, { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Upload,
  Download,
  Trash2,
  Edit2,
  Tag,
  CheckCircle,
  XCircle,
  Clock,
  X,
  Filter,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeContacts,
  subscribeGroups,
  addContact,
  updateContact,
  deleteContact,
  addGroup,
} from '../lib/services.ts';
import type { Contact, ContactGroup } from '../types/index.ts';

export const ContactsPage: React.FC = () => {
  const { organization } = useAuth();
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedOptIn, setSelectedOptIn] = useState<string>('all');

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOptIn, setFormOptIn] = useState<'opted_in' | 'opted_out' | 'pending'>('opted_in');
  const [formGroups, setFormGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    const unsubContacts = subscribeContacts(
      organization.id,
      (data) => {
        setContacts(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubGroups = subscribeGroups(
      organization.id,
      (data) => setGroups(data),
      () => {}
    );

    return () => {
      unsubContacts();
      unsubGroups();
    };
  }, [organization?.id]);

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) {
      toast.showError('Organization Required', 'No active workspace or organization found.');
      return;
    }

    const cleanPhone = formPhone.trim().replace(/\s+/g, '');
    if (!cleanPhone) {
      toast.showWarning('Phone Required', 'Please enter a valid WhatsApp phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const contactPayload = {
        name: formName.trim() || cleanPhone,
        phone: cleanPhone,
        ...(formEmail.trim() ? { email: formEmail.trim() } : {}),
        optInStatus: formOptIn,
        groups: formGroups,
      };

      if (editingContact) {
        await updateContact(organization.id, editingContact.id, contactPayload);
        toast.showSuccess('Contact Updated', `Contact "${contactPayload.name}" updated successfully.`);
      } else {
        await addContact(organization.id, contactPayload);
        toast.showSuccess('Contact Added', `Contact "${contactPayload.name}" saved successfully.`);
      }
      resetForm();
    } catch (err) {
      toast.showError('Failed to Save Contact', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormOptIn('opted_in');
    setFormGroups([]);
    setEditingContact(null);
    setIsAddOpen(false);
  };

  const handleEditClick = (contact: Contact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormEmail(contact.email || '');
    setFormOptIn(contact.optInStatus);
    setFormGroups(contact.groups || []);
    setIsAddOpen(true);
  };

  const handleDeleteClick = async (contactId: string) => {
    if (!organization?.id) return;
    if (window.confirm('Delete this contact permanently?')) {
      await deleteContact(organization.id, contactId);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !newGroupName.trim()) return;
    await addGroup(organization.id, newGroupName.trim());
    setNewGroupName('');
    setIsGroupModalOpen(false);
  };

  const handleCsvImport = async () => {
    if (!organization?.id || !csvText.trim()) return;
    const lines = csvText.split('\n');
    let imported = 0;

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2 && parts[1]) {
        const name = parts[0] || parts[1];
        const phone = parts[1];
        const email = parts[2] || undefined;
        const opt = parts[3]?.toLowerCase() === 'opted_out' ? 'opted_out' : 'opted_in';

        // Check if phone looks like a header
        if (phone.toLowerCase().includes('phone')) continue;

        await addContact(organization.id, {
          name,
          phone,
          email,
          optInStatus: opt,
          groups: [],
        });
        imported++;
      }
    }

    setImportStatus(`Successfully imported ${imported} contacts.`);
    setTimeout(() => {
      setImportStatus(null);
      setIsImportOpen(false);
      setCsvText('');
    }, 1500);
  };

  const handleExportCsv = () => {
    if (contacts.length === 0) return;
    const rows = [
      ['Name', 'Phone', 'Email', 'OptInStatus', 'Groups'],
      ...contacts.map((c) => [
        c.name,
        c.phone,
        c.email || '',
        c.optInStatus,
        (c.groups || []).join(';'),
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `whatsapp_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()));

    const matchesGroup =
      selectedGroup === 'all' || (c.groups && c.groups.includes(selectedGroup));

    const matchesOptIn =
      selectedOptIn === 'all' || c.optInStatus === selectedOptIn;

    return matchesSearch && matchesGroup && matchesOptIn;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Contacts &amp; Audience
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Manage your opted-in WhatsApp audience, tags, and recipient groups.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsGroupModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Groups ({groups.length})</span>
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={contacts.length === 0}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name, phone (+1...), or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {groups.length > 0 && (
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-hidden cursor-pointer w-full sm:w-auto"
          >
            <option value="all">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={selectedOptIn}
          onChange={(e) => setSelectedOptIn(e.target.value)}
          className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-hidden cursor-pointer w-full sm:w-auto"
        >
          <option value="all">All Opt-In Statuses</option>
          <option value="opted_in">Opted In</option>
          <option value="opted_out">Opted Out</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Contact Table / Empty State */}
      {contacts.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No contacts yet.</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Add your first customer contact or import existing audience via CSV.
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
            >
              Add Contact
            </button>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Import CSV
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Groups</th>
                  <th className="py-3 px-4">Opt-In Status</th>
                  <th className="py-3 px-4">Added</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredContacts.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                          {c.name ? c.name.charAt(0).toUpperCase() : '#'}
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-white">{c.name}</p>
                          {c.email && <p className="text-[11px] text-neutral-500">{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-700 dark:text-neutral-300">
                      {c.phone}
                    </td>
                    <td className="py-3 px-4">
                      {c.groups && c.groups.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.groups.map((g) => (
                            <span
                              key={g}
                              className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-600 dark:text-neutral-300"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                          c.optInStatus === 'opted_in'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                            : c.optInStatus === 'opted_out'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {c.optInStatus === 'opted_in' ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : c.optInStatus === 'opted_out' ? (
                          <XCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>{c.optInStatus.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-500 text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleEditClick(c)}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(c.id)}
                          className="p-1 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button onClick={resetForm} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  WhatsApp Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="+14155552671"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono"
                />
                <p className="text-[10px] text-neutral-500 mt-1">Include country code (e.g. +1... or +44...)</p>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="alex@company.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  WhatsApp Opt-In Consent Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={formOptIn}
                  onChange={(e) => setFormOptIn(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                >
                  <option value="opted_in">Opted-In (User gave explicit consent)</option>
                  <option value="pending">Pending Verification</option>
                  <option value="opted_out">Opted-Out (Do not send marketing)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingContact ? 'Update Contact' : 'Save Contact'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                Import Contacts from CSV
              </h3>
              <button onClick={() => setIsImportOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
              <p>Paste comma-separated rows in this format:</p>
              <pre className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded text-[11px] font-mono">
                Name, Phone, Email, OptInStatus{'\n'}
                Alex Morgan, +14155552671, alex@acme.com, opted_in{'\n'}
                Jordan Lee, +447700900077, jordan@acme.com, opted_in
              </pre>
            </div>

            <textarea
              rows={6}
              placeholder="Paste CSV lines here..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono text-neutral-900 dark:text-white placeholder-neutral-400"
            />

            {importStatus && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{importStatus}</p>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={!csvText.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50"
              >
                Import Contacts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Management Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">Contact Groups</h3>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Create New Group
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIP Clients, Retail"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Existing Groups</p>
              {groups.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No groups created yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-xs"
                    >
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">{g.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
