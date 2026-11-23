import { getAccessToken } from './lib/auth';
import type {
  AffectedBookingSummary,
  AIDiscoveryResponse,
  AlternativeSuggestion,
  Booking,
  CalendarResponse,
  CampusBlock,
  CampusFloor,
  CertificationRecord,
  DamageReport,
  DamageStatus,
  Equipment,
  FairnessContenderInput,
  FairnessSimulationResponse,
  LabAnalytics,
  LabHoliday,
  LabRoom,
  MaintenanceRecord,
  NotificationItem,
  ProjectPlanResponse,
  ResponsibilityDecision,
  RescueProposal,
  RoomStatus,
  UserProfile,
  UserRole,
} from './types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface PortalPasswordStatus {
  facultyConfigured: boolean;
  adminConfigured: boolean;
  passwordsConfigured: boolean;
  envFacultyOverride: boolean;
  envAdminOverride: boolean;
}

export interface ConfigStatusResponse extends PortalPasswordStatus {
  database: 'sqlite';
  timezone: 'Asia/Kolkata';
  todayIST: string;
  istNow: string;
  agreementText: string;
}

export interface CampusPayload {
  timezone: 'Asia/Kolkata';
  todayIST: string;
  istNow: string;
  agreementText: string;
  blocks: CampusBlock[];
  floors: CampusFloor[];
  rooms: LabRoom[];
  holidays: LabHoliday[];
}

export interface FairnessSummary {
  hoursUsed: number;
  approvedCount: number;
  completedCount: number;
  cancellationCount: number;
  noShowCount: number;
  usageFairnessU: number;
}

async function requestJson<T>(urlPath: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${urlPath}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      safetyRequired?: string;
      alternatives?: AlternativeSuggestion[];
      requiresConfirmation?: boolean;
      affectedBookings?: AffectedBookingSummary[];
    };
    err.status = res.status;
    err.safetyRequired = data.safetyRequired;
    err.alternatives = data.alternatives;
    err.requiresConfirmation = data.requiresConfirmation;
    err.affectedBookings = data.affectedBookings;
    throw err;
  }
  return data as T;
}

