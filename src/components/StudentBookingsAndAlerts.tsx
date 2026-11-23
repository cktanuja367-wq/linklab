import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  LifeBuoy,
  MapPin,
  ShieldAlert,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { getISTNowTimestamp } from '../istTime';
import type { Booking, DamageReport, NotificationItem, RescueProposal } from '../types';

interface StudentBookingsAndAlertsProps {
  studentName: string;
  bookings: Booking[];
  damageReports: DamageReport[];
  fairnessHistory: {
    hoursUsed: number;
    approvedCount: number;
    completedCount: number;
    cancellationCount: number;
    noShowCount: number;
    usageFairnessU: number;
  };
  notifications: NotificationItem[];
  rescueProposals: RescueProposal[];
  sectionMode?: 'all' | 'bookings' | 'notifications';
  onCancelBooking: (bookingId: number) => Promise<void>;
  onReportDamage: (payload: {
    bookingId: number;
    description: string;
    reportedAt: string;
  }) => Promise<void>;
  onMarkNotificationRead: (id: number) => Promise<void>;
  onAcceptRescue: (proposalId: number) => Promise<void>;
}

type BookingTab = 'pending' | 'approved' | 'rejected' | 'completed' | 'history';

const DECISION_LABELS: Record<string, string> = {
  misuse: 'Misuse',
  negligence: 'Negligence',
  normal_wear: 'Normal Wear & Tear',
  equipment_fault: 'Equipment Fault',
};

