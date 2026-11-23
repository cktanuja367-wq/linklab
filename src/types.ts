export type EquipmentCategory =
  | 'Electronics'
  | 'Robotics'
  | 'IoT'
  | 'Computing'
  | 'Mechanical'
  | 'Embedded Systems';

export type UserRole = 'student' | 'faculty' | 'admin';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type RoomStatus = 'available' | 'unavailable' | 'maintenance';
export type UnitStatus = 'available' | 'maintenance' | 'damaged';

export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type SlotState = 'available' | 'pending' | 'approved' | 'booked' | 'maintenance';

export type DamageStatus =
  | 'Reported'
  | 'Under Investigation'
  | 'Resolved'
  | 'Maintenance Required';

export type ResponsibilityDecision =
  | 'misuse'
  | 'negligence'
  | 'normal_wear'
  | 'equipment_fault';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  usn: string;
  department: string;
  academicYear: number | null;
  semester: number | null;
  role: UserRole;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface CampusBlock {
  id: number;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface CampusFloor {
  id: number;
  blockId: number;
  blockName?: string;
  floorNumber: number;
  label: string;
  isActive: boolean;
  createdAt: string;
}

export interface LabRoom {
  id: number;
  blockId: number;
  blockName: string;
  floorId: number;
  floorLabel: string;
  floorNumber: number;
  roomNumber: string;
  labName: string;
  status: RoomStatus;
  isActive: boolean;
  openHour: number;
  closeHour: number;
  saturdayOpenHour: number;
  saturdayCloseHour: number;
  sundayClosed: boolean;
  equipmentCount?: number;
}

export interface EquipmentSpecs {
  bandwidth?: string;
  channels?: string;
  samplingRate?: string;
  interfaces?: string[];
  power?: string;
  precision?: string;
  architecture?: string;
  buildVolume?: string;
  payload?: string;
  notes?: string;
  [key: string]: string | string[] | undefined;
}

export interface EquipmentUnit {
  id: number;
  equipmentId: number;
  unitCode: string;
  status: UnitStatus;
  notes: string;
}

export interface Equipment {
  id: number;
  slug: string;
  name: string;
  category: EquipmentCategory;
  description: string;
  imageUrl: string;
  roomId: number | null;
  blockId: number | null;
  floorId: number | null;
  blockName: string;
  floorLabel: string;
  roomCode: string;
  labName: string;
  roomStatus: RoomStatus;
  roomActive: boolean;
  benchLocation: string;
  location: string;
  specs: EquipmentSpecs;
  requiresCertification: boolean;
  certificationName: string | null;
  compatibleIds: number[];
  units: EquipmentUnit[];
  availableUnitsCount: number;
  maintenanceUnitsCount: number;
  damagedUnitsCount: number;
  availableTodayCount: number;
  todayOpenHours: string;
}

export interface LabHoliday {
  id: number;
  holidayDate: string;
  roomId: number | null;
  labName: string | null;
  title: string;
  createdAt: string;
}

export interface Booking {
  id: number;
  studentId: string;
  studentName: string;
  studentUsn: string;
  projectName: string;
  projectDescription: string;
  projectDeadline: string;
  reason: string;
  equipmentId: number;
  equipmentName: string;
  equipmentImageUrl: string;
  roomId: number | null;
  labName: string;
  snapshotBlockName: string;
  snapshotFloorName: string;
  snapshotRoomNumber: string;
  snapshotLabName: string;
  snapshotBenchLocation: string;
  unitId: number;
  unitCode: string;
  bookingDate: string;
  startHour: number;
  endHour: number;
  status: BookingStatus;
  deadlineUrgency: number;
  usageFairness: number;
  priorityScore: number;
  safetyEligible: boolean;
  allocationNotes: string;
  rejectionReason: string | null;
  suggestedSlot: string | null;
  agreementAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffectedBookingSummary {
  id: number;
  studentName: string;
  studentUsn: string;
  equipmentName: string;
  unitCode: string;
  bookingDate: string;
  startHour: number;
  endHour: number;
  status: BookingStatus;
  projectName: string;
}

export interface DamageReport {
  id: number;
  bookingId: number;
  equipmentId: number;
  equipmentName: string;
  labName: string;
  unitId: number;
  unitCode: string;
  unitStatus: UnitStatus;
  studentId: string;
  studentName: string;
  description: string;
  reportedAt: string;
  status: DamageStatus;
  investigationFindings: string | null;
  responsibilityDecision: ResponsibilityDecision | null;
  facultyNotes: string | null;
  resolvedBy: string | null;
  updatedAt: string;
}

export interface CertificationRecord {
  id: number;
  studentId: string | null;
  studentName: string;
  certificationName: string;
  issuedBy: string;
  issuedAt: string;
  active: boolean;
}

export interface MaintenanceRecord {
  id: number;
  equipmentId: number;
  equipmentName: string;
  unitId: number | null;
  unitCode: string | null;
  reason: string;
  startDate: string;
  endDate: string;
  status: 'scheduled' | 'active' | 'resolved';
  createdBy: string;
  createdAt: string;
}

export interface RescueProposal {
  id: number;
  bookingId: number;
  studentId: string;
  studentName: string;
  triggerReason: string;
  originalEquipmentId: number;
  originalEquipmentName: string;
  proposedEquipmentId: number;
  proposedEquipmentName: string;
  proposedUnitId: number;
  proposedUnitCode: string;
  proposedDate: string;
  proposedStartHour: number;
  proposedEndHour: number;
  compatibilityExplanation: string;
  status: 'pending_student' | 'accepted' | 'pending_faculty' | 'resolved';
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  studentId: string | null;
  studentName: string;
  title: string;
  message: string;
  type: 'booking' | 'rescue' | 'maintenance' | 'safety' | 'damage' | 'verification' | 'info';
  relatedBookingId: number | null;
  rescueProposalId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface CalendarSlot {
  hour: number;
  label: string;
  state: SlotState;
  availableUnitIds: number[];
  operationalUnitsCount: number;
  pendingCount: number;
  approvedCount: number;
  isPastToday?: boolean;
  statusDetail: string;
}

export interface CalendarResponse {
  date: string;
  timezone: 'Asia/Kolkata';
  labName: string;
  blockName: string;
  floorLabel: string;
  roomCode: string;
  roomStatus: RoomStatus;
  isClosed: boolean;
  closedReason: string | null;
  openHour: number | null;
  closeHour: number | null;
  slots: CalendarSlot[];
}

export interface AlternativeSuggestion {
  type: 'slot' | 'unit' | 'compatible_equipment';
  equipmentId: number;
  equipmentName: string;
  labName: string;
  location: string;
  imageUrl: string;
  unitId: number;
  unitCode: string;
  date: string;
  startHour: number;
  endHour: number;
  compatibilityScore: number;
  explanation: string;
  limitations: string;
}

export interface FairnessContenderInput {
  studentName: string;
  academicYear?: string;
  projectName: string;
  daysUntilDeadline: number;
  weeklyHoursUsed: number;
  safetyCertified: boolean;
  cancellations?: number;
  noShows?: number;
}

export interface FairnessContenderResult extends FairnessContenderInput {
  deadlineUrgencyD: number;
  usageFairnessU: number;
  priorityScore: number | null;
  eligible: boolean;
  rank: number | null;
  exclusionReason?: string;
  explanation: string;
}

export interface FairnessSimulationResponse {
  formula: string;
  lookbackDays: number;
  equipmentName: string;
  requiredCertification: string;
  recommendedWinner: string | null;
  contenders: FairnessContenderResult[];
}

export interface AIDiscoveryRecommendation {
  equipment: Equipment;
  matchReason: string;
  compatibilityNote: string;
  alternatives: Equipment[];
}

export interface AIDiscoveryResponse {
  mode: 'gemini' | 'keyword_fallback';
  query: string;
  intentSummary: string;
  extractedKeywords: string[];
  recommendations: AIDiscoveryRecommendation[];
  warning?: string;
}

export interface ProjectStagePlan {
  stageNumber: number;
  stageTitle: string;
  objective: string;
  dependsOn: number[];
  recommendedEquipment: Equipment | null;
  alternativeEquipment: Equipment[];
  rationale: string;
  estimatedHours: number;
  safetyNote: string | null;
}

export interface ProjectPlanResponse {
  mode: 'gemini' | 'keyword_fallback';
  projectName: string;
  deadline: string;
  summary: string;
  stages: ProjectStagePlan[];
  warning?: string;
}

export interface LabAnalytics {
  totals: {
    totalEquipment: number;
    totalUnits: number;
    availableUnits: number;
    currentlyBookedToday: number;
    maintenanceUnits: number;
    damagedUnits: number;
    totalBookings: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    completedCount: number;
  };
  byLab: { labName: string; equipmentCount: number; bookingsCount: number; approvedHours: number }[];
  mostRequested: { equipmentId: number; name: string; category: string; requests: number }[];
  dailyTrend: { date: string; requests: number; approved: number }[];
}
