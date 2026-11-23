import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  DoorOpen,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, type PortalPasswordStatus } from '../api';
import type {
  AffectedBookingSummary,
  CampusBlock,
  CampusFloor,
  Equipment,
  LabRoom,
  RoomStatus,
  UserProfile,
} from '../types';

type AdminTab = 'campus' | 'relocate' | 'students' | 'staff';

interface AdminDashboardProps {
  profile: UserProfile;
  onDataMutated: () => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ profile, onDataMutated }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('campus');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Data state
  const [blocks, setBlocks] = useState<CampusBlock[]>([]);
  const [floors, setFloors] = useState<CampusFloor[]>([]);
  const [rooms, setRooms] = useState<LabRoom[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [passwordStatus, setPasswordStatus] = useState<PortalPasswordStatus | null>(null);

  // Campus Forms
  const [blockName, setBlockName] = useState('');
  const [blockCode, setBlockCode] = useState('');
  const [blockDesc, setBlockDesc] = useState('');
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);

  const [floorBlockId, setFloorBlockId] = useState<number>(0);
  const [floorNumber, setFloorNumber] = useState<number>(1);
  const [floorLabel, setFloorLabel] = useState('');

  const [roomBlockId, setRoomBlockId] = useState<number>(0);
  const [roomFloorId, setRoomFloorId] = useState<number>(0);
  const [roomNumber, setRoomNumber] = useState('');
  const [labName, setLabName] = useState('');
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('available');
  const [openHour, setOpenHour] = useState<number>(9);
  const [closeHour, setCloseHour] = useState<number>(17);
  const [saturdayOpenHour, setSaturdayOpenHour] = useState<number>(9);
  const [saturdayCloseHour, setSaturdayCloseHour] = useState<number>(17);
  const [sundayClosed, setSundayClosed] = useState<boolean>(true);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);

  // Deactivation impact check modal
  const [deactivatingRoom, setDeactivatingRoom] = useState<LabRoom | null>(null);
  const [affectedBookings, setAffectedBookings] = useState<AffectedBookingSummary[]>([]);
  const [checkingImpact, setCheckingImpact] = useState(false);

  // Equipment relocation form
  const [moveEqId, setMoveEqId] = useState<number>(0);
  const [moveRoomId, setMoveRoomId] = useState<number>(0);
  const [moveBench, setMoveBench] = useState('');
  const [moveReason, setMoveReason] = useState('Laboratory equipment reallocation');

  // Portal Passwords update form
  const [newSharedPass, setNewSharedPass] = useState('');

  // Named Staff provisioning form
  const [staffEmail, setStaffEmail] = useState('');
  const [staffFullName, setStaffFullName] = useState('');
  const [staffDept, setStaffDept] = useState('Electronics & Instrumentation');
  const [staffRole, setStaffRole] = useState<'faculty' | 'admin'>('faculty');
  const [staffPassword, setStaffPassword] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const [campusRes, eqRes, studRes, staffRes] = await Promise.all([
        api.getAdminCampus(),
        api.getEquipment(),
        api.getAdminStudents(),
        api.getAdminFaculty(),
      ]);
      setBlocks(campusRes.blocks);
      setFloors(campusRes.floors);
      setRooms(campusRes.rooms);
      setEquipment(eqRes.equipment);
      setStudents(studRes.students);
      setStaffList(staffRes.staff);
      setPasswordStatus(staffRes.passwordStatus);

      if (campusRes.blocks.length > 0 && !floorBlockId) {
        setFloorBlockId(campusRes.blocks[0].id);
      }
      if (campusRes.blocks.length > 0 && !roomBlockId) {
        const firstBlock = campusRes.blocks[0].id;
        setRoomBlockId(firstBlock);
        const firstFloor = campusRes.floors.find((f) => f.blockId === firstBlock);
        if (firstFloor) setRoomFloorId(firstFloor.id);
      }
      if (eqRes.equipment.length > 0 && !moveEqId) {
        setMoveEqId(eqRes.equipment[0].id);
        setMoveBench(eqRes.equipment[0].benchLocation || '');
      }
      if (campusRes.rooms.length > 0 && !moveRoomId) {
        setMoveRoomId(campusRes.rooms[0].id);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to load Admin Dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile.role === 'admin') {
      loadAll();
    }
  }, [profile.id, profile.role]);

  if (profile.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto my-12 bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-3">
        <Shield className="w-10 h-10 text-rose-700 mx-auto" />
        <h2 className="font-display text-2xl font-bold text-[#30252A]">Administrator Access Only</h2>
        <p className="text-sm text-[#30252A]/75">
          Only Administrator accounts can manage campus blocks, floors, laboratory rooms, and staff
          portal passwords.
        </p>
      </div>
    );
  }

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      if (editingBlockId) {
        await api.updateBlock(editingBlockId, {
          name: blockName,
          code: blockCode,
          description: blockDesc,
        });
        setBanner(`Updated campus block "${blockName}".`);
      } else {
        await api.createBlock({ name: blockName, code: blockCode, description: blockDesc });
        setBanner(`Created campus block "${blockName}".`);
      }
      setBlockName('');
      setBlockCode('');
      setBlockDesc('');
      setEditingBlockId(null);
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save block.');
    }
  };

  const handleToggleBlockActive = async (b: CampusBlock) => {
    setErrorBanner(null);
    try {
      await api.updateBlock(b.id, { isActive: !b.isActive });
      setBanner(`${b.name} ${b.isActive ? 'deactivated' : 'activated'}.`);
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update block status.');
    }
  };

  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      await api.createFloor({ blockId: floorBlockId, floorNumber, label: floorLabel });
      setFloorLabel('');
      setBanner(`Added floor "${floorLabel}".`);
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to create floor.');
    }
  };

  const handleToggleFloorActive = async (f: CampusFloor) => {
    try {
      await api.updateFloor(f.id, { isActive: !f.isActive });
      setBanner(`Floor "${f.label}" ${f.isActive ? 'deactivated' : 'activated'}.`);
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update floor.');
    }
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      if (editingRoomId) {
        await api.updateRoom(editingRoomId, {
          blockId: roomBlockId,
          floorId: roomFloorId,
          roomNumber,
          labName,
          status: roomStatus,
          openHour,
          closeHour,
          saturdayOpenHour,
          saturdayCloseHour,
          sundayClosed,
        });
        setBanner(
          `Updated Room ${roomNumber} (${labName}). Existing bookings keep original snapshot locations.`
        );
      } else {
        await api.createRoom({
          blockId: roomBlockId,
          floorId: roomFloorId,
          roomNumber,
          labName,
          status: roomStatus,
          openHour,
          closeHour,
          saturdayOpenHour,
          saturdayCloseHour,
          sundayClosed,
        });
        setBanner(`Created Room ${roomNumber} (${labName}).`);
      }
      setEditingRoomId(null);
      setRoomNumber('');
      setLabName('');
      setRoomStatus('available');
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save laboratory room.');
    }
  };

  const startEditRoom = (r: LabRoom) => {
    setEditingRoomId(r.id);
    setRoomBlockId(r.blockId);
    setRoomFloorId(r.floorId);
    setRoomNumber(r.roomNumber);
    setLabName(r.labName);
    setRoomStatus(r.status);
    setOpenHour(r.openHour);
    setCloseHour(r.closeHour);
    setSaturdayOpenHour(r.saturdayOpenHour);
    setSaturdayCloseHour(r.saturdayCloseHour);
    setSundayClosed(r.sundayClosed);
  };

  const handleInitiateRoomToggle = async (room: LabRoom) => {
    setErrorBanner(null);
    if (!room.isActive) {
      await api.deactivateRoom(room.id, { isActive: true, confirmed: true });
      setBanner(`Reactivated Room ${room.roomNumber} (${room.labName}).`);
      await loadAll();
      await onDataMutated();
      return;
    }

    setCheckingImpact(true);
    setDeactivatingRoom(room);
    try {
      const res = await api.getRoomAffectedBookings(room.id);
      setAffectedBookings(res.affectedBookings);
    } catch (err) {
      setDeactivatingRoom(null);
      setErrorBanner(err instanceof Error ? err.message : 'Failed to inspect affected bookings.');
    } finally {
      setCheckingImpact(false);
    }
  };

  const handleConfirmRoomDeactivate = async () => {
    if (!deactivatingRoom) return;
    try {
      await api.deactivateRoom(deactivatingRoom.id, { isActive: false, confirmed: true });
      setBanner(
        `Deactivated Room ${deactivatingRoom.roomNumber} (${deactivatingRoom.labName}). Existing bookings retained their historical room snapshot.`
      );
      setDeactivatingRoom(null);
      setAffectedBookings([]);
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to deactivate room.');
    }
  };

  const handleMoveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveEqId || !moveRoomId) return;
    setErrorBanner(null);
    try {
      const res = await api.moveEquipment(moveEqId, {
        roomId: moveRoomId,
        benchLocation: moveBench,
        reason: moveReason,
      });
      setBanner(
        `Moved "${res.equipment.name}" to ${res.equipment.blockName} · Room ${res.equipment.roomCode} (${res.equipment.labName}). Historical bookings retain their original room details.`
      );
      await loadAll();
      await onDataMutated();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to move equipment.');
    }
  };

  const handleUpdateSharedPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (newSharedPass.trim().length < 4) {
      setErrorBanner('Password must be at least 4 characters long.');
      return;
    }
    try {
      const res = await api.updatePortalPasswords({
        targetRole: 'both',
        newPassword: newSharedPass.trim(),
      });
      setPasswordStatus(res.passwordStatus);
      setNewSharedPass('');
      setBanner('Updated shared Faculty & Administrator portal password in SQLite.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to update portal password.');
    }
  };

  const handleProvisionStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      const res = await api.createOrPromoteFaculty({
        email: staffEmail || undefined,
        fullName: staffFullName,
        department: staffDept,
        password: staffPassword || undefined,
        role: staffRole,
      });
      setBanner(`Staff account active: ${res.staff.fullName} (${res.staff.role}).`);
      setStaffEmail('');
      setStaffFullName('');
      setStaffPassword('');
      await loadAll();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save staff account.');
    }
  };

  const floorsForSelectedRoomBlock = floors.filter((f) => f.blockId === roomBlockId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar */}
      <aside className="lg:col-span-3 space-y-4">
        <div className="bg-white border border-[#E8D8C8] rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8F3453] px-2 pb-1">
            Campus Administrator
          </p>
          {[
            { id: 'campus' as const, label: 'Blocks, Floors & Rooms', icon: <Building2 className="w-4 h-4" /> },
            { id: 'relocate' as const, label: 'Move Equipment', icon: <ArrowRightLeft className="w-4 h-4" /> },
            {
              id: 'students' as const,
              label: `Student Roster (${students.length})`,
              icon: <UserCheck className="w-4 h-4" />,
            },
            { id: 'staff' as const, label: 'Passwords & Staff', icon: <Users className="w-4 h-4" /> },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors text-left cursor-pointer ${
                activeTab === item.id
                  ? 'bg-[#641E36] text-white'
                  : 'text-[#30252A]/80 hover:bg-[#FAF6F0]'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#641E36] bg-white border border-[#E8D8C8] rounded-xl hover:border-[#641E36] cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Admin Records</span>
        </button>
      </aside>

      {/* Main Content */}
      <div className="lg:col-span-9 space-y-6 min-w-0">
        {banner && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
            <span>{banner}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="font-semibold underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="font-semibold underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: DYNAMIC CAMPUS BLOCKS, FLOORS & ROOMS */}
        {activeTab === 'campus' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
              <div>
                <p className="text-xs font-medium text-[#8F3453]">
                  Editable SQLite Campus Locations
                </p>
                <h2 className="font-display text-2xl font-bold text-[#30252A]">
                  1. Campus Blocks ({blocks.length})
                </h2>
              </div>

              <form onSubmit={handleSaveBlock} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={blockName}
                  onChange={(e) => setBlockName(e.target.value)}
                  placeholder="Block Name (e.g., Science Block)"
                  className="px-3.5 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="text"
                  value={blockCode}
                  onChange={(e) => setBlockCode(e.target.value)}
                  placeholder="Short Code (e.g., BLK-A)"
                  className="px-3.5 py-2 text-sm font-mono-tabular bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="text"
                  value={blockDesc}
                  onChange={(e) => setBlockDesc(e.target.value)}
                  placeholder="Description / Wing"
                  className="px-3.5 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{editingBlockId ? 'Update Block' : 'Add Block'}</span>
                  </button>
                  {editingBlockId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBlockId(null);
                        setBlockName('');
                        setBlockCode('');
                        setBlockDesc('');
                      }}
                      className="px-3 py-2 text-xs bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {blocks.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {blocks.map((b) => (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                        b.isActive ? 'bg-[#FAF6F0]/60 border-[#E8D8C8]' : 'bg-slate-50 border-slate-200 opacity-75'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-[#30252A]">{b.name}</span>
                          {b.code && (
                            <span className="font-mono-tabular text-[11px] text-[#8F3453]">
                              {b.code}
                            </span>
                          )}
                        </div>
                        {b.description && (
                          <p className="text-xs text-[#30252A]/70 mt-0.5">{b.description}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E8D8C8]/70">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBlockId(b.id);
                            setBlockName(b.name);
                            setBlockCode(b.code);
                            setBlockDesc(b.description);
                          }}
                          className="font-semibold text-[#641E36] hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBlockActive(b)}
                          className={`font-medium cursor-pointer ${
                            b.isActive ? 'text-rose-700 hover:underline' : 'text-emerald-700 hover:underline'
                          }`}
                        >
                          {b.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Floors */}
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
              <h3 className="font-display text-xl font-bold text-[#30252A] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#641E36]" />
                <span>2. Building Floors ({floors.length})</span>
              </h3>

              <form onSubmit={handleCreateFloor} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  required
                  value={floorBlockId}
                  onChange={(e) => setFloorBlockId(Number(e.target.value))}
                  className="px-3.5 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value={0}>Select Campus Block...</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
                  value={floorNumber}
                  onChange={(e) => setFloorNumber(Number(e.target.value))}
                  placeholder="Floor # (0, 1, 2...)"
                  className="px-3.5 py-2 text-sm font-mono-tabular bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="text"
                  required
                  value={floorLabel}
                  onChange={(e) => setFloorLabel(e.target.value)}
                  placeholder="Label (e.g., 2nd Floor)"
                  className="px-3.5 py-2 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <button
                  type="submit"
                  disabled={!floorBlockId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Add Floor
                </button>
              </form>

              {floors.length > 0 && (
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {floors.map((f) => (
                    <div
                      key={f.id}
                      className="px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8] text-xs flex items-center gap-2.5"
                    >
                      <span className="font-medium text-[#30252A]">
                        {f.blockName} · {f.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleFloorActive(f)}
                        className={`font-semibold cursor-pointer ${
                          f.isActive ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {f.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Rooms & Technical Labs */}
            <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="font-display text-xl font-bold text-[#30252A] flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-[#641E36]" />
                  <span>3. Laboratory Rooms & Schedules ({rooms.length})</span>
                </h3>
                <p className="text-xs text-[#30252A]/75 mt-1">
                  Default schedule: Monday–Saturday 09:00–17:00 IST, Sundays closed. Deactivating a
                  room checks for affected future bookings first and preserves snapshots on past
                  bookings.
                </p>
              </div>

              <form onSubmit={handleSaveRoom} className="space-y-3 p-4 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8]">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    required
                    value={roomBlockId}
                    onChange={(e) => {
                      const nextBlock = Number(e.target.value);
                      setRoomBlockId(nextBlock);
                      const firstF = floors.find((f) => f.blockId === nextBlock);
                      setRoomFloorId(firstF ? firstF.id : 0);
                    }}
                    className="px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                  >
                    <option value={0}>Select Campus Block...</option>
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <select
                    required
                    value={roomFloorId}
                    onChange={(e) => setRoomFloorId(Number(e.target.value))}
                    className="px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                  >
                    <option value={0}>Select Floor...</option>
                    {floorsForSelectedRoomBlock.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={roomStatus}
                    onChange={(e) => setRoomStatus(e.target.value as RoomStatus)}
                    className="px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                  >
                    <option value="available">Status: Available</option>
                    <option value="unavailable">Status: Unavailable</option>
                    <option value="maintenance">Status: Under Maintenance</option>
                  </select>

                  <input
                    type="text"
                    required
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="Room Number (e.g., 204)"
                    className="px-3 py-2 text-sm font-mono-tabular bg-white border border-[#E8D8C8] rounded-xl"
                  />
                  <input
                    type="text"
                    required
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                    placeholder="Technical Lab Name"
                    className="px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl sm:col-span-2"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <label className="block">
                    <span className="text-[#30252A]/70">Mon–Fri Open (IST)</span>
                    <input
                      type="number"
                      min={6}
                      max={16}
                      value={openHour}
                      onChange={(e) => setOpenHour(Number(e.target.value))}
                      className="mt-0.5 w-full px-2.5 py-1.5 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[#30252A]/70">Mon–Fri Close</span>
                    <input
                      type="number"
                      min={10}
                      max={22}
                      value={closeHour}
                      onChange={(e) => setCloseHour(Number(e.target.value))}
                      className="mt-0.5 w-full px-2.5 py-1.5 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[#30252A]/70">Sat Open</span>
                    <input
                      type="number"
                      min={6}
                      max={16}
                      value={saturdayOpenHour}
                      onChange={(e) => setSaturdayOpenHour(Number(e.target.value))}
                      className="mt-0.5 w-full px-2.5 py-1.5 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[#30252A]/70">Sat Close</span>
                    <input
                      type="number"
                      min={10}
                      max={22}
                      value={saturdayCloseHour}
                      onChange={(e) => setSaturdayCloseHour(Number(e.target.value))}
                      className="mt-0.5 w-full px-2.5 py-1.5 bg-white border border-[#E8D8C8] rounded-lg font-mono-tabular"
                    />
                  </label>
                  <label className="flex items-center gap-2 pt-4 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sundayClosed}
                      onChange={(e) => setSundayClosed(e.target.checked)}
                      className="accent-[#641E36]"
                    />
                    <span>Sunday Closed</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={!roomBlockId || !roomFloorId}
                    className="px-5 py-2 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {editingRoomId ? 'Save Room Changes' : 'Create Laboratory Room'}
                  </button>
                  {editingRoomId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoomId(null);
                        setRoomNumber('');
                        setLabName('');
                      }}
                      className="px-4 py-2 text-xs bg-white border border-[#E8D8C8] rounded-xl cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>

              <div className="overflow-x-auto border border-[#E8D8C8] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-[#30252A]/75">
                    <tr>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Technical Lab</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">IST Hours</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8D8C8]">
                    {rooms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[#30252A]/65">
                          No laboratory rooms configured yet. Create a Block, Floor, and Room above.
                        </td>
                      </tr>
                    ) : (
                      rooms.map((r) => (
                        <tr key={r.id} className={!r.isActive ? 'bg-slate-50 opacity-75' : ''}>
                          <td className="py-3 px-4 font-medium text-[#30252A]">
                            {r.blockName} · {r.floorLabel} · Room{' '}
                            <span className="font-mono-tabular text-[#641E36]">{r.roomNumber}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-[#30252A]">{r.labName}</span>
                            <span className="text-[#30252A]/60 ml-1.5">
                              ({r.equipmentCount ?? 0} eq)
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold capitalize">
                            {!r.isActive ? (
                              <span className="text-slate-600">Deactivated</span>
                            ) : r.status === 'available' ? (
                              <span className="text-emerald-700">Available</span>
                            ) : r.status === 'maintenance' ? (
                              <span className="text-amber-700">Maintenance</span>
                            ) : (
                              <span className="text-rose-700">Unavailable</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-[#30252A]/75">
                            Mon–Fri {String(r.openHour).padStart(2, '0')}:00–
                            {String(r.closeHour).padStart(2, '0')}:00 · Sat{' '}
                            {String(r.saturdayOpenHour).padStart(2, '0')}:00–
                            {String(r.saturdayCloseHour).padStart(2, '0')}:00
                          </td>
                          <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEditRoom(r)}
                              className="font-semibold text-[#641E36] hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInitiateRoomToggle(r)}
                              className={`font-semibold cursor-pointer ${
                                r.isActive
                                  ? 'text-rose-700 hover:underline'
                                  : 'text-emerald-700 hover:underline'
                              }`}
                            >
                              {r.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RELOCATE EQUIPMENT */}
        {activeTab === 'relocate' && (
          <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#30252A]">
                Move Equipment Between Rooms
              </h2>
              <p className="text-xs text-[#30252A]/75 mt-1">
                Relocating equipment updates its active campus room for future reservations while
                all existing bookings preserve their exact historical location snapshots.
              </p>
            </div>

            <form onSubmit={handleMoveEquipment} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8]">
              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Equipment to Move
                </label>
                <select
                  value={moveEqId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setMoveEqId(id);
                    const found = equipment.find((x) => x.id === id);
                    if (found) setMoveBench(found.benchLocation || '');
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                >
                  {equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} (Currently: {eq.blockName} · Room {eq.roomCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Target Laboratory Room
                </label>
                <select
                  value={moveRoomId}
                  onChange={(e) => setMoveRoomId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                >
                  {rooms.filter((r) => r.isActive).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.blockName} · {r.floorLabel} · Room {r.roomNumber} ({r.labName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Bench / Bay Label
                </label>
                <input
                  type="text"
                  value={moveBench}
                  onChange={(e) => setMoveBench(e.target.value)}
                  placeholder="e.g., Bench 04"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#30252A] mb-1">
                  Relocation Audit Reason
                </label>
                <input
                  type="text"
                  required
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!moveEqId || !moveRoomId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer disabled:opacity-50"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Confirm Equipment Relocation</span>
                </button>
              </div>
            </form>

            <div className="overflow-x-auto border border-[#E8D8C8] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-[#30252A]/75">
                  <tr>
                    <th className="py-3 px-4">Equipment</th>
                    <th className="py-3 px-4">Current Campus Location</th>
                    <th className="py-3 px-4">Room Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D8C8]">
                  {equipment.map((eq) => (
                    <tr key={eq.id}>
                      <td className="py-3 px-4 font-semibold text-[#30252A]">{eq.name}</td>
                      <td className="py-3 px-4 text-[#30252A]/80">{eq.location}</td>
                      <td className="py-3 px-4 font-semibold capitalize text-[#641E36]">
                        {eq.roomActive ? eq.roomStatus : 'Room Deactivated'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: STUDENT ROSTER (NAME-ONLY ACCESS) */}
        {activeTab === 'students' && (
          <div className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#30252A]">
                Student Sessions ({students.length})
              </h2>
              <p className="text-xs text-[#30252A]/75 mt-0.5">
                Students sign in directly with their name — no registration required. You can
                suspend or restore individual student access here if needed.
              </p>
            </div>

            <div className="overflow-x-auto border border-[#E8D8C8] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-[#30252A]/75">
                  <tr>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">First Sign-In</th>
                    <th className="py-3 px-4">Access Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D8C8]">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-[#30252A]/65">
                        No students have signed in yet.
                      </td>
                    </tr>
                  ) : (
                    students.map((st) => (
                      <tr key={st.id}>
                        <td className="py-3 px-4 font-semibold text-[#30252A]">{st.fullName}</td>
                        <td className="py-3 px-4 font-mono-tabular text-[#30252A]/70">
                          {st.createdAt.slice(0, 10)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={
                              st.isActive
                                ? 'text-emerald-700 font-semibold'
                                : 'text-rose-700 font-semibold'
                            }
                          >
                            {st.isActive ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await api.updateStaffAccount(st.id, { isActive: !st.isActive });
                              await loadAll();
                            }}
                            className="font-semibold text-[#641E36] hover:underline cursor-pointer"
                          >
                            {st.isActive ? 'Suspend' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PORTAL PASSWORDS & FACULTY/ADMIN ACCOUNTS */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            {/* Update Shared Faculty & Admin Portal Password */}
            <form
              onSubmit={handleUpdateSharedPassword}
              className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#30252A] flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#641E36]" />
                    <span>Faculty &amp; Admin Shared Password</span>
                  </h2>
                  <p className="text-xs text-[#30252A]/75 mt-1">
                    One shared password unlocks both the Faculty Portal and Administrator
                    Dashboard. Stored hashed with salted scrypt in SQLite.
                  </p>
                </div>
                <span className="text-[11px] font-mono-tabular px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#E8D8C8] text-[#30252A]/75">
                  {passwordStatus?.envFacultyOverride || passwordStatus?.envAdminOverride
                    ? 'Environment passcode override active'
                    : passwordStatus?.passwordsConfigured
                      ? 'Shared password active'
                      : 'Not configured'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl bg-[#FAF6F0] border border-[#E8D8C8]">
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newSharedPass}
                  onChange={(e) => setNewSharedPass(e.target.value)}
                  placeholder="Enter new shared Faculty & Admin password (min 4 chars)"
                  className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-[#E8D8C8] rounded-xl"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer whitespace-nowrap"
                >
                  Update Shared Password
                </button>
              </div>
            </form>

            <form
              onSubmit={handleProvisionStaff}
              className="bg-white border border-[#E8D8C8] rounded-2xl p-6 space-y-4"
            >
              <div>
                <h3 className="font-display text-xl font-bold text-[#30252A] flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#641E36]" />
                  <span>Add or Manage Named Staff Profile</span>
                </h3>
                <p className="text-xs text-[#30252A]/75 mt-1">
                  Optionally pre-register named faculty/admin members with their department or an
                  individual password.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={staffFullName}
                  onChange={(e) => setStaffFullName(e.target.value)}
                  placeholder="Faculty / Staff Full Name"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <input
                  type="text"
                  required
                  value={staffDept}
                  onChange={(e) => setStaffDept(e.target.value)}
                  placeholder="Department"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                />
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as 'faculty' | 'admin')}
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl"
                >
                  <option value="faculty">Role: Faculty (Approve bookings, damage & maintenance)</option>
                  <option value="admin">Role: Administrator (Full campus & password control)</option>
                </select>
                <input
                  type="password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="Optional personal password (min 4 chars; blank uses shared portal password)"
                  className="px-3.5 py-2.5 text-sm bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl sm:col-span-2"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#641E36] hover:bg-[#8F3453] rounded-xl cursor-pointer"
              >
                Save Staff Profile
              </button>
            </form>

            <div className="bg-white border border-[#E8D8C8] rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF6F0] border-b border-[#E8D8C8] text-[#30252A]/75">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Account</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8D8C8]">
                  {staffList.map((st) => (
                    <tr key={st.id}>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#30252A]">{st.fullName}</p>
                        {st.email && <p className="text-[#30252A]/65">{st.email}</p>}
                      </td>
                      <td className="py-3 px-4">{st.department}</td>
                      <td className="py-3 px-4 font-semibold uppercase text-[#641E36]">
                        {st.role}
                      </td>
                      <td className="py-3 px-4">
                        <span className={st.isActive ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                          {st.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {st.id !== profile.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await api.updateStaffAccount(st.id, { isActive: !st.isActive });
                              await loadAll();
                            }}
                            className="font-semibold text-[#641E36] hover:underline cursor-pointer"
                          >
                            {st.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        ) : (
                          <span className="text-[#30252A]/50">Current Admin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PRE-DEACTIVATION AFFECTED BOOKINGS MODAL */}
      {deactivatingRoom && (
        <div
          className="fixed inset-0 z-50 bg-[#30252A]/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E8D8C8] rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E8D8C8]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-[#8F3453]">Room Deactivation Impact Check</p>
                  <h3 className="font-display text-xl font-bold text-[#30252A]">
                    Deactivate Room {deactivatingRoom.roomNumber} ({deactivatingRoom.labName})?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeactivatingRoom(null)}
                className="p-1.5 text-[#30252A]/60 hover:text-[#641E36] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {checkingImpact ? (
              <p className="text-sm text-[#30252A]/75 py-4">
                Checking active & upcoming bookings in Room {deactivatingRoom.roomNumber}...
              </p>
            ) : affectedBookings.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  No future pending or approved bookings will be affected in this room.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <strong>{affectedBookings.length} future booking(s)</strong> currently reference
                  equipment in this room. Deactivating the room stops new reservations while
                  preserving original snapshot room details on these existing records.
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-[#E8D8C8] border border-[#E8D8C8] rounded-xl text-xs">
                  {affectedBookings.map((ab) => (
                    <div key={ab.id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#30252A]">
                          #{ab.id} · {ab.equipmentName} ({ab.unitCode})
                        </p>
                        <p className="text-[#30252A]/75">
                          Student: {ab.studentName} · Project: {ab.projectName}
                        </p>
                      </div>
                      <div className="text-right font-mono-tabular shrink-0">
                        <p className="font-semibold text-[#641E36]">{ab.bookingDate}</p>
                        <p className="text-[#30252A]/70">
                          {String(ab.startHour).padStart(2, '0')}:00–
                          {String(ab.endHour).padStart(2, '0')}:00 IST ({ab.status})
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingRoom(null)}
                className="px-4 py-2 text-xs font-medium text-[#30252A] bg-[#FAF6F0] border border-[#E8D8C8] rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={checkingImpact}
                onClick={handleConfirmRoomDeactivate}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-xl cursor-pointer"
              >
                {affectedBookings.length > 0
                  ? `Confirm Deactivation (${affectedBookings.length} Affected)`
                  : 'Confirm Room Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