export const StudentBookingsAndAlerts: React.FC<StudentBookingsAndAlertsProps> = ({
  studentName,
  bookings,
  damageReports,
  fairnessHistory,
  notifications,
  rescueProposals,
  sectionMode = 'all',
  onCancelBooking,
  onReportDamage,
  onMarkNotificationRead,
  onAcceptRescue,
}) => {
  const [activeTab, setActiveTab] = useState<BookingTab>('pending');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [damageBooking, setDamageBooking] = useState<Booking | null>(null);
  const [damageDesc, setDamageDesc] = useState('');
  const [damageReportedAt, setDamageReportedAt] = useState('');
  const [damageSubmitting, setDamageSubmitting] = useState(false);
  const [damageError, setDamageError] = useState<string | null>(null);
  const [damageSuccess, setDamageSuccess] = useState<string | null>(null);

  const grouped = {
    pending: bookings.filter((b) => b.status === 'pending'),
    approved: bookings.filter((b) => b.status === 'approved'),
    rejected: bookings.filter((b) => b.status === 'rejected'),
    completed: bookings.filter((b) => b.status === 'completed'),
    history: bookings,
  };

  const currentList = grouped[activeTab];

  const openDamageModal = (b: Booking) => {
    setDamageBooking(b);
    setDamageDesc('');
    setDamageReportedAt(getISTNowTimestamp());
    setDamageError(null);
  };

  const handleDamageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!damageBooking) return;
    setDamageSubmitting(true);
    setDamageError(null);
    try {
      await onReportDamage({
        bookingId: damageBooking.id,
        description: damageDesc,
        reportedAt: damageReportedAt,
      });
      setDamageSuccess(
        `Damage report logged for ${damageBooking.equipmentName} (Unit ${damageBooking.unitCode}, Booking #${damageBooking.id}). Unit is paused for faculty inspection; no automatic fee or penalty is applied.`
      );
      setDamageBooking(null);
    } catch (err) {
      setDamageError(err instanceof Error ? err.message : 'Unable to submit damage report.');
    } finally {
      setDamageSubmitting(false);
    }
  };

  const formatSnapshotLocation = (b: Booking) =>
    [
      b.snapshotBlockName,
      b.snapshotFloorName,
      b.snapshotRoomNumber ? `Room ${b.snapshotRoomNumber}` : '',
      b.snapshotLabName,
      b.snapshotBenchLocation,
    ]
      .filter(Boolean)
      .join(' · ');

  const downloadBookingReportBrief = (b: Booking) => {
    const loc = formatSnapshotLocation(b);
    const content = [
      `# ${b.projectName} — Lab Booking Report & PPT Brief`,
      ``,
      `- **Student:** ${b.studentName} (${b.studentUsn})`,
      `- **Booking Status:** ${b.status.toUpperCase()}`,
      `- **Equipment:** ${b.equipmentName} (Unit ${b.unitCode})`,
      `- **Recorded Campus Location:** ${loc}`,
      `- **Scheduled Slot:** ${b.bookingDate} (${String(b.startHour).padStart(2, '0')}:00–${String(b.endHour).padStart(2, '0')}:00 IST)`,
      `- **Project Deadline:** ${b.projectDeadline}`,
      `- **60/40 Priority Score:** ${b.priorityScore.toFixed(3)} (D=${b.deadlineUrgency.toFixed(2)}, U=${b.usageFairness.toFixed(2)})`,
      b.agreementAcceptedAt ? `- **Responsibility Agreement Accepted:** ${b.agreementAcceptedAt}` : '',
      ``,
      `## Project Summary & Lab Justification`,
      `${b.projectDescription}`,
      ``,
      `**Resource Need:** ${b.reason}`,
      ``,
      `## Suggested PPT Slide Outline`,
      `1. Slide 1 — Title & Problem Statement (${b.projectName})`,
      `2. Slide 2 — Laboratory Setup & Instrumentation (${b.equipmentName} · ${loc})`,
      `3. Slide 3 — Methodology & Experimental Procedure`,
      `4. Slide 4 — Measured Results & Validation Logs`,
      `5. Slide 5 — Conclusions & Next Engineering Milestone (Due ${b.projectDeadline})`,
    ]
      .filter(Boolean)
      .join('\n');

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${b.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ppt-report-brief.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancel = async (id: number) => {
    setBusyId(id);
    try {
      await onCancelBooking(id);
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptRescue = async (proposalId: number) => {
    setBusyId(proposalId);
    try {
      await onAcceptRescue(proposalId);
    } finally {
      setBusyId(null);
    }
  };

  const statusText = (b: Booking) => {
    switch (b.status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approved
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <Clock className="w-3.5 h-3.5" />
            Pending Approval (Slot Held)
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#641E36]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      default:
        return (
          <span className="text-xs font-medium text-slate-600 capitalize">
            {b.status.replace('_', ' ')}
          </span>
        );
    }
  };

  const showBookings = sectionMode === 'all' || sectionMode === 'bookings';
  const showNotifications = sectionMode === 'all' || sectionMode === 'notifications';

  return (
    <div className="space-y-8">
      {showBookings && (
        <section
          id="my-bookings"
          className="bg-white border border-[#E8D8C8] rounded-2xl shadow-sm p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E8D8C8]">
            <div>
              <p className="text-xs font-medium text-[#8F3453] mb-1">
                {studentName} · 14-Day Fairness Lookback (IST)
              </p>
              <h2 className="font-display text-2xl font-bold text-[#30252A]">My Bookings</h2>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl px-4 py-2.5">
              <div>
                <span className="text-[#30252A]/65">Fairness Score (U): </span>
                <span className="font-mono-tabular font-bold text-[#641E36]">
                  {fairnessHistory.usageFairnessU.toFixed(2)}
                </span>
              </div>
              <span aria-hidden="true">·</span>
              <div>
                <span className="text-[#30252A]/65">14d Usage: </span>
                <span className="font-mono-tabular font-semibold">{fairnessHistory.hoursUsed}h</span>
              </div>
              <span aria-hidden="true">·</span>
              <div>
                <span className="text-[#30252A]/65">Cancellations / No-Shows: </span>
                <span className="font-mono-tabular font-semibold">
                  {fairnessHistory.cancellationCount} / {fairnessHistory.noShowCount}
                </span>
              </div>
            </div>
          </div>

          {damageSuccess && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Wrench className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{damageSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setDamageSuccess(null)}
                className="font-semibold underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF6F0] p-1.5 rounded-xl my-5">
            {(
              [
                { id: 'pending', label: `Pending (${grouped.pending.length})` },
                { id: 'approved', label: `Approved (${grouped.approved.length})` },
                { id: 'rejected', label: `Rejected (${grouped.rejected.length})` },
                { id: 'completed', label: `Completed (${grouped.completed.length})` },
                { id: 'history', label: `Booking History (${grouped.history.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-white text-[#641E36] shadow-sm'
                    : 'text-[#30252A]/70 hover:text-[#30252A]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {currentList.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-[#E8D8C8] rounded-xl bg-[#FAF6F0]/40">
              <Calendar className="w-8 h-8 text-[#641E36]/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-[#30252A]">
                No {activeTab === 'history' ? '' : activeTab} bookings found for {studentName}.
              </p>
              <p className="text-xs text-[#30252A]/65 mt-1">
                Explore campus equipment to reserve your next bench slot.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentList.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-xl border border-[#E8D8C8] bg-[#FAF6F0]/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <img
                      src={b.equipmentImageUrl}
                      alt={b.equipmentName}
                      className="w-16 h-12 object-cover rounded-lg border border-[#E8D8C8] shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusText(b)}
                        <span aria-hidden="true" className="text-xs text-[#30252A]/40">
                          ·
                        </span>
                        <span className="font-mono-tabular text-xs text-[#30252A]/70">
                          #{b.id} · Unit {b.unitCode}
                        </span>
                        <span aria-hidden="true" className="text-xs text-[#30252A]/40">
                          ·
                        </span>
                        <span className="font-mono-tabular text-xs text-[#641E36] font-semibold">
                          Priority {b.priorityScore.toFixed(2)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm text-[#30252A] truncate">
                        {b.equipmentName} — {b.projectName}
                      </h3>
                      <p className="text-xs text-[#30252A]/70">
                        <span className="font-mono-tabular">{b.bookingDate}</span> (
                        <span className="font-mono-tabular">
                          {String(b.startHour).padStart(2, '0')}:00–
                          {String(b.endHour).padStart(2, '0')}:00 IST
                        </span>
                        ) · Deadline: <span className="font-mono-tabular">{b.projectDeadline}</span>
                      </p>
                      <p className="text-[11px] text-[#30252A]/75 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#641E36] shrink-0" />
                        <span>Recorded Location: {formatSnapshotLocation(b)}</span>
                      </p>
                      {b.agreementAcceptedAt && (
                        <p className="text-[11px] text-emerald-800 flex items-center gap-1">
                          <FileCheck2 className="w-3 h-3 shrink-0" />
                          <span>Responsibility Agreement signed: {b.agreementAcceptedAt}</span>
                        </p>
                      )}
                      {b.rejectionReason && (
                        <p className="text-xs text-rose-700 mt-1">
                          <strong>Reason:</strong> {b.rejectionReason}
                          {b.suggestedSlot ? ` · Suggested slot: ${b.suggestedSlot}` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadBookingReportBrief(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#641E36] bg-white border border-[#E8D8C8] rounded-lg hover:border-[#641E36] whitespace-nowrap cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PPT / Report Brief</span>
                    </button>

                    {b.status !== 'rejected' && b.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => openDamageModal(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Report Damage</span>
                      </button>
                    )}

                    {['pending', 'approved'].includes(b.status) && (
                      <button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={() => handleCancel(b.id)}
                        className="px-3.5 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 whitespace-nowrap cursor-pointer disabled:opacity-50"
                      >
                        {busyId === b.id ? 'Cancelling...' : 'Cancel Slot'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {damageReports.length > 0 && (
            <div className="mt-6 pt-5 border-t border-[#E8D8C8] space-y-3">
              <h3 className="font-display text-lg font-bold text-[#30252A] flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#641E36]" />
                Your Submitted Equipment Damage & Malfunction Reports ({damageReports.length})
              </h3>
              <div className="space-y-2.5">
                {damageReports.map((dr) => (
                  <div
                    key={dr.id}
                    className="p-3.5 rounded-xl bg-[#FAF6F0]/60 border border-[#E8D8C8] text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#30252A]">
                        {dr.equipmentName} (Unit {dr.unitCode}) · Booking #{dr.bookingId}
                      </span>
                      <span className="font-semibold text-[#641E36]">Status: {dr.status}</span>
                    </div>
                    <p className="text-[#30252A]/80">{dr.description}</p>
                    <p className="text-[#30252A]/60 font-mono-tabular">
                      Reported: {dr.reportedAt} · Current unit state:{' '}
                      {dr.unitStatus === 'available'
                        ? 'Marked Safe & Available'
                        : dr.unitStatus === 'damaged'
                          ? 'Locked Pending Inspection'
                          : 'Under Maintenance'}
                    </p>
                    {dr.responsibilityDecision && (
                      <p className="text-[#641E36] font-medium">
                        Assessment:{' '}
                        {DECISION_LABELS[dr.responsibilityDecision] || dr.responsibilityDecision}
                        {dr.investigationFindings ? ` — ${dr.investigationFindings}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* DAMAGE REPORT MODAL */}
      {damageBooking && (
        <div
          className="fixed inset-0 z-50 bg-[#30252A]/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="damage-report-title"
        >
          <div className="bg-white border border-[#E8D8C8] rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E8D8C8]">
              <div>
                <p className="text-xs font-medium text-[#8F3453]">
                  Non-Punitive Safety & Maintenance Reporting
                </p>
                <h3
                  id="damage-report-title"
                  className="font-display text-xl font-bold text-[#30252A]"
                >
                  Report Equipment Damage or Malfunction
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDamageBooking(null)}
                aria-label="Close damage report form"
                className="p-1.5 rounded-lg text-[#30252A]/70 hover:bg-[#FAF6F0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] text-xs text-[#30252A]/80 leading-relaxed">
              No student is automatically charged or penalized for reporting damage. Prompt
              reporting pauses unit{' '}
              <strong className="font-mono-tabular">{damageBooking.unitCode}</strong> from future
              bookings until faculty inspects and clears it safely.
            </div>

            <form onSubmit={handleDamageSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Equipment Name
                </label>
                <input
                  type="text"
                  readOnly
                  value={`${damageBooking.equipmentName} (Unit ${damageBooking.unitCode})`}
                  className="w-full px-3.5 py-2 text-sm bg-[#FAF6F0]/70 border border-[#E8D8C8] rounded-xl text-[#30252A]/85"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#30252A] mb-1">
                    Booking ID
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`#${damageBooking.id}`}
                    className="w-full px-3.5 py-2 text-sm font-mono-tabular bg-[#FAF6F0]/70 border border-[#E8D8C8] rounded-xl text-[#30252A]/85"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#30252A] mb-1">
                    Date & Time Reported (India/Karnataka IST)
                  </label>
                  <input
                    type="text"
                    required
                    value={damageReportedAt}
                    onChange={(e) => setDamageReportedAt(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono-tabular bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Description of the Issue or Malfunction
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={damageDesc}
                  onChange={(e) => setDamageDesc(e.target.value)}
                  placeholder="Describe what happened (e.g., Channel 2 probe connector loose, power indicator flickering, abnormal spindle vibration)..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                />
              </div>

              {damageError && <p className="text-xs font-medium text-rose-700">{damageError}</p>}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDamageBooking(null)}
                  className="px-4 py-2 text-xs font-medium text-[#30252A] bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={damageSubmitting}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer disabled:opacity-60"
                >
                  {damageSubmitting ? 'Submitting Report...' : 'Submit Damage Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNotifications && (
        <section
          id="notifications"
          className="bg-white border border-[#E8D8C8] rounded-2xl shadow-sm p-6 sm:p-8 space-y-5"
        >
          <div className="flex items-center justify-between pb-4 border-b border-[#E8D8C8]">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-[#641E36]" />
              <h2 className="font-display text-2xl font-bold text-[#30252A]">
                Notifications & Deadline Rescue
              </h2>
            </div>
            <span className="font-mono-tabular text-xs text-[#30252A]/70">
              {notifications.filter((n) => !n.isRead).length} Unread
            </span>
          </div>

          {rescueProposals.filter((p) => p.status === 'pending_student').length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[#641E36] flex items-center gap-2">
                <LifeBuoy className="w-4 h-4" />
                Active Project Deadline Rescue Proposals
              </h3>
              {rescueProposals
                .filter((p) => p.status === 'pending_student')
                .map((rp) => (
                  <div
                    key={rp.id}
                    className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Maintenance Rescue Plan Ready
                      </p>
                      <p className="text-sm font-semibold text-[#30252A]">
                        Switch from {rp.originalEquipmentName} to {rp.proposedEquipmentName} (
                        {rp.proposedUnitCode})
                      </p>
                      <p className="text-xs text-[#30252A]/80">
                        Slot: <span className="font-mono-tabular">{rp.proposedDate}</span> ·{' '}
                        <span className="font-mono-tabular">
                          {String(rp.proposedStartHour).padStart(2, '0')}:00–
                          {String(rp.proposedEndHour).padStart(2, '0')}:00 IST
                        </span>
                      </p>
                      <p className="text-xs text-[#30252A]/75">{rp.compatibilityExplanation}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === rp.id}
                      onClick={() => handleAcceptRescue(rp.id)}
                      className="px-4 py-2.5 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {busyId === rp.id ? 'Rebooking...' : 'Accept Rescue Plan'}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {notifications.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-[#E8D8C8] rounded-xl bg-[#FAF6F0]/40">
              <p className="text-sm text-[#30252A]/75">
                You have no notifications yet. Updates on approvals, verification, damage
                inspections, and maintenance alerts will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8D8C8]">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`py-3.5 flex items-start justify-between gap-4 ${
                    n.isRead ? 'opacity-70' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[#8F3453] font-medium">
                      <span className="capitalize">{n.type}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular text-[#30252A]/60">
                        {n.createdAt.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#30252A]">{n.title}</p>
                    <p className="text-xs text-[#30252A]/80 leading-relaxed">{n.message}</p>
                  </div>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() => onMarkNotificationRead(n.id)}
                      className="text-xs font-medium text-[#641E36] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