export const api = {
  getConfigStatus() {
    return requestJson<ConfigStatusResponse>('/api/config/status');
  },

  studentLogin(name: string) {
    return requestJson<{ profile: UserProfile; token: string }>('/api/auth/student-login', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  setupStaffPasswords(payload: {
    password?: string;
    facultyPassword?: string;
    adminPassword?: string;
  }) {
    return requestJson<{ ok: boolean } & PortalPasswordStatus>('/api/auth/setup-staff-passwords', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  staffLogin(payload: { role: 'faculty' | 'admin'; name?: string; password: string }) {
    return requestJson<{ profile: UserProfile; token: string }>('/api/auth/staff-login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAuthMe() {
    return requestJson<{
      profile: UserProfile;
      certifications: CertificationRecord[];
      fairnessHistory: FairnessSummary;
    }>('/api/auth/me');
  },

  getCampus() {
    return requestJson<CampusPayload>('/api/campus');
  },

  getEquipment() {
    return requestJson<{ equipment: Equipment[] }>('/api/equipment');
  },

  getCalendar(equipmentId: number, date: string, unitId?: number) {
    const qs = new URLSearchParams({ date });
    if (unitId) qs.set('unitId', String(unitId));
    return requestJson<CalendarResponse>(`/api/equipment/${equipmentId}/calendar?${qs.toString()}`);
  },

  getAlternatives(equipmentId: number, date: string, startHour: number, endHour: number) {
    const qs = new URLSearchParams({
      date,
      startHour: String(startHour),
      endHour: String(endHour),
    });
    return requestJson<{ alternatives: AlternativeSuggestion[] }>(
      `/api/equipment/${equipmentId}/alternatives?${qs.toString()}`
    );
  },

  discoverEquipment(query: string) {
    return requestJson<AIDiscoveryResponse>('/api/ai/discover', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  },

  generateProjectPlan(payload: {
    projectName: string;
    projectDescription: string;
    deadline: string;
  }) {
    return requestJson<ProjectPlanResponse>('/api/ai/project-plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getStudentBookings() {
    return requestJson<{
      bookings: Booking[];
      fairnessHistory: FairnessSummary;
    }>('/api/bookings');
  },

  createBooking(payload: {
    projectName: string;
    projectDescription: string;
    projectDeadline: string;
    reason: string;
    equipmentId: number;
    unitId: number;
    bookingDate: string;
    startHour: number;
    endHour: number;
    agreementAccepted: boolean;
  }) {
    return requestJson<{ booking: Booking }>('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  cancelBooking(bookingId: number) {
    return requestJson<{ booking: Booking }>(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
    });
  },

  getStudentDamageReports() {
    return requestJson<{ damageReports: DamageReport[] }>('/api/damage-reports');
  },

  reportDamage(payload: { bookingId: number; description: string; reportedAt?: string }) {
    return requestJson<{ damageReport: DamageReport }>('/api/damage-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getNotifications() {
    return requestJson<{ notifications: NotificationItem[]; rescueProposals: RescueProposal[] }>(
      '/api/notifications'
    );
  },

  markNotificationRead(id: number) {
    return requestJson<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' });
  },

  acceptRescueProposal(proposalId: number) {
    return requestJson<{ proposal: RescueProposal; newBooking: Booking }>(
      `/api/rescue-proposals/${proposalId}/accept`,
      { method: 'POST' }
    );
  },

  getDefaultSimulation() {
    return requestJson<FairnessSimulationResponse>('/api/allocation/simulation/defaults');
  },

  runFairAllocationSimulation(payload: {
    contenders: FairnessContenderInput[];
    equipmentName?: string;
    requiredCertification?: string;
  }) {
    return requestJson<FairnessSimulationResponse>('/api/allocation/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ================= PROTECTED FACULTY / ADMIN ENDPOINTS =================
  getAnalytics() {
    return requestJson<LabAnalytics>('/api/analytics');
  },

  getFacultyBookings() {
    return requestJson<{ bookings: Booking[] }>('/api/faculty/bookings');
  },

  decideBooking(
    bookingId: number,
    payload: {
      decision: 'approve' | 'reject' | 'complete' | 'no_show';
      rejectionReason?: string;
      suggestedSlot?: string;
    }
  ) {
    return requestJson<{ booking: Booking }>(`/api/faculty/bookings/${bookingId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createEquipment(payload: {
    name: string;
    category: string;
    description: string;
    imageUrl?: string;
    photoDataUrl?: string;
    roomId: number;
    benchLocation: string;
    specs?: Record<string, string | string[]>;
    requiresCertification: boolean;
    certificationName?: string;
    unitCodes: string[];
  }) {
    return requestJson<{ equipment: Equipment }>('/api/faculty/equipment', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getFacultyCertifications() {
    return requestJson<{ certifications: CertificationRecord[] }>('/api/faculty/certifications');
  },

  upsertCertification(payload: {
    studentId?: string;
    studentName: string;
    certificationName: string;
    active: boolean;
  }) {
    return requestJson<{ ok: boolean }>('/api/faculty/certifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getFacultyMaintenance() {
    return requestJson<{ maintenance: MaintenanceRecord[]; rescueProposals: RescueProposal[] }>(
      '/api/faculty/maintenance'
    );
  },

  scheduleMaintenance(payload: {
    equipmentId: number;
    unitId: number | null;
    reason: string;
    startDate: string;
    endDate: string;
  }) {
    return requestJson<{
      maintenance: MaintenanceRecord;
      rescuedCount: number;
      proposals: RescueProposal[];
    }>('/api/faculty/maintenance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  resolveMaintenance(maintenanceId: number) {
    return requestJson<{ ok: boolean }>(`/api/faculty/maintenance/${maintenanceId}/resolve`, {
      method: 'POST',
    });
  },

  getFacultyDamageReports() {
    return requestJson<{ damageReports: DamageReport[] }>('/api/faculty/damage-reports');
  },

  updateDamageReport(
    reportId: number,
    payload: {
      status: DamageStatus;
      investigationFindings?: string;
      responsibilityDecision?: ResponsibilityDecision | null;
      facultyNotes?: string;
      markUnitSafe?: boolean;
    }
  ) {
    return requestJson<{ damageReport: DamageReport }>(
      `/api/faculty/damage-reports/${reportId}/update`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updateRoomSchedule(
    roomId: number,
    payload: {
      openHour?: number;
      closeHour?: number;
      saturdayOpenHour?: number;
      saturdayCloseHour?: number;
      sundayClosed?: boolean;
      status?: RoomStatus;
    }
  ) {
    return requestJson<{ room: LabRoom }>(`/api/faculty/rooms/${roomId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  createLabHoliday(payload: { holidayDate: string; roomId: number | null; title: string }) {
    return requestJson<{ holiday: LabHoliday }>('/api/faculty/holidays', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deleteLabHoliday(id: number) {
    return requestJson<{ ok: boolean }>(`/api/faculty/holidays/${id}`, {
      method: 'DELETE',
    });
  },

  // ================= ADMIN-ONLY ENDPOINTS =================
  getAdminStudents() {
    return requestJson<{ students: UserProfile[] }>('/api/admin/students');
  },

  getAdminFaculty() {
    return requestJson<{ staff: UserProfile[]; passwordStatus: PortalPasswordStatus }>(
      '/api/admin/faculty'
    );
  },

  updatePortalPasswords(payload: {
    targetRole: 'faculty' | 'admin' | 'both';
    newPassword: string;
  }) {
    return requestJson<{ ok: boolean; passwordStatus: PortalPasswordStatus }>(
      '/api/admin/portal-passwords',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  createOrPromoteFaculty(payload: {
    email?: string;
    fullName: string;
    department: string;
    password?: string;
    role: 'faculty' | 'admin';
  }) {
    return requestJson<{ staff: UserProfile }>('/api/admin/faculty', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateStaffAccount(staffId: string, patch: { isActive?: boolean; role?: UserRole }) {
    return requestJson<{ staff: UserProfile }>(`/api/admin/faculty/${staffId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  getAdminCampus() {
    return requestJson<{
      blocks: CampusBlock[];
      floors: CampusFloor[];
      rooms: LabRoom[];
      holidays: LabHoliday[];
    }>('/api/admin/campus');
  },

  createBlock(payload: { name: string; code: string; description: string }) {
    return requestJson<{ block: CampusBlock }>('/api/admin/blocks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateBlock(
    blockId: number,
    payload: { name?: string; code?: string; description?: string; isActive?: boolean }
  ) {
    return requestJson<{ block: CampusBlock }>(`/api/admin/blocks/${blockId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  createFloor(payload: { blockId: number; floorNumber: number; label: string }) {
    return requestJson<{ floor: CampusFloor }>('/api/admin/floors', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateFloor(floorId: number, payload: { floorNumber?: number; label?: string; isActive?: boolean }) {
    return requestJson<{ floor: CampusFloor }>(`/api/admin/floors/${floorId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  createRoom(payload: {
    blockId: number;
    floorId: number;
    roomNumber: string;
    labName: string;
    status: RoomStatus;
    openHour: number;
    closeHour: number;
    saturdayOpenHour: number;
    saturdayCloseHour: number;
    sundayClosed: boolean;
  }) {
    return requestJson<{ room: LabRoom }>('/api/admin/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateRoom(
    roomId: number,
    payload: {
      blockId?: number;
      floorId?: number;
      roomNumber?: string;
      labName?: string;
      status?: RoomStatus;
      isActive?: boolean;
      openHour?: number;
      closeHour?: number;
      saturdayOpenHour?: number;
      saturdayCloseHour?: number;
      sundayClosed?: boolean;
    }
  ) {
    return requestJson<{ room: LabRoom }>(`/api/admin/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getRoomAffectedBookings(roomId: number) {
    return requestJson<{ affectedBookings: AffectedBookingSummary[] }>(
      `/api/admin/rooms/${roomId}/affected-bookings`
    );
  },

  deactivateRoom(roomId: number, payload: { isActive: boolean; confirmed?: boolean }) {
    return requestJson<{ room: LabRoom }>(`/api/admin/rooms/${roomId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  moveEquipment(
    equipmentId: number,
    payload: { roomId: number; benchLocation?: string; reason: string }
  ) {
    return requestJson<{ equipment: Equipment }>(`/api/admin/equipment/${equipmentId}/move`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
