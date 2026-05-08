// ── User ──
export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "loket" | "super";
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  counter_id?: number;
  counter?: Counter;
  assignedCounters?: Counter[];
}

// ── Counter (Loket) ──
export interface Counter {
  id: number;
  name: string;
  code: string;
  status: "active" | "inactive";
  users?: User[];
  layanan_id?: number;
  layanan?: Layanan;
  created_at?: string;
}

// ── Layanan (Service) ──
export interface Layanan {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  counter_id: number | null;
  counter?: Counter;
  created_at: string;
  updated_at: string;
}

// ── Queue ──
export type QueueStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "skipped";

export interface Queue {
  id: number;
  ticket_number: string;
  service_type: string;
  layanan_id?: number;
  layanan?: Layanan;
  status: QueueStatus;
  counter_id: number | null;
  counter?: Counter;
  called_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ── Display ──
export interface Display {
  id: number;
  name: string;
  location: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at?: string;
}

// ── Video ──
export interface Video {
  id: number;
  file_url: string;
  title: string;
  duration: number | null;
  volume_level: number;
  is_active: boolean;
  playlist_order: number;
  display_id: number;
  created_at?: string;
}

// ── Printer Profile ──
export type PaperSize = "58mm" | "80mm";

export interface PrinterProfile {
  id: number;
  name: string;
  paper_size: PaperSize;
  copy_count: number;
  header_text: string;
  footer_text: string;
  logo_url: string | null;
  template: Record<string, unknown>;
  created_at?: string;
}

// ── Audit Log ──
export interface AuditLog {
  id: number;
  user_id: number;
  user?: User;
  action: string;
  model: string;
  model_id: number;
  changes: Record<string, { before: unknown; after: unknown }>;
  ip_address: string;
  created_at: string;
}

// ── API envelope ──
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// ── Auth ──
export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ── WebSocket events ──
export interface QueueUpdateEvent {
  event:
    | "ticket.created"
    | "ticket.called"
    | "ticket.completed"
    | "ticket.skipped";
  queue: Queue;
  previous_status?: QueueStatus;
}

export interface DisplaySyncEvent {
  current_queue: Queue | null;
  recent_queues: Queue[];
  video_settings: {
    volume: number;
    video_id: number | null;
  };
}

export interface VolumeUpdateEvent {
  display_id: number;
  volume: number;
  video_id?: number | null;
}
