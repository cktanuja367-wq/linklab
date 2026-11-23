import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  Layers,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../api';
import { EQUIPMENT_RESPONSIBILITY_AGREEMENT, getISTDateStr } from '../istTime';
import type { AlternativeSuggestion, CalendarResponse, CalendarSlot, Equipment } from '../types';

interface BookingModalProps {
  equipment: Equipment;
  allEquipment: Equipment[];
  studentName: string;
  studentCertifications: string[];
  initialStep?: 'details' | 'calendar' | 'project';
  initialProject?: { projectName?: string; projectDescription?: string; projectDeadline?: string };
  onClose: () => void;
  onBookingCreated: () => Promise<void>;
  onSelectEquipment: (eq: Equipment) => void;
}

type DurationPreset = 1 | 2 | 3 | 4 | 'custom';

export const BookingModal: React.FC<BookingModalProps> = ({
  equipment,
  allEquipment,
  studentName,
  studentCertifications,
  initialStep = 'calendar',
  initialProject,
  onClose,
  onBookingCreated,
  onSelectEquipment,
}) => {
  const [step, setStep] = useState<'details' | 'calendar' | 'project'>(initialStep);
  const defaultOperationalUnit =
    equipment.units.find((u) => u.status === 'available')?.id ?? equipment.units[0]?.id ?? 0;

  const [selectedUnitId, setSelectedUnitId] = useState<number>(defaultOperationalUnit);
  const [selectedDate, setSelectedDate] = useState<string>(getISTDateStr(0));
  const [durationMode, setDurationMode] = useState<DurationPreset>(1);
  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [startHour, setStartHour] = useState<number | null>(null);
  const [endHour, setEndHour] = useState<number | null>(null);

  const [projectName, setProjectName] = useState(initialProject?.projectName ?? '');
  const [projectDescription, setProjectDescription] = useState(
    initialProject?.projectDescription ?? ''
  );
  const [projectDeadline, setProjectDeadline] = useState(
    initialProject?.projectDeadline ?? getISTDateStr(4)
  );
  const [reason, setReason] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeSuggestion[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isCertified =
    !equipment.requiresCertification ||
    (equipment.certificationName ? studentCertifications.includes(equipment.certificationName) : true);

  const selectedUnit = equipment.units.find((u) => u.id === selectedUnitId) ?? equipment.units[0];
  const isUnitDamaged = selectedUnit?.status === 'damaged';
  const isUnitMaint = selectedUnit?.status === 'maintenance';
  const compatibleList = equipment.compatibleIds
    .map((id) => allEquipment.find((e) => e.id === id))
    .filter((e): e is Equipment => Boolean(e));

  useEffect(() => {
    const firstAvail =
      equipment.units.find((u) => u.status === 'available')?.id ?? equipment.units[0]?.id ?? 0;
    setSelectedUnitId(firstAvail);
    setStartHour(null);
    setEndHour(null);
    setAlternatives([]);
    setError(null);
    setSuccessMsg(null);
  }, [equipment.id]);

  const loadCalendar = async () => {
    setLoadingSlots(true);
    try {
      const data = await api.getCalendar(equipment.id, selectedDate, selectedUnitId || undefined);
      setCalendarData(data);
      if (data.isClosed) {
        setStartHour(null);
        setEndHour(null);
      }
    } catch {
      setCalendarData(null);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [equipment.id, selectedDate, selectedUnitId]);

  const slots = calendarData?.slots ?? [];

  const selectRangeFromStart = (baseHour: number, length: number) => {
    const windowSlots = slots.filter((s) => s.hour >= baseHour && s.hour < baseHour + length);
    const valid =
      windowSlots.length === length &&
      windowSlots.every((s) => !s.isPastToday && s.state === 'available');
    if (!valid) {
      setError(
        `A contiguous ${length}-hour slot starting at ${String(baseHour).padStart(2, '0')}:00 IST is not available.`
      );
      api
        .getAlternatives(equipment.id, selectedDate, baseHour, baseHour + length)
        .then((res) => setAlternatives(res.alternatives))
        .catch(() => {});
      return;
    }
    setError(null);
    setAlternatives([]);
    setStartHour(baseHour);
    setEndHour(baseHour + length);
  };

  const handleDurationPresetChange = (preset: DurationPreset) => {
    setDurationMode(preset);
    setError(null);
    if (preset !== 'custom' && startHour !== null) {
      selectRangeFromStart(startHour, preset);
    }
  };

  const handleSlotClick = (slot: CalendarSlot) => {
    if (slot.isPastToday) return;

    if (slot.state !== 'available') {
      const targetDur = durationMode === 'custom' ? 1 : durationMode;
      api
        .getAlternatives(equipment.id, selectedDate, slot.hour, slot.hour + targetDur)
        .then((res) => setAlternatives(res.alternatives))
        .catch(() => {});
      return;
    }

    if (durationMode !== 'custom') {
      selectRangeFromStart(slot.hour, durationMode);
      return;
    }

    setError(null);
    setAlternatives([]);
    if (startHour === null || (startHour !== null && endHour !== null && endHour - startHour > 1)) {
      setStartHour(slot.hour);
      setEndHour(slot.hour + 1);
    } else if (slot.hour > startHour && slot.hour < (calendarData?.closeHour ?? 17)) {
      const allOpen = slots
        .filter((s) => s.hour >= startHour && s.hour <= slot.hour)
        .every((s) => s.state === 'available' && !s.isPastToday);
      if (allOpen) {
        setEndHour(slot.hour + 1);
      } else {
        setStartHour(slot.hour);
        setEndHour(slot.hour + 1);
      }
    } else {
      setStartHour(slot.hour);
      setEndHour(slot.hour + 1);
    }
  };

  const applyAlternative = (alt: AlternativeSuggestion) => {
    if (alt.equipmentId !== equipment.id) {
      const target = allEquipment.find((e) => e.id === alt.equipmentId);
      if (target) onSelectEquipment(target);
    }
    setSelectedDate(alt.date);
    setSelectedUnitId(alt.unitId);
    setStartHour(alt.startHour);
    setEndHour(alt.endHour);
    setError(null);
    setAlternatives([]);
    setStep('project');
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startHour === null || endHour === null) {
      setError('Please select an available time slot on the calendar first.');
      setStep('calendar');
      return;
    }
    if (!isCertified) {
      setError(
        `Safety eligibility check failed: "${equipment.certificationName}" certification is mandatory before booking.`
      );
      return;
    }
    if (isUnitDamaged) {
      setError(
        `Unit ${selectedUnit?.unitCode} is locked pending faculty damage inspection and cannot be booked.`
      );
      return;
    }
    if (!agreementAccepted) {
      setError(
        'Please accept the Equipment Responsibility Agreement checkbox before confirming your request.'
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setAlternatives([]);

    try {
      const res = await api.createBooking({
        projectName,
        projectDescription,
        projectDeadline,
        reason,
        equipmentId: equipment.id,
        unitId: selectedUnitId,
        bookingDate: selectedDate,
        startHour,
        endHour,
        agreementAccepted: true,
      });

      setSuccessMsg(
        `Temporary hold #${res.booking.id} reserved for ${equipment.name} (${res.booking.unitCode}) on ${selectedDate} (${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00 IST). Priority Score: ${res.booking.priorityScore.toFixed(2)}. Responsibility Agreement logged at ${res.booking.agreementAcceptedAt ?? 'IST'}.`
      );
      setStartHour(null);
      setEndHour(null);
      await loadCalendar();
      await onBookingCreated();
    } catch (err) {
      const eObj = err as Error & { alternatives?: AlternativeSuggestion[] };
      setError(eObj.message);
      if (eObj.alternatives && eObj.alternatives.length > 0) {
        setAlternatives(eObj.alternatives);
      }
      await loadCalendar();
    } finally {
      setSubmitting(false);
    }
  };

  const availableStartSlots = slots.filter((s) => !s.isPastToday && s.state === 'available');

  return (
    <div
      className="fixed inset-0 z-50 bg-[#30252A]/60 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="bg-white border border-[#E8D8C8] rounded-2xl shadow-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-[#E8D8C8] px-5 sm:px-7 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#8F3453]">
              {equipment.category} · {equipment.blockName} · {equipment.floorLabel} · Room{' '}
              {equipment.roomCode} · {equipment.labName}
            </p>
            <h2
              id="booking-modal-title"
              className="font-display text-xl sm:text-2xl font-bold text-[#30252A] truncate"
            >
              {equipment.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-[#30252A]/70 hover:bg-[#FAF6F0] hover:text-[#641E36] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Tabs */}
        <div className="px-5 sm:px-7 py-3 bg-[#FAF6F0] border-b border-[#E8D8C8] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'details' as const, label: '01. Specs & Units' },
              { id: 'calendar' as const, label: '02. Live IST Schedule' },
              { id: 'project' as const, label: '03. Project & Responsibility' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStep(t.id)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  step === t.id
                    ? 'bg-[#641E36] text-white'
                    : 'bg-white text-[#30252A]/80 border border-[#E8D8C8] hover:border-[#641E36]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="font-mono-tabular text-[11px] text-[#30252A]/70">
            Timezone: India/Karnataka (IST)
          </span>
        </div>

        <div className="p-5 sm:p-7 space-y-6">
          {equipment.requiresCertification && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                isCertified
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {isCertified ? (
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {isCertified
                    ? `Safety Certified: ${equipment.certificationName}`
                    : `Mandatory Safety Certification Required: ${equipment.certificationName}`}
                </p>
                <p className="text-xs mt-0.5 opacity-85">
                  {isCertified
                    ? `Active safety clearance verified for ${studentName}. You may submit a booking request.`
                    : `Safety eligibility is enforced prior to booking and priority scoring. Please obtain faculty certification sign-off before reserving this instrument.`}
                </p>
              </div>
            </div>
          )}

          {isUnitDamaged && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">
                  Unit {selectedUnit?.unitCode} Locked — Pending Damage Inspection
                </p>
                <p className="text-xs mt-0.5">
                  A malfunction or damage report has been logged for this unit. It cannot be booked
                  until faculty marks it safe and available again.
                </p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Reservation Hold Logged</p>
                <p className="mt-1">{successMsg}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Unable to Complete Reservation</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* STEP 1: SPECS & COMPATIBILITY */}
          {step === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-5 space-y-4">
                <img
                  src={equipment.imageUrl}
                  alt={equipment.name}
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-[#E8D8C8]"
                  referrerPolicy="no-referrer"
                />
                <div className="text-sm space-y-2 text-[#30252A]/80">
                  <p className="flex items-start gap-2 font-medium text-[#30252A]">
                    <MapPin className="w-4 h-4 text-[#641E36] shrink-0 mt-0.5" />
                    <span>{equipment.location}</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-[#641E36] font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Today&apos;s Lab Hours: {equipment.todayOpenHours}
                  </p>
                  <p>{equipment.description}</p>
                </div>
              </div>

              <div className="md:col-span-7 space-y-5">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#30252A] mb-3">
                    Technical Specifications
                  </h3>
                  <dl className="divide-y divide-[#E8D8C8] border border-[#E8D8C8] rounded-xl bg-[#FAF6F0]/50">
                    {Object.entries(equipment.specs).map(([k, v]) => (
                      <div
                        key={k}
                        className="px-4 py-2.5 flex items-baseline justify-between gap-4 text-sm"
                      >
                        <dt className="text-[#30252A]/65 capitalize">
                          {k.replace(/([A-Z])/g, ' $1')}
                        </dt>
                        <dd className="font-mono-tabular text-[#30252A] text-right">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-[#30252A] mb-2">
                    Individual Units ({equipment.units.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {equipment.units.map((u) => (
                      <div
                        key={u.id}
                        className="p-3 rounded-lg border border-[#E8D8C8] bg-white flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="font-mono-tabular text-sm font-semibold text-[#641E36]">
                            {u.unitCode}
                          </p>
                          <p className="text-xs text-[#30252A]/65">{u.notes}</p>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            u.status === 'available'
                              ? 'text-emerald-700'
                              : u.status === 'damaged'
                                ? 'text-rose-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {u.status === 'available'
                            ? 'Operational'
                            : u.status === 'damaged'
                              ? 'Damaged Lock'
                              : 'Maintenance'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {compatibleList.length > 0 && (
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#30252A] mb-2">
                      Compatible Cross-Lab Alternatives
                    </h3>
                    <div className="space-y-2">
                      {compatibleList.map((alt) => (
                        <div
                          key={alt.id}
                          className="p-3 rounded-lg border border-[#E8D8C8] bg-[#FAF6F0] flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#30252A] truncate">
                              {alt.name}
                            </p>
                            <p className="text-xs text-[#30252A]/70">
                              {alt.blockName} · {alt.labName}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelectEquipment(alt)}
                            className="px-3 py-1.5 text-xs font-medium text-[#641E36] bg-white border border-[#E8D8C8] rounded-lg hover:border-[#641E36] whitespace-nowrap cursor-pointer"
                          >
                            Switch
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep('calendar')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
                  >
                    <span>Check Hourly Availability</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DYNAMIC IST HOURLY AVAILABILITY CALENDAR WITH DURATION SELECTOR */}
          {step === 'calendar' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#30252A]/70 mb-1.5">
                    Equipment Unit
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(Number(e.target.value));
                      setStartHour(null);
                      setEndHour(null);
                    }}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl text-[#30252A] focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                  >
                    {equipment.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitCode} —{' '}
                        {u.status === 'damaged'
                          ? 'Locked (Damage)'
                          : u.status === 'maintenance'
                            ? 'Maintenance'
                            : u.notes || 'Operational'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#30252A]/70 mb-1.5">
                    Date (India/Karnataka IST)
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    min={getISTDateStr(0)}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setStartHour(null);
                      setEndHour(null);
                    }}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl text-[#30252A] focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#30252A]/70 mb-1.5">
                    Booking Duration
                  </label>
                  <div className="grid grid-cols-5 gap-1 p-1 bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl">
                    {([1, 2, 3, 4, 'custom'] as DurationPreset[]).map((d) => (
                      <button
                        key={String(d)}
                        type="button"
                        onClick={() => handleDurationPresetChange(d)}
                        className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          durationMode === d
                            ? 'bg-[#641E36] text-white'
                            : 'text-[#30252A]/80 hover:text-[#641E36]'
                        }`}
                      >
                        {d === 'custom' ? 'Custom' : `${d}h`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom Start & End Hour Pickers */}
              {durationMode === 'custom' && calendarData && !calendarData.isClosed && (
                <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-[#30252A] mb-1">
                      Custom Start Time (IST)
                    </label>
                    <select
                      value={startHour ?? ''}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        if (!s) return;
                        setStartHour(s);
                        if (!endHour || endHour <= s) setEndHour(s + 1);
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                    >
                      <option value="">Select start hour...</option>
                      {availableStartSlots.map((s) => (
                        <option key={s.hour} value={s.hour}>
                          {String(s.hour).padStart(2, '0')}:00 IST
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#30252A] mb-1">
                      Custom End Time (IST)
                    </label>
                    <select
                      disabled={startHour === null}
                      value={endHour ?? ''}
                      onChange={(e) => {
                        const end = Number(e.target.value);
                        if (startHour !== null && end > startHour) {
                          selectRangeFromStart(startHour, end - startHour);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular disabled:opacity-50"
                    >
                      <option value="">Select end hour...</option>
                      {startHour !== null &&
                        calendarData.closeHour !== null &&
                        Array.from(
                          { length: calendarData.closeHour - startHour },
                          (_, i) => startHour + i + 1
                        ).map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, '0')}:00 IST ({h - startHour}h)
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Lab Operating Hours Banner */}
              {calendarData && (
                <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-medium text-[#30252A]">
                    <Clock className="w-4 h-4 text-[#641E36]" />
                    <span>
                      {calendarData.blockName} · {calendarData.floorLabel} · Room{' '}
                      {calendarData.roomCode} · {calendarData.labName}:{' '}
                      {calendarData.isClosed
                        ? calendarData.closedReason
                        : `Open ${String(calendarData.openHour).padStart(2, '0')}:00 – ${String(calendarData.closeHour).padStart(2, '0')}:00 IST`}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[#8F3453]">Live Database Schedule</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#30252A]/80 pb-2 border-b border-[#E8D8C8]">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Available
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Pending
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-sky-800">
                  <ShieldCheck className="w-4 h-4 text-sky-600" />
                  Approved
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-rose-800">
                  <X className="w-4 h-4 text-rose-600" />
                  Booked
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <Wrench className="w-4 h-4 text-slate-500" />
                  Maintenance
                </span>
              </div>

              {loadingSlots ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-16 rounded-xl bg-[#FAF6F0] animate-pulse border border-[#E8D8C8]"
                    />
                  ))}
                </div>
              ) : calendarData?.isClosed ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-[#E8D8C8] bg-[#FAF6F0]/60 space-y-3">
                  <Calendar className="w-8 h-8 text-[#641E36] mx-auto" />
                  <div>
                    <p className="font-display text-lg font-bold text-[#30252A]">
                      Laboratory Unavailable on {selectedDate}
                    </p>
                    <p className="text-sm text-[#30252A]/75 mt-1">
                      {calendarData.closedReason} Bookings are not permitted on Sundays, holidays,
                      or unavailable rooms.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getISTDateStr(1))}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg cursor-pointer"
                  >
                    Jump to Next Day (IST)
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {slots.map((slot) => {
                    const isSelected =
                      startHour !== null &&
                      endHour !== null &&
                      slot.hour >= startHour &&
                      slot.hour < endHour;

                    let styleClass =
                      'bg-emerald-50 border-emerald-300 text-emerald-900 hover:border-emerald-600';

                    if (slot.isPastToday) {
                      styleClass = 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed';
                    } else if (slot.state === 'pending') {
                      styleClass = 'bg-amber-50 border-amber-300 text-amber-900';
                    } else if (slot.state === 'approved') {
                      styleClass = 'bg-sky-50 border-sky-300 text-sky-900';
                    } else if (slot.state === 'booked') {
                      styleClass = 'bg-rose-50 border-rose-300 text-rose-900';
                    } else if (slot.state === 'maintenance') {
                      styleClass = 'bg-slate-100 border-slate-300 text-slate-600';
                    }

                    if (isSelected) {
                      styleClass = 'bg-[#641E36] border-[#641E36] text-white shadow-sm';
                    }

                    return (
                      <button
                        key={slot.hour}
                        type="button"
                        disabled={slot.isPastToday}
                        onClick={() => handleSlotClick(slot)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          slot.isPastToday ? 'cursor-not-allowed' : 'cursor-pointer'
                        } ${styleClass}`}
                      >
                        <p className="font-mono-tabular text-xs font-semibold">{slot.label}</p>
                        <p className="text-[11px] mt-1 opacity-90 truncate">
                          {isSelected ? 'Selected Slot' : slot.statusDetail}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {startHour !== null && endHour !== null && !isUnitDamaged && !isUnitMaint && (
                <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-[#30252A]/65">
                      Selected Bench Session ({endHour - startHour}h · IST)
                    </p>
                    <p className="text-sm font-semibold text-[#641E36]">
                      {equipment.name} ({selectedUnit?.unitCode}) · {selectedDate} ·{' '}
                      <span className="font-mono-tabular">
                        {String(startHour).padStart(2, '0')}:00 –{' '}
                        {String(endHour).padStart(2, '0')}:00 IST
                      </span>
                    </p>
                    <p className="text-xs text-[#30252A]/65 mt-0.5">
                      Submitting places a temporary hold until faculty review.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('project')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
                  >
                    <span>Continue to Project & Agreement</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: PROJECT-BASED ACCESS REQUEST & RESPONSIBILITY AGREEMENT */}
          {step === 'project' && (
            <form onSubmit={handleSubmitBooking} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#641E36]" />
                  <span>
                    <strong className="text-[#641E36]">{selectedUnit?.unitCode}</strong> on{' '}
                    <span className="font-mono-tabular">{selectedDate}</span>{' '}
                    {startHour !== null && endHour !== null
                      ? `(${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00 IST · ${endHour - startHour}h)`
                      : '(No slot selected yet)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('calendar')}
                  className="text-xs font-semibold text-[#641E36] hover:underline cursor-pointer"
                >
                  Change Slot
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#30252A] mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., IoT Smart Energy Monitor"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#30252A] mb-1">
                    Project Deadline (used for 60/40 Urgency Score)
                  </label>
                  <input
                    type="date"
                    required
                    min={getISTDateStr(0)}
                    value={projectDeadline}
                    onChange={(e) => setProjectDeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#30252A] mb-1">
                  Project Description
                </label>
                <textarea
                  required
                  rows={2}
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Describe your circuit, firmware, or mechanical subsystem..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#30252A] mb-1">
                  Reason for Requesting Access
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Need 100 MHz SPI signal capture before hardware freeze"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#641E36]"
                />
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#C49A55]/60 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-bold text-[#641E36]">
                  <FileCheck2 className="w-4 h-4 text-[#C49A55]" />
                  <span>Equipment Responsibility Agreement</span>
                </div>
                <p className="text-xs text-[#30252A]/85 leading-relaxed">
                  {EQUIPMENT_RESPONSIBILITY_AGREEMENT}
                </p>
                <ul className="text-[11px] text-[#30252A]/70 list-disc pl-4 space-y-0.5">
                  <li>
                    Handle all laboratory instruments carefully and follow faculty & safety
                    instructions.
                  </li>
                  <li>
                    Report any damage, fault, or malfunction immediately via{' '}
                    <strong>My Bookings → Report Damage</strong> (no automatic fine is applied upon
                    reporting).
                  </li>
                  <li>
                    Acceptance is logged in PostgreSQL with your verified profile ({studentName}),
                    equipment ID (#{equipment.id}), booking date ({selectedDate}), and IST
                    timestamp.
                  </li>
                </ul>
                <label className="flex items-start gap-2.5 pt-1 text-xs font-semibold text-[#30252A] cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={agreementAccepted}
                    onChange={(e) => setAgreementAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#641E36] cursor-pointer"
                  />
                  <span>
                    I accept the Equipment Responsibility Agreement and confirm I will handle{' '}
                    {equipment.name} carefully and report any issue immediately.
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('calendar')}
                  className="px-4 py-2.5 text-sm font-medium text-[#30252A] bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl hover:border-[#641E36] cursor-pointer"
                >
                  Back to Schedule
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting || !isCertified || !agreementAccepted || isUnitDamaged || isUnitMaint
                  }
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Submitting Request...'
                    : !isCertified
                      ? 'Safety Certification Required'
                      : isUnitDamaged
                        ? 'Unit Locked (Damage Reported)'
                        : 'Accept Agreement & Submit Booking'}
                </button>
              </div>
            </form>
          )}

          {/* CONFLICT RESOLUTION & COMPATIBILITY INTELLIGENCE PANEL */}
          {alternatives.length > 0 && (
            <div className="pt-4 border-t border-[#E8D8C8] space-y-3">
              <div className="flex items-center gap-2 text-[#641E36]">
                <Layers className="w-5 h-5" />
                <h3 className="font-display text-lg font-bold">
                  Conflict Resolution & Technically Compatible Alternatives
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {alternatives.map((alt, idx) => (
                  <div
                    key={`${alt.equipmentId}-${alt.unitId}-${alt.date}-${alt.startHour}-${idx}`}
                    className="p-4 rounded-xl border border-[#E8D8C8] bg-[#FAF6F0] flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-[#8F3453] font-medium mb-1">
                        <span>
                          {alt.type === 'compatible_equipment'
                            ? 'Cross-Lab Compatible Hardware'
                            : alt.type === 'unit'
                              ? 'Open Alternate Unit'
                              : 'Alternative Time Slot'}
                        </span>
                        <span className="font-mono-tabular">
                          Match {Math.round(alt.compatibilityScore * 100)}%
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-[#30252A]">{alt.equipmentName}</p>
                      <p className="text-xs text-[#30252A]/70 mt-0.5">
                        {alt.labName} · Unit {alt.unitCode} · {alt.date} (
                        {String(alt.startHour).padStart(2, '0')}:00–
                        {String(alt.endHour).padStart(2, '0')}:00 IST)
                      </p>
                      <p className="text-xs text-[#30252A] mt-2">{alt.explanation}</p>
                      <p className="text-xs text-[#30252A]/70 mt-1">
                        <strong>Limitations:</strong> {alt.limitations}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyAlternative(alt)}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg cursor-pointer"
                    >
                      Select This Alternative Slot
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
