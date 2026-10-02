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
  AlertTriangle,
  CheckSquare,
  Square,
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
  deleteGroup,
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

  // Multi-select / Bulk selection
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Single Contact Delete Modal
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeletingContact, setIsDeletingContact] = useState(false);

  // Group Delete Confirmation
  const [groupToDelete, setGroupToDelete] = useState<ContactGroup | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

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

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Group Form
  const [newGroupName, setNewGroupName] = useState('');

  // 1. Subscribe to Contacts
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeContacts(
      organization.id,
      (data) => {
        setContacts(data);
        setLoading(false);
      },
      (err) => {
        toast.showError('Failed to load contacts', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [organization?.id]);

  // 2. Subscribe to Groups
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeGroups(
      organization.id,
      (data) => setGroups(data),
      (err) => toast.showError('Failed to load audience groups', err)
    );
    return () => unsub();
  }, [organization?.id]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

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

  // Single Contact Delete Action
  const confirmDeleteContact = async () => {
    if (!organization?.id || !contactToDelete) return;
    const targetId = contactToDelete.id;
    const targetName = contactToDelete.name;

    setIsDeletingContact(true);
    // Optimistic UI update
    setContacts((prev) => prev.filter((c) => c.id !== targetId));
    setSelectedContactIds((prev) => prev.filter((id) => id !== targetId));
    setContactToDelete(null);

    try {
      await deleteContact(organization.id, targetId);
      toast.showSuccess('Contact Deleted', `"${targetName}" was permanently removed.`);
    } catch (err: any) {
      toast.showError('Delete Failed', err);
    } finally {
      setIsDeletingContact(false);
    }
  };

  // Bulk Delete Action
  const confirmBulkDelete = async () => {
    if (!organization?.id || selectedContactIds.length === 0) return;
    const idsToDelete = [...selectedContactIds];
    const count = idsToDelete.length;

    setIsBulkDeleting(true);
    // Optimistic UI update
    setContacts((prev) => prev.filter((c) => !idsToDelete.includes(c.id)));
    setSelectedContactIds([]);
    setShowBulkDeleteConfirm(false);

    try {
      await Promise.all(idsToDelete.map((id) => deleteContact(organization.id, id)));
      toast.showSuccess('Contacts Deleted', `${count} contacts permanently removed.`);
    } catch (err: any) {
      toast.showError('Bulk Delete Failed', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Group Create
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !newGroupName.trim()) return;
    await addGroup(organization.id, newGroupName.trim());
    toast.showSuccess('Group Created', `Audience Group "${newGroupName.trim()}" added.`);
    setNewGroupName('');
  };

  // Group Delete Action
  const confirmDeleteGroup = async () => {
    if (!organization?.id || !groupToDelete) return;
    const targetGroupId = groupToDelete.id;
    const targetGroupName = groupToDelete.name;

    setIsDeletingGroup(true);
    // Optimistic UI update
    setGroups((prev) => prev.filter((g) => g.id !== targetGroupId));
    if (selectedGroup === targetGroupName) {
      setSelectedGroup('all');
    }
    setGroupToDelete(null);

    try {
      await deleteGroup(organization.id, targetGroupId);
      toast.showSuccess('Group Deleted', `Audience Group "${targetGroupName}" removed.`);
    } catch (err: any) {
      toast.showError('Delete Group Failed', err);
    } finally {
      setIsDeletingGroup(false);
    }
  };

  // CSV Import
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

  // CSV Export
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

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedContactIds.length === filteredContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(filteredContacts.map((c) => c.id));
    }
  };

  const handleToggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

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
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Audience Groups ({groups.length})</span>
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={contacts.length === 0}
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar (When contacts are selected) */}
      {selectedContactIds.length > 0 && (
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center space-x-2 text-rose-800 dark:text-rose-300 font-semibold">
            <CheckSquare className="w-4 h-4" />
            <span>{selectedContactIds.length} contact(s) selected</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedContactIds([])}
              className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 font-medium cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

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
            className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-hidden cursor-pointer w-full sm:w-auto font-medium"
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
          className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-hidden cursor-pointer w-full sm:w-auto font-medium"
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
            >
              Add Contact
            </button>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
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
                  <th className="py-3 px-4 w-10">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="cursor-pointer text-neutral-400 hover:text-neutral-600"
                    >
                      {selectedContactIds.length > 0 &&
                      selectedContactIds.length === filteredContacts.length ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Groups</th>
                  <th className="py-3 px-4">Opt-In Status</th>
                  <th className="py-3 px-4">Added</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredContacts.map((c) => {
                  const isSelected = selectedContactIds.includes(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30 transition-colors ${
                        isSelected ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectContact(c.id)}
                          className="cursor-pointer text-neutral-400 hover:text-neutral-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
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
                            title="Edit Contact"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setContactToDelete(c)}
                            title="Delete Contact"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button onClick={resetForm} className="text-neutral-400 hover:text-neutral-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Full Name / Contact Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  WhatsApp Phone Number (with Country Code)
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +919974428034"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g. rahul@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                  WhatsApp Consent (Opt-In Status)
                </label>
                <select
                  value={formOptIn}
                  onChange={(e) => setFormOptIn(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium cursor-pointer"
                >
                  <option value="opted_in">Opted In (Customer permitted messaging)</option>
                  <option value="pending">Pending Verification</option>
                  <option value="opted_out">Opted Out (Do not message)</option>
                </select>
              </div>

              {groups.length > 0 && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Assign to Audience Groups
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border border-neutral-200 dark:border-neutral-700 rounded-xl">
                    {groups.map((g) => {
                      const isChecked = formGroups.includes(g.name);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setFormGroups((prev) =>
                              isChecked ? prev.filter((item) => item !== g.name) : [...prev, g.name]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-100 dark:bg-emerald-950 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-semibold'
                              : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer shadow-xs"
                >
                  {isSubmitting ? 'Saving...' : editingContact ? 'Update Contact' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-semibold text-sm">Import Contacts via CSV</h3>
              <button onClick={() => setIsImportOpen(false)} className="text-neutral-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-neutral-500">
              Paste CSV text with columns: <code>Name, Phone, Email, OptInStatus</code>
            </p>

            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Rahul Sharma,+919974428034,rahul@example.com,opted_in&#10;Amit Patel,+919876543210,,opted_in"
              className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 font-mono text-xs"
            />

            {importStatus && (
              <p className="font-semibold text-emerald-600">{importStatus}</p>
            )}

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 rounded-xl border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCsvImport}
                disabled={!csvText.trim()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer"
              >
                Import Contacts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audience Group Management Modal (With Real Delete Button!) */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base flex items-center space-x-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Audience Groups</span>
              </h3>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-neutral-400 hover:text-neutral-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
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
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>

            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Existing Audience Groups ({groups.length})
              </p>
              {groups.length === 0 ? (
                <p className="text-xs text-neutral-400 italic py-2 text-center">No audience groups yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 text-xs"
                    >
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{g.name}</span>
                      <button
                        type="button"
                        onClick={() => setGroupToDelete(g)}
                        title="Delete Group"
                        className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SINGLE CONTACT DELETE CONFIRMATION DIALOG */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Delete Contact?
              </h3>
              <p className="text-neutral-500 leading-relaxed">
                Permanently delete <strong>"{contactToDelete.name}"</strong> ({contactToDelete.phone})? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setContactToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeletingContact}
                onClick={confirmDeleteContact}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs"
              >
                {isDeletingContact ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK CONTACTS DELETE CONFIRMATION DIALOG */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Delete {selectedContactIds.length} Selected Contacts?
              </h3>
              <p className="text-neutral-500 leading-relaxed">
                Permanently delete all {selectedContactIds.length} selected contacts from your WhatsApp audience?
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={confirmBulkDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs"
              >
                {isBulkDeleting ? 'Deleting...' : 'Delete All Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIENCE GROUP DELETE CONFIRMATION DIALOG */}
      {groupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Delete Audience Group?
              </h3>
              <p className="text-neutral-500 leading-relaxed">
                Delete group <strong>"{groupToDelete.name}"</strong>? Contacts assigned to this group will remain in your address book.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setGroupToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeletingGroup}
                onClick={confirmDeleteGroup}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shadow-xs"
              >
                {isDeletingGroup ? 'Deleting...' : 'Yes, Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
