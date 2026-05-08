import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
});

// Clear Content-Type for FormData (let browser set boundary)
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

// Handle 401 globally — clear local user state, skip redirect for kiosk/display pages
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("auth_user");
      const path = window.location.pathname;
      if (path.startsWith("/loket") && !path.startsWith("/loket/login")) {
        window.location.assign("/loket/login");
      } else if (
        path !== "/" &&
        !path.startsWith("/loket/login") &&
        !path.startsWith("/kiosk") &&
        !path.startsWith("/display")
      ) {
        window.location.assign("/");
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export interface AuditLogParams {
  page?: number;
  per_page?: number;
  start_date?: string;
  end_date?: string;
  action?: string;
  user_id?: number;
}

export async function getAuditLogs(params: AuditLogParams = {}): Promise<
  import("./types").PaginatedResponse<import("./types").AuditLog>
> {
  const { data } = await api.get("/audit-logs", { params });
  return data;
}

// ── Layanan ──

export interface LayananPayload {
  name: string;
  code: string;
  description?: string;
  is_active?: boolean;
  counter_id?: number;
}

export async function getLayanans(activeOnly = true): Promise<import("./types").ApiResponse<import("./types").Layanan[]>> {
  const { data } = await api.get("/layanans", { params: { active_only: activeOnly } });
  return data;
}

export async function getLayanan(id: number): Promise<import("./types").ApiResponse<import("./types").Layanan>> {
  const { data } = await api.get(`/layanans/${id}`);
  return data;
}

export async function createLayanan(payload: LayananPayload): Promise<import("./types").ApiResponse<import("./types").Layanan>> {
  const { data } = await api.post("/layanans", payload);
  return data;
}

export async function updateLayanan(id: number, payload: Partial<LayananPayload>): Promise<import("./types").ApiResponse<import("./types").Layanan>> {
  const { data } = await api.put(`/layanans/${id}`, payload);
  return data;
}

export async function deleteLayanan(id: number): Promise<import("./types").ApiResponse<import("./types").Layanan>> {
  const { data } = await api.delete(`/layanans/${id}`);
  return data;
}

export async function getLayananQueues(
  layananId: number,
  params?: { status?: import("./types").QueueStatus | string; date?: string },
): Promise<import("./types").PaginatedResponse<import("./types").Queue>> {
  const { data } = await api.get(`/layanans/${layananId}/queues`, { params });
  return data;
}

// ── Videos ──

export interface VideoPayload {
  title?: string;
  display_id?: number;
  duration?: number | null;
  volume_level?: number;
  is_active?: boolean;
  playlist_order?: number;
}

export async function updateVideo(id: number, payload: VideoPayload): Promise<import("./types").ApiResponse<import("./types").Video>> {
  const { data } = await api.put(`/videos/${id}`, payload);
  return data;
}

export async function updateVideoWithFile(id: number, formData: FormData): Promise<import("./types").ApiResponse<import("./types").Video>> {
  formData.append("_method", "PUT");
  const { data } = await api.post(`/videos/${id}`, formData);
  return data;
}

export async function reorderVideos(order: { id: number; playlist_order: number }[]): Promise<import("./types").ApiResponse<void>> {
  const { data } = await api.post("/videos/reorder", { order });
  return data;
}
