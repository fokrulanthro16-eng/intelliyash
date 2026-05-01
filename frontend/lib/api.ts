// TYPES (same as before)
export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type SystemInfo = {
  os: string;
  arch: string;
  cpu_cores_physical: number;
  cpu_cores_logical: number;
  ram_total_mb: number;
  ram_available_mb: number;
  disk_free_gb: number;
  has_avx2: boolean;
  has_cuda: boolean;
  tier: string;
  recommended_threads: number;
  recommended_ctx: number;
};

export type ModelInfo = {
  id: string;
  display_name: string;
  tier: string;
  tasks: string[];
  size_mb: number;
  runtime_ram_mb: number;
  description: string;
  downloaded: boolean;
};

export type GeneratedProject = {
  name: string;
  path: string;
  run_backend: string;
  run_frontend: string;
};

export type Settings = {
  enable_cloud_fallback: boolean;
  has_cloud_api_key: boolean;
  cloud_provider: string;
  cloud_model: string;
  temperature: number;
  max_tokens: number;
  idle_unload_seconds: number;
};

export type HealthInfo = {
  status: string;
  ram_available_mb: number;
  ram_total_mb: number;
  loaded_model: string | null;
  is_loading: boolean;
};

export type ApiKey = {
  id: string;
  name: string;
  key_preview: string;
  created_at: string;
};

export type ApiKeyFull = ApiKey & { key: string };

// BASE URL
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// SAFE GET
async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) {
    throw new Error(`GET ${path} failed: ${r.status}`);
  }
  return r.json();
}

// 🔥 FIXED SAFE POST
async function post<T>(path: string, body?: unknown): Promise<T> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await r.text();

    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Server returned invalid response");
    }

    if (!r.ok) {
      let message = `POST ${path} failed: ${r.status}`;
      if (typeof data?.message === "string") message = data.message;
      else if (typeof data?.detail?.message === "string") message = data.detail.message;
      else if (typeof data?.detail === "string") message = data.detail;
      throw new Error(message);
    }

    return data as T;
  } catch (err: any) {
    throw new Error(err.message || "Network error");
  }
}

// API
export const api = {
  ping: () => get<{ ok: boolean }>("/api/chat/ping"),

  health: () => get<HealthInfo>("/api/health"),

  system: () => get<SystemInfo>("/api/system"),

  redetect: () => post<SystemInfo>("/api/system/redetect"),

  models: () =>
    get<{ models: ModelInfo[]; loaded: string | null; recommended_tier: string }>(
      "/api/models"
    ),

  downloadModel: async (id: string) => {
    try {
      return await post(`/api/models/${id}/download`);
    } catch (err: any) {
      alert(err.message);
      return { success: false };
    }
  },

  // 🔥 FIXED LOAD MODEL (NO MORE "Failed to fetch")
  loadModel: async (id: string) => {
    try {
      return await post(`/api/models/${id}/load`);
    } catch (err: any) {
      alert(err.message);
      return { success: false };
    }
  },

  unloadModel: () => post<{ status: string }>("/api/models/unload"),

  getSettings: () => get<Settings>("/api/settings"),

  updateSettings: (patch: Partial<Settings>) =>
    post<Settings>("/api/settings", patch),

  projects: () =>
    get<{ projects: GeneratedProject[] }>("/api/projects"),

  getLogs: (limit = 60) =>
    get<{ logs: string[] }>(`/api/logs?limit=${limit}`),
};