import React, { useState } from 'react';
import { Calendar, CheckCircle2, Cpu, MapPin, ShieldAlert, Wrench } from 'lucide-react';
import type { Equipment } from '../types';

interface EquipmentCardProps {
  equipment: Equipment;
  studentCertified: boolean;
  onViewDetails: (equipment: Equipment) => void;
  onBookNow: (equipment: Equipment) => void;
}

export const EquipmentCard: React.FC<EquipmentCardProps> = ({
  equipment,
  studentCertified,
  onViewDetails,
  onBookNow,
}) => {
  const [imgError, setImgError] = useState(false);

  const specPairs = Object.entries(equipment.specs)
    .filter(([k, v]) => k !== 'notes' && v !== undefined)
    .slice(0, 3)
    .map(([k, v]) => ({
      label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      value: Array.isArray(v) ? v.slice(0, 4).join(', ') : String(v),
    }));

  const isRoomDown = !equipment.roomActive || equipment.roomStatus !== 'available';
  const isAllLocked = equipment.availableUnitsCount === 0;
  const hasDamagedUnits = equipment.damagedUnitsCount > 0;
  const hasSlotsToday = equipment.availableTodayCount > 0;
  const isLabClosedToday =
    equipment.todayOpenHours.toLowerCase().includes('closed') ||
    equipment.todayOpenHours.toLowerCase().includes('holiday');

  return (
    <article className="bg-white border border-[#E8D8C8] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-[#FAF6F0] overflow-hidden border-b border-[#E8D8C8]/70">
        {!imgError ? (
          <img
            src={equipment.imageUrl}
            alt={equipment.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.02]"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-[#FAF6F0] to-[#E8D8C8]/50">
            <Cpu className="w-10 h-10 text-[#641E36]/60 mb-2" />
            <span className="text-xs font-medium text-[#30252A]/70">{equipment.name}</span>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#30252A]/65 mb-1.5">
            <span className="font-medium text-[#8F3453]">{equipment.category}</span>
            <span aria-hidden="true">·</span>
            <span>
              {equipment.units.length} {equipment.units.length === 1 ? 'Unit' : 'Units'}
            </span>
            <span aria-hidden="true">·</span>
            {isRoomDown ? (
              <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                <Wrench className="w-3.5 h-3.5" />
                {equipment.roomStatus === 'maintenance' ? 'Room Maintenance' : 'Room Unavailable'}
              </span>
            ) : isAllLocked ? (
              <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                <Wrench className="w-3.5 h-3.5" />
                {hasDamagedUnits ? 'Locked (Inspection)' : 'Under Maintenance'}
              </span>
            ) : isLabClosedToday ? (
              <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Closed Today
              </span>
            ) : hasSlotsToday ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Available Today
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Fully Reserved Today
              </span>
            )}
          </div>

          <h3 className="font-display text-lg font-bold text-[#30252A] leading-snug mb-1.5">
            {equipment.name}
          </h3>

          <p className="text-sm text-[#30252A]/75 line-clamp-2 leading-relaxed mb-3">
            {equipment.description}
          </p>

          <div className="flex items-start gap-1.5 text-xs text-[#30252A]/75 mb-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#641E36] shrink-0 mt-0.5" />
            <span>
              {equipment.blockName} · {equipment.floorLabel} · Room {equipment.roomCode} ·{' '}
              {equipment.labName}
              {equipment.benchLocation ? ` · ${equipment.benchLocation}` : ''}
            </span>
          </div>

          <p className="text-[11px] font-mono-tabular text-[#30252A]/65 mb-3">
            Hours Today: {equipment.todayOpenHours}
            {hasDamagedUnits ? ` · ${equipment.damagedUnitsCount} unit locked (damage)` : ''}
          </p>

          {equipment.requiresCertification && (
            <div
              className={`text-xs flex items-center gap-1.5 mb-3 font-medium ${
                studentCertified ? 'text-emerald-700' : 'text-[#8F3453]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                {studentCertified
                  ? `Certified: ${equipment.certificationName}`
                  : `Safety Required: ${equipment.certificationName}`}
              </span>
            </div>
          )}

          {specPairs.length > 0 && (
            <dl className="border-t border-[#E8D8C8]/70 pt-3 space-y-1">
              {specPairs.map((sp) => (
                <div key={sp.label} className="flex items-baseline justify-between gap-2 text-xs">
                  <dt className="text-[#30252A]/60 shrink-0">{sp.label}</dt>
                  <dd className="font-mono-tabular text-[#30252A] text-right truncate">
                    {sp.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => onViewDetails(equipment)}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-[#641E36] bg-[#FAF6F0] hover:bg-[#E8D8C8]/60 border border-[#E8D8C8] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => onBookNow(equipment)}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {isRoomDown ? 'Check Schedule' : 'Book Now'}
          </button>
        </div>
      </div>
    </article>
  );
};
