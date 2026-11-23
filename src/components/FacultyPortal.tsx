import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Cpu,
  FileCheck2,
  LayoutDashboard,
  MapPin,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { api } from '../api';
import { getISTDateStr } from '../istTime';
import { FairAllocationDemo } from './FairAllocationDemo';
import type {
  Booking,
  CertificationRecord,
  DamageReport,
  DamageStatus,
  Equipment,
  LabAnalytics,
  LabHoliday,
  LabRoom,
  MaintenanceRecord,
  RescueProposal,
  ResponsibilityDecision,
  RoomStatus,
  UserProfile,
} from '../types';

type FacultyTab =
  | 'overview'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'damage'
  | 'schedules'
  | 'equipment'
  | 'certifications'
  | 'maintenance'
  | 'utilisation'
  | 'fairness';

interface FacultyPortalProps {
  profile: UserProfile;
  onDataMutated: () => Promise<void>;
}

export const FacultyPortal: React.FC<FacultyPortalProps> = ({ profile, onDataMutated }) => {
  const [activeTab, setActiveTab] = useState<FacultyTab>('overview');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [rooms, setRooms] = useState<LabRoom[]>([]);
  const [certs, setCerts] = useState<CertificationRecord[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [rescueProposals, setRescueProposals] = useState<RescueProposal[]>([]);
  const [damageReports, setDamageReports] = useState<DamageReport[]>([]);
  const [labHolidays, setLabHolidays] = useState<LabHoliday[]>([]);
  const [analytics, setAnalytics] = useState<LabAnalytics | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [damageDrafts, setDamageDrafts] = useState<
    Record<
      number,
      {
        status: DamageStatus;
        responsibilityDecision: ResponsibilityDecision | '';
        investigationFindings: string;
        facultyNotes: string;
      }
    >
  >({});

  // Holiday form state
  const [holidayDate, setHolidayDate] = useState(getISTDateStr(2));
  const [holidayRoomId, setHolidayRoomId] = useState<string>('');
  const [holidayTitle, setHolidayTitle] = useState('');

  // Reject inline state
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState(
    'Slot assigned to higher 60/40 priority request or maintenance'
  );
  const [rejectSuggestedSlot, setRejectSuggestedSlot] = useState('');

  // Add equipment form
  const [newEqName, setNewEqName] = useState('');
  const [newEqCategory, setNewEqCategory] = useState('Electronics');
  const [newEqRoomId, setNewEqRoomId] = useState<number>(0);
  const [newEqBench, setNewEqBench] = useState('Bench 01');
  const [newEqDesc, setNewEqDesc] = useState('');
  const [newEqUnits, setNewEqUnits] = useState('LAB-101-A, LAB-101-B');
  const [newEqReqCert, setNewEqReqCert] = useState(false);
  const [newEqCertName, setNewEqCertName] = useState('');
  const [newEqPhotoDataUrl, setNewEqPhotoDataUrl] = useState<string>('');

  // Certification grant form
  const [certStudent, setCertStudent] = useState('');
  const [certName, setCertName] = useState('ESD & FPGA Hardware Safety L1');

  // Maintenance form
  const [maintEqId, setMaintEqId] = useState<number>(0);
  const [maintUnitId, setMaintUnitId] = useState<string>('');
  const [maintReason, setMaintReason] = useState('Scheduled instrument calibration & safety check');
  const [maintStart, setMaintStart] = useState(getISTDateStr(0));
  const [maintEnd, setMaintEnd] = useState(getISTDateStr(0));

  const isStaff = profile.role === 'faculty' || profile.role === 'admin';

  const loadFacultyWorkspace = async () => {
    setErrorBanner(null);
    try {
      const [bRes, eRes, cRes, mRes, aRes, drRes, campusRes] = await Promise.all([
        api.getFacultyBookings(),
        api.getEquipment(),
        api.getFacultyCertifications(),
        api.getFacultyMaintenance(),
        api.getAnalytics(),
        api.getFacultyDamageReports(),
        api.getCampus(),
      ]);
      setBookings(bRes.bookings);
      setEquipment(eRes.equipment);
      setCerts(cRes.certifications);
      setMaintenance(mRes.maintenance);
      setRescueProposals(mRes.rescueProposals);
      setAnalytics(aRes);
      setDamageReports(drRes.damageReports);
      setRooms(campusRes.rooms);
      setLabHolidays(campusRes.holidays);

      const nextDrafts: typeof damageDrafts = {};
      for (const r of drRes.damageReports) {
        nextDrafts[r.id] = {
          status: r.status,
          responsibilityDecision: r.responsibilityDecision ?? '',
          investigationFindings: r.investigationFindings ?? '',
          facultyNotes: r.facultyNotes ?? '',
        };
      }
      setDamageDrafts(nextDrafts);

      if (campusRes.rooms.length > 0 && !newEqRoomId) {
        setNewEqRoomId(campusRes.rooms[0].id);
      }
      if (eRes.equipment.length > 0 && !maintEqId) {
        setMaintEqId(eRes.equipment[0].id);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to load faculty workspace.');
    }
  };

  useEffect(() => {
    if (isStaff) {
      loadFacultyWorkspace();
    }
  }, [profile.id, profile.role]);

  if (!isStaff) {
    return (
      <div className="max-w-3xl mx-auto my-12 bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-3">
        <ShieldCheck className="w-10 h-10 text-rose-700 mx-auto" />
        <h2 className="font-display text-2xl font-bold text-[#30252A]">Faculty Access Restricted</h2>
        <p className="text-sm text-[#30252A]/75">
          Only verified Faculty and Administrator accounts can review booking approvals, issue
          safety certifications, or inspect equipment damage reports.
        </p>
      </div>
    );
  }

  const handleDecision = async (
    bookingId: number,
    decision: 'approve' | 'reject' | 'complete' | 'no_show'
  ) => {
    setErrorBanner(null);
    try {
      await api.decideBooking(bookingId, {
        decision,
        rejectionReason: decision === 'reject' ? rejectReason : undefined,
        suggestedSlot:
          decision === 'reject' && rejectSuggestedSlot ? rejectSuggestedSlot : undefined,
      });
      setRejectingId(null);
      setActionBanner(`Booking #${bookingId} updated (${decision}).`);
      await loadFacultyWorkspace();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update booking.');
    }
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setNewEqPhotoDataUrl('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setNewEqPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      await api.createEquipment({
        name: newEqName,
        category: newEqCategory,
        description: newEqDesc,
        photoDataUrl: newEqPhotoDataUrl || undefined,
        roomId: newEqRoomId,
        benchLocation: newEqBench,
        specs: { notes: 'Registered via Faculty Portal' },
        requiresCertification: newEqReqCert,
        certificationName: newEqReqCert ? newEqCertName : undefined,
        unitCodes: newEqUnits
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setNewEqName('');
      setNewEqDesc('');
      setNewEqPhotoDataUrl('');
      setActionBanner('New equipment and units added to campus catalog.');
      await loadFacultyWorkspace();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to create equipment.');
    }
  };

  const handleGrantCert = async (studentName: string, certificationName: string, active: boolean) => {
    setErrorBanner(null);
    try {
      await api.upsertCertification({ studentName, certificationName, active });
      setActionBanner(
        active
          ? `Granted "${certificationName}" to ${studentName}.`
          : `Revoked "${certificationName}" from ${studentName}.`
      );
      await loadFacultyWorkspace();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update certification.');
    }
  };

  const handleScheduleMaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      const res = await api.scheduleMaintenance({
        equipmentId: maintEqId,
        unitId: maintUnitId ? Number(maintUnitId) : null,
        reason: maintReason,
        startDate: maintStart,
        endDate: maintEnd,
      });
      setActionBanner(
        `Maintenance scheduled. Project Deadline Rescue generated ${res.rescuedCount} alternative proposal(s) and alerted affected students.`
      );
      await loadFacultyWorkspace();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to schedule maintenance.');
    }
  };

  const handleResolveMaint = async (id: number) => {
    await api.resolveMaintenance(id);
    setActionBanner('Equipment availability restored.');
    await loadFacultyWorkspace();
    await onDataMutated();
  };

  const handleUpdateDamageReport = async (reportId: number, markUnitSafe = false) => {
    const draft = damageDrafts[reportId];
    if (!draft) return;
    const nextStatus: DamageStatus = markUnitSafe ? 'Resolved' : draft.status;
    await api.updateDamageReport(reportId, {
      status: nextStatus,
      investigationFindings: draft.investigationFindings || undefined,
      responsibilityDecision: draft.responsibilityDecision ? draft.responsibilityDecision : null,
      facultyNotes: draft.facultyNotes || undefined,
      markUnitSafe,
    });
    setActionBanner(
      markUnitSafe
        ? `Damage report #${reportId} resolved and equipment unit marked safe & available again.`
        : `Damage report #${reportId} updated (${nextStatus}).`
    );
    await loadFacultyWorkspace();
    await onDataMutated();
  };

  const handleRoomScheduleUpdate = async (
    room: LabRoom,
    patch: {
      openHour?: number;
      closeHour?: number;
      saturdayOpenHour?: number;
      saturdayCloseHour?: number;
      sundayClosed?: boolean;
      status?: RoomStatus;
    }
  ) => {
    try {
      await api.updateRoomSchedule(room.id, patch);
      setActionBanner(`Updated schedule / status for Room ${room.roomNumber} (${room.labName}).`);
      await loadFacultyWorkspace();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update room schedule.');
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createLabHoliday({
        holidayDate,
        roomId: holidayRoomId ? Number(holidayRoomId) : null,
        title: holidayTitle,
      });
      setHolidayTitle('');
      setActionBanner(`Added holiday closure on ${holidayDate}.`);
      await loadFacultyWorkspace();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to add holiday.');
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    await api.deleteLabHoliday(id);
    setActionBanner('Removed lab holiday.');
    await loadFacultyWorkspace();
    await onDataMutated();
  };

  const pendingBookings = bookings.filter((b) => b.status === 'pending');
  const approvedBookings = bookings.filter((b) => b.status === 'approved');
  const rejectedBookings = bookings.filter((b) => b.status === 'rejected');
  const openDamageCount = damageReports.filter((d) => d.status !== 'Resolved').length;

  const navTabs: { id: FacultyTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'pending', label: `Pending Requests (${pendingBookings.length})`, icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'approved', label: `Approved (${approvedBookings.length})`, icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'rejected', label: `Rejected (${rejectedBookings.length})`, icon: <XCircle className="w-4 h-4" /> },
    { id: 'damage', label: `Damage Reports (${openDamageCount})`, icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'schedules', label: 'Lab Hours & Holidays', icon: <CalendarClock className="w-4 h-4" /> },
    { id: 'equipment', label: 'Equipment Management', icon: <Cpu className="w-4 h-4" /> },
    { id: 'certifications', label: 'Safety Certifications', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'maintenance', label: 'Maintenance & Rescue', icon: <Wrench className="w-4 h-4" /> },
    { id: 'utilisation', label: 'Lab Utilisation', icon: <Activity className="w-4 h-4" /> },
    { id: 'fairness', label: 'Fair Allocation', icon: <Scale className="w-4 h-4" /> },
  ];

  const renderBookingTable = (list: Booking[], mode: 'pending' | 'approved' | 'rejected') => {
    if (list.length === 0) {
      return (
        <div className="p-8 text-center bg-white border border-dashed border-[#E8D8C8] rounded-xl text-sm text-[#30252A]/70">
          No {mode} booking requests at the moment.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {list.map((b) => (
          <div key={b.id} className="bg-white border border-[#E8D8C8] rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#8F3453] font-medium">
                  <span className="font-mono-tabular">Request #{b.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {b.studentName} ({b.studentUsn})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Unit {b.unitCode}</span>
                  <span aria-hidden="true">·</span>
                  <span className={b.safetyEligible ? 'text-emerald-700' : 'text-rose-700'}>
                    {b.safetyEligible ? 'Safety Eligible' : 'Safety Missing'}
                  </span>
                </div>
                <h4 className="font-display text-lg font-bold text-[#30252A] mt-0.5">
                  {b.equipmentName} — {b.projectName}
                </h4>
                <p className="text-xs text-[#30252A]/75 mt-1">
                  Slot: <span className="font-mono-tabular">{b.bookingDate}</span> (
                  <span className="font-mono-tabular">
                    {String(b.startHour).padStart(2, '0')}:00–
                    {String(b.endHour).padStart(2, '0')}:00 IST
                  </span>
                  ) · Deadline: <span className="font-mono-tabular">{b.projectDeadline}</span>
                </p>
                <p className="text-[11px] text-[#30252A]/70 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-[#641E36]" />
                  <span>
                    {b.snapshotBlockName} · {b.snapshotFloorName} · Room {b.snapshotRoomNumber} ·{' '}
                    {b.snapshotLabName}
                  </span>
                </p>
                {b.agreementAcceptedAt && (
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1 mt-1">
                    <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Responsibility Agreement accepted at {b.agreementAcceptedAt}</span>
                  </p>
                )}
              </div>

              <div className="text-right font-mono-tabular">
                <p className="text-xs text-[#30252A]/65">60/40 Priority Score</p>
                <p className="text-xl font-bold text-[#641E36]">{b.priorityScore.toFixed(3)}</p>
                <p className="text-[11px] text-[#30252A]/65">
                  D={b.deadlineUrgency.toFixed(2)} · U={b.usageFairness.toFixed(2)}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#30252A]/80 bg-[#FAF6F0] p-3 rounded-lg border border-[#E8D8C8]/70">
              <strong>Justification:</strong> {b.reason} — <strong>Allocation Engine:</strong>{' '}
              {b.allocationNotes}
            </p>

            {b.rejectionReason && (
              <p className="text-xs text-rose-700">
                <strong>Rejection Reason:</strong> {b.rejectionReason}
                {b.suggestedSlot ? ` (Suggested slot: ${b.suggestedSlot})` : ''}
              </p>
            )}

            {mode === 'pending' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDecision(b.id, 'approve')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                >
                  Approve Request
                </button>
                <button
                  type="button"
                  onClick={() => setRejectingId(rejectingId === b.id ? null : b.id)}
                  className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg cursor-pointer"
                >
                  Reject & Release Slot
                </button>
              </div>
            )}

            {mode === 'approved' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDecision(b.id, 'complete')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg cursor-pointer"
                >
                  Mark Completed
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(b.id, 'no_show')}
                  className="px-3.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer"
                >
                  Record No-Show
                </button>
              </div>
            )}

            {rejectingId === b.id && (
              <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason"
                    className="px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg"
                  />
                  <input
                    type="text"
                    value={rejectSuggestedSlot}
                    onChange={(e) => setRejectSuggestedSlot(e.target.value)}
                    placeholder="Optional suggested slot (e.g. Tomorrow 14:00)"
                    className="px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleDecision(b.id, 'reject')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer"
                >
                  Confirm Rejection & Release Hold
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar */}
      <aside className="lg:col-span-3">
        <nav className="bg-white border border-[#E8D8C8] rounded-2xl p-2.5 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8F3453] px-3 py-1">
            Faculty Administration
          </p>
          {navTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${
                activeTab === t.id
                  ? 'bg-[#641E36] text-white'
                  : 'text-[#30252A]/80 hover:bg-[#FAF6F0]'
              }`}
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Panel */}
      <div className="lg:col-span-9 space-y-6 min-w-0">
        {actionBanner && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3">
            <span>{actionBanner}</span>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center justify-between gap-3">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'overview' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Total Equipment', value: analytics.totals.totalEquipment },
                { label: 'Available Units', value: analytics.totals.availableUnits },
                { label: 'Pending Approvals', value: analytics.totals.pendingCount },
                { label: 'Damaged / Locked', value: analytics.totals.damagedUnits },
                { label: 'Maintenance Units', value: analytics.totals.maintenanceUnits },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white border border-[#E8D8C8] rounded-xl p-4">
                  <p className="text-xs text-[#30252A]/65">{kpi.label}</p>
                  <p className="font-mono-tabular text-2xl font-bold text-[#641E36] mt-1">
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-display text-xl font-bold text-[#30252A] mb-3">
                Priority Approval Queue
              </h3>
              {renderBookingTable(pendingBookings.slice(0, 4), 'pending')}
            </div>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-[#30252A]">
              Pending Booking Requests (Ranked by 60/40 Priority)
            </h2>
            {renderBookingTable(pendingBookings, 'pending')}
          </div>
        )}

        {activeTab === 'approved' && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-[#30252A]">Approved Sessions</h2>
            {renderBookingTable(approvedBookings, 'approved')}
          </div>
        )}

        {activeTab === 'rejected' && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-[#30252A]">Rejected Requests</h2>
            {renderBookingTable(rejectedBookings, 'rejected')}
          </div>
        )}

        {activeTab === 'damage' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-2">
              <h2 className="font-display text-2xl font-bold text-[#30252A]">
                Equipment Damage Reports & Safety Clearance
              </h2>
              <p className="text-xs text-[#30252A]/75 leading-relaxed">
                Reported instruments are automatically paused from student bookings until faculty
                completes inspection. Students are never automatically fined or penalized for
                submitting a report.
              </p>
            </div>

            {damageReports.length === 0 ? (
              <div className="p-8 text-center bg-white border border-dashed border-[#E8D8C8] rounded-2xl text-sm text-[#30252A]/70">
                No damage or malfunction reports logged.
              </div>
            ) : (
              <div className="space-y-4">
                {damageReports.map((dr) => {
                  const draft = damageDrafts[dr.id] ?? {
                    status: dr.status,
                    responsibilityDecision: dr.responsibilityDecision ?? '',
                    investigationFindings: dr.investigationFindings ?? '',
                    facultyNotes: dr.facultyNotes ?? '',
                  };
                  return (
                    <div
                      key={dr.id}
                      className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#E8D8C8]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8F3453] font-medium">
                            <span className="font-mono-tabular">Report #{dr.id}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">Booking #{dr.bookingId}</span>
                            <span aria-hidden="true">·</span>
                            <span>Reported by {dr.studentName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">{dr.reportedAt}</span>
                          </div>
                          <h3 className="font-display text-lg font-bold text-[#30252A] mt-1">
                            {dr.equipmentName} — Unit {dr.unitCode} ({dr.labName})
                          </h3>
                          <p className="text-sm text-[#30252A]/85 mt-1">{dr.description}</p>
                        </div>

                        <div className="text-right text-xs space-y-1">
                          <p className="font-semibold text-[#641E36]">Report: {dr.status}</p>
                          <p
                            className={`font-medium ${
                              dr.unitStatus === 'available'
                                ? 'text-emerald-700'
                                : dr.unitStatus === 'damaged'
                                  ? 'text-rose-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            Unit Status:{' '}
                            {dr.unitStatus === 'available'
                              ? 'Safe & Available'
                              : dr.unitStatus === 'damaged'
                                ? 'Locked (Damaged)'
                                : 'Maintenance'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#30252A] mb-1">
                            Investigation Status
                          </label>
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setDamageDrafts((prev) => ({
                                ...prev,
                                [dr.id]: { ...draft, status: e.target.value as DamageStatus },
                              }))
                            }
                            className="w-full px-3 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                          >
                            {(
                              [
                                'Reported',
                                'Under Investigation',
                                'Resolved',
                                'Maintenance Required',
                              ] as DamageStatus[]
                            ).map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#30252A] mb-1">
                            Responsibility Decision (If Confirmed)
                          </label>
                          <select
                            value={draft.responsibilityDecision}
                            onChange={(e) =>
                              setDamageDrafts((prev) => ({
                                ...prev,
                                [dr.id]: {
                                  ...draft,
                                  responsibilityDecision: e.target.value as
                                    | ResponsibilityDecision
                                    | '',
                                },
                              }))
                            }
                            className="w-full px-3 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                          >
                            <option value="">Not yet classified / No fault</option>
                            <option value="equipment_fault">Equipment Fault</option>
                            <option value="normal_wear">Normal Wear and Tear</option>
                            <option value="negligence">Negligence</option>
                            <option value="misuse">Misuse</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#30252A] mb-1">
                            Investigation Findings
                          </label>
                          <textarea
                            rows={2}
                            value={draft.investigationFindings}
                            onChange={(e) =>
                              setDamageDrafts((prev) => ({
                                ...prev,
                                [dr.id]: { ...draft, investigationFindings: e.target.value },
                              }))
                            }
                            placeholder="Document hardware inspection results..."
                            className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#30252A] mb-1">
                            Faculty Notes / Follow-up
                          </label>
                          <textarea
                            rows={2}
                            value={draft.facultyNotes}
                            onChange={(e) =>
                              setDamageDrafts((prev) => ({
                                ...prev,
                                [dr.id]: { ...draft, facultyNotes: e.target.value },
                              }))
                            }
                            placeholder="Bench technician notes, replacement parts, or guidance..."
                            className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateDamageReport(dr.id, false)}
                          className="px-4 py-2 text-xs font-semibold text-[#641E36] bg-[#FAF6F0] border border-[#E8D8C8] hover:border-[#641E36] rounded-xl cursor-pointer"
                        >
                          Save Investigation Findings
                        </button>
                        {dr.unitStatus !== 'available' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateDamageReport(dr.id, true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Equipment Safe & Available Again</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedules' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#30252A]">
                  Laboratory Room Operating Hours (India/Karnataka IST)
                </h2>
                <p className="text-xs text-[#30252A]/75 mt-1">
                  Default policy is Monday–Saturday 09:00–17:00 IST, Sundays closed. Update room
                  statuses or operating hours below.
                </p>
              </div>

              {rooms.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-[#E8D8C8] text-xs text-[#30252A]/70">
                  No laboratory rooms configured yet. Ask an Administrator to create Campus Blocks,
                  Floors, and Laboratory Rooms in the Admin Dashboard.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-[#30252A]/70">
                      <tr>
                        <th className="py-2.5 px-3">Campus Room / Lab</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Mon–Fri Hours (IST)</th>
                        <th className="py-2.5 px-3">Saturday Hours (IST)</th>
                        <th className="py-2.5 px-3">Sunday</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8D8C8]">
                      {rooms.map((r) => (
                        <tr key={r.id}>
                          <td className="py-3 px-3 font-medium">
                            <p className="text-[#30252A] font-semibold">
                              {r.blockName} · Room {r.roomNumber}
                            </p>
                            <p className="text-[#30252A]/65">{r.labName}</p>
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={r.status}
                              onChange={(e) =>
                                handleRoomScheduleUpdate(r, {
                                  status: e.target.value as RoomStatus,
                                })
                              }
                              className="px-2.5 py-1.5 bg-[#FAF6F0] border border-[#E8D8C8] rounded-lg"
                            >
                              <option value="available">Available</option>
                              <option value="unavailable">Unavailable</option>
                              <option value="maintenance">Maintenance</option>
                            </select>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-mono-tabular">
                              <select
                                value={r.openHour}
                                onChange={(e) =>
                                  handleRoomScheduleUpdate(r, {
                                    openHour: Number(e.target.value),
                                  })
                                }
                                className="px-2 py-1 bg-[#FAF6F0] border border-[#E8D8C8] rounded-lg"
                              >
                                {[7, 8, 9, 10, 11].map((h) => (
                                  <option key={h} value={h}>
                                    {String(h).padStart(2, '0')}:00
                                  </option>
                                ))}
                              </select>
                              <span>–</span>
                              <select
                                value={r.closeHour}
                                onChange={(e) =>
                                  handleRoomScheduleUpdate(r, {
                                    closeHour: Number(e.target.value),
                                  })
                                }
                                className="px-2 py-1 bg-[#FAF6F0] border border-[#E8D8C8] rounded-lg"
                              >
                                {[15, 16, 17, 18, 19, 20].map((h) => (
                                  <option key={h} value={h}>
                                    {String(h).padStart(2, '0')}:00
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-mono-tabular">
                              <select
                                value={r.saturdayOpenHour}
                                onChange={(e) =>
                                  handleRoomScheduleUpdate(r, {
                                    saturdayOpenHour: Number(e.target.value),
                                  })
                                }
                                className="px-2 py-1 bg-[#FAF6F0] border border-[#E8D8C8] rounded-lg"
                              >
                                {[8, 9, 10, 11].map((h) => (
                                  <option key={h} value={h}>
                                    {String(h).padStart(2, '0')}:00
                                  </option>
                                ))}
                              </select>
                              <span>–</span>
                              <select
                                value={r.saturdayCloseHour}
                                onChange={(e) =>
                                  handleRoomScheduleUpdate(r, {
                                    saturdayCloseHour: Number(e.target.value),
                                  })
                                }
                                className="px-2 py-1 bg-[#FAF6F0] border border-[#E8D8C8] rounded-lg"
                              >
                                {[13, 14, 15, 16, 17, 18].map((h) => (
                                  <option key={h} value={h}>
                                    {String(h).padStart(2, '0')}:00
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={r.sundayClosed}
                                onChange={(e) =>
                                  handleRoomScheduleUpdate(r, { sundayClosed: e.target.checked })
                                }
                                className="accent-[#641E36]"
                              />
                              <span>{r.sundayClosed ? 'Closed' : 'Open'}</span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
              <h3 className="font-display text-xl font-bold text-[#30252A]">
                College & Laboratory Holiday Closures
              </h3>
              <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="date"
                  required
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="px-3 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <select
                  value={holidayRoomId}
                  onChange={(e) => setHolidayRoomId(e.target.value)}
                  className="px-3 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value="">All Campus Laboratories</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.blockName} · Room {r.roomNumber} · {r.labName}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={holidayTitle}
                  onChange={(e) => setHolidayTitle(e.target.value)}
                  placeholder="Holiday reason (e.g. Semester Exam Closure)"
                  className="px-3 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
                >
                  Add Holiday Closure
                </button>
              </form>

              <div className="space-y-2">
                {labHolidays.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono-tabular font-semibold text-[#641E36]">
                        {h.holidayDate}
                      </span>{' '}
                      · <strong>{h.labName || 'All Labs'}</strong> — {h.title}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="inline-flex items-center gap-1 text-rose-700 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'equipment' && (
          <div className="space-y-6">
            <form
              onSubmit={handleCreateEquipment}
              className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4"
            >
              <h3 className="font-display text-xl font-bold text-[#30252A] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#641E36]" />
                Register New Laboratory Equipment
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  value={newEqName}
                  onChange={(e) => setNewEqName(e.target.value)}
                  placeholder="Equipment Name"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <select
                  value={newEqCategory}
                  onChange={(e) => setNewEqCategory(e.target.value)}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  {[
                    'Electronics',
                    'Robotics',
                    'IoT',
                    'Computing',
                    'Mechanical',
                    'Embedded Systems',
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={newEqRoomId}
                  onChange={(e) => setNewEqRoomId(Number(e.target.value))}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value={0}>Select Assigned Laboratory Room...</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.blockName} · {r.floorLabel} · Room {r.roomNumber} · {r.labName}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newEqBench}
                  onChange={(e) => setNewEqBench(e.target.value)}
                  placeholder="Bench / Bay (e.g., Bench 03)"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="text"
                  required
                  value={newEqUnits}
                  onChange={(e) => setNewEqUnits(e.target.value)}
                  placeholder="Unit IDs (comma separated)"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEqReqCert}
                      onChange={(e) => setNewEqReqCert(e.target.checked)}
                      className="accent-[#641E36] w-4 h-4"
                    />
                    Requires Safety Certification
                  </label>
                </div>
              </div>
              {newEqReqCert && (
                <input
                  type="text"
                  required
                  value={newEqCertName}
                  onChange={(e) => setNewEqCertName(e.target.value)}
                  placeholder="Certification Name (e.g. ESD & FPGA Hardware Safety L1)"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
              )}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#30252A]">
                  Equipment Photograph (upload actual lab photo or leave blank for category default)
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePhotoFileChange}
                    className="text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#FAF6F0] file:text-[#641E36] hover:file:bg-[#E8D8C8] cursor-pointer"
                  />
                  {newEqPhotoDataUrl && (
                    <img
                      src={newEqPhotoDataUrl}
                      alt="Uploaded equipment preview"
                      className="w-20 h-14 object-cover rounded-lg border border-[#E8D8C8]"
                    />
                  )}
                </div>
              </div>
              <textarea
                rows={2}
                required
                value={newEqDesc}
                onChange={(e) => setNewEqDesc(e.target.value)}
                placeholder="Technical description and capabilities..."
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
              />
              <button
                type="submit"
                disabled={!newEqRoomId}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer disabled:opacity-50"
              >
                Add Equipment to Database
              </button>
            </form>

            <div className="bg-white border border-[#E8D8C8] rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-xs text-[#30252A]/70">
                  <tr>
                    <th className="py-3 px-4">Equipment</th>
                    <th className="py-3 px-4">Campus Location</th>
                    <th className="py-3 px-4">Units</th>
                    <th className="py-3 px-4">Safety Gate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D8C8]">
                  {equipment.map((eq) => (
                    <tr key={eq.id} className="hover:bg-[#FAF6F0]/50">
                      <td className="py-3 px-4 font-semibold text-[#30252A]">{eq.name}</td>
                      <td className="py-3 px-4 text-xs text-[#30252A]/75">{eq.location}</td>
                      <td className="py-3 px-4 font-mono-tabular text-xs">
                        {eq.units.map((u) => u.unitCode).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {eq.requiresCertification ? eq.certificationName : 'Open Access'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'certifications' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
              <h3 className="font-display text-xl font-bold text-[#30252A]">
                Issue or Update Student Safety Certification
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={certStudent}
                  onChange={(e) => setCertStudent(e.target.value)}
                  placeholder="Student Name, USN, or Gmail"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <select
                  value={certName}
                  onChange={(e) => setCertName(e.target.value)}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value="ESD & FPGA Hardware Safety L1">ESD & FPGA Hardware Safety L1</option>
                  <option value="Robotics & Motion Safety L1">Robotics & Motion Safety L1</option>
                  <option value="Additive Thermal Safety L1">Additive Thermal Safety L1</option>
                  <option value="High-Voltage Bench Safety L2">High-Voltage Bench Safety L2</option>
                  <option value="CNC Machining Safety L2">CNC Machining Safety L2</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleGrantCert(certStudent, certName, true)}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
                >
                  Grant Certification
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#E8D8C8] rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-xs text-[#30252A]/70">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Certification</th>
                    <th className="py-3 px-4">Issued By</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D8C8]">
                  {certs.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 px-4 font-semibold">{c.studentName}</td>
                      <td className="py-3 px-4 text-xs">{c.certificationName}</td>
                      <td className="py-3 px-4 text-xs text-[#30252A]/70">{c.issuedBy}</td>
                      <td className="py-3 px-4 text-xs font-medium">
                        {c.active ? (
                          <span className="text-emerald-700">Active</span>
                        ) : (
                          <span className="text-rose-700">Revoked</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleGrantCert(c.studentName, c.certificationName, !c.active)
                          }
                          className="text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
                        >
                          {c.active ? 'Revoke' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="space-y-6">
            <form
              onSubmit={handleScheduleMaint}
              className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4"
            >
              <div>
                <h3 className="font-display text-xl font-bold text-[#30252A]">
                  Schedule Equipment Maintenance (Triggers Project Deadline Rescue)
                </h3>
                <p className="text-xs text-[#30252A]/75 mt-1">
                  Placing a unit under maintenance automatically searches for compatible cross-lab
                  equipment and alternative slots for every affected student project.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <select
                  value={maintEqId}
                  onChange={(e) => {
                    setMaintEqId(Number(e.target.value));
                    setMaintUnitId('');
                  }}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  {equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </select>

                <select
                  value={maintUnitId}
                  onChange={(e) => setMaintUnitId(e.target.value)}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value="">All units of this equipment</option>
                  {equipment
                    .find((e) => e.id === maintEqId)
                    ?.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitCode} ({u.status})
                      </option>
                    ))}
                </select>

                <input
                  type="date"
                  required
                  value={maintStart}
                  onChange={(e) => setMaintStart(e.target.value)}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="date"
                  required
                  value={maintEnd}
                  onChange={(e) => setMaintEnd(e.target.value)}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
              </div>

              <input
                type="text"
                required
                value={maintReason}
                onChange={(e) => setMaintReason(e.target.value)}
                placeholder="Maintenance reason..."
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
              />

              <button
                type="submit"
                disabled={!maintEqId}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer disabled:opacity-50"
              >
                Mark Under Maintenance & Run Deadline Rescue
              </button>
            </form>

            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-3">
              <h4 className="font-display text-lg font-bold text-[#30252A]">
                Maintenance Log & Restorations
              </h4>
              {maintenance.length === 0 ? (
                <p className="text-sm text-[#30252A]/65">No active or past maintenance logs.</p>
              ) : (
                maintenance.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#30252A]">
                        {m.equipmentName} {m.unitCode ? `(${m.unitCode})` : '(All Units)'}
                      </p>
                      <p className="text-xs text-[#30252A]/75">
                        {m.reason} ·{' '}
                        <span className="font-mono-tabular">
                          {m.startDate} to {m.endDate}
                        </span>{' '}
                        · Status: {m.status}
                      </p>
                    </div>
                    {m.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => handleResolveMaint(m.id)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer"
                      >
                        Restore Availability
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {rescueProposals.length > 0 && (
              <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-3">
                <h4 className="font-display text-lg font-bold text-[#30252A]">
                  Generated Project Deadline Rescue Proposals ({rescueProposals.length})
                </h4>
                {rescueProposals.map((rp) => (
                  <div
                    key={rp.id}
                    className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 text-xs space-y-1"
                  >
                    <p className="font-semibold text-[#30252A]">
                      Student: {rp.studentName} · Status: {rp.status}
                    </p>
                    <p>
                      Redirected from {rp.originalEquipmentName} → {rp.proposedEquipmentName} (
                      {rp.proposedUnitCode}) on{' '}
                      <span className="font-mono-tabular">
                        {rp.proposedDate} ({String(rp.proposedStartHour).padStart(2, '0')}:00–
                        {String(rp.proposedEndHour).padStart(2, '0')}:00)
                      </span>
                    </p>
                    <p className="text-[#30252A]/75">{rp.compatibilityExplanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'utilisation' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Requests', value: analytics.totals.totalBookings },
                {
                  label: 'Approved + Completed',
                  value: analytics.totals.approvedCount + analytics.totals.completedCount,
                },
                { label: 'Rejected', value: analytics.totals.rejectedCount },
                { label: 'Units Booked Today', value: analytics.totals.currentlyBookedToday },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-[#E8D8C8] rounded-xl p-4">
                  <p className="text-xs text-[#30252A]/65">{s.label}</p>
                  <p className="font-mono-tabular text-2xl font-bold text-[#641E36] mt-1">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
                <h4 className="font-display text-lg font-bold text-[#30252A]">
                  Usage by Laboratory (Approved Hours)
                </h4>
                <div className="space-y-3">
                  {analytics.byLab.map((lab) => {
                    const maxH = Math.max(1, ...analytics.byLab.map((l) => l.approvedHours));
                    const pct = Math.round((lab.approvedHours / maxH) * 100);
                    return (
                      <div key={lab.labName} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-[#30252A] truncate pr-2">
                            {lab.labName}
                          </span>
                          <span className="font-mono-tabular text-[#641E36] font-semibold">
                            {lab.approvedHours}h ({lab.bookingsCount} req)
                          </span>
                        </div>
                        <div className="h-2.5 bg-[#FAF6F0] rounded-full overflow-hidden border border-[#E8D8C8]/60">
                          <div className="h-full bg-[#641E36]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
                <h4 className="font-display text-lg font-bold text-[#30252A]">
                  Most Frequently Requested Equipment
                </h4>
                <div className="space-y-3">
                  {analytics.mostRequested.map((item) => {
                    const maxR = Math.max(1, ...analytics.mostRequested.map((m) => m.requests));
                    const pct = Math.round((item.requests / maxR) * 100);
                    return (
                      <div key={item.equipmentId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-[#30252A] truncate pr-2">
                            {item.name}
                          </span>
                          <span className="font-mono-tabular text-[#8F3453] font-semibold">
                            {item.requests}
                          </span>
                        </div>
                        <div className="h-2.5 bg-[#FAF6F0] rounded-full overflow-hidden border border-[#E8D8C8]/60">
                          <div className="h-full bg-[#C49A55]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
              <h4 className="font-display text-lg font-bold text-[#30252A]">
                8-Day Campus Booking Trend
              </h4>
              <div className="overflow-x-auto">
                <div className="min-w-[460px] grid grid-cols-8 gap-2 items-end h-40 pt-4">
                  {analytics.dailyTrend.map((d) => {
                    const maxD = Math.max(1, ...analytics.dailyTrend.map((x) => x.requests));
                    const hPct = Math.max(8, Math.round((d.requests / maxD) * 100));
                    return (
                      <div
                        key={d.date}
                        className="flex flex-col items-center gap-1.5 h-full justify-end"
                      >
                        <span className="font-mono-tabular text-[11px] font-semibold text-[#641E36]">
                          {d.requests}
                        </span>
                        <div
                          className="w-full max-w-[36px] bg-[#641E36] rounded-t-lg transition-all"
                          style={{ height: `${hPct}%` }}
                          title={`${d.date}: ${d.requests} requests (${d.approved} approved)`}
                        />
                        <span className="font-mono-tabular text-[10px] text-[#30252A]/70">
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fairness' && <FairAllocationDemo />}
      </div>
    </div>
  );
};
