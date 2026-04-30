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

// Use NEXT_PUBLIC_API_URL in production; fall back to same-origin in dev.
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return r.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let message = `POST ${path} failed: ${r.status}`;
    try {
      const data = await r.json();
      if (typeof data?.detail?.message === "string") message = data.detail.message;
      else if (typeof data?.detail === "string") message = data.detail;
    } catch {}
    throw new Error(message);
  }
  return r.json();
}

export const api = {
  ping: () => get<{ ok: boolean }>("/api/chat/ping"),

  health: () => get<HealthInfo>("/api/health"),

  system: () => get<SystemInfo>("/api/system"),

  redetect: () => post<SystemInfo>("/api/system/redetect"),

  models: () =>
    get<{ models: ModelInfo[]; loaded: string | null; recommended_tier: string }>(
      "/api/models"
    ),

  downloadModel: (id: string) =>
    post<{ status: string; model_id: string }>(`/api/models/${id}/download`),

  loadModel: (id: string) =>
    post<{ status: string; model_id: string }>(`/api/models/${id}/load`),

  unloadModel: () => post<{ status: string }>("/api/models/unload"),

  getSettings: () => get<Settings>("/api/settings"),

  updateSettings: (patch: Partial<Settings & {
    cloud_api_key?: string;
    openai_api_key?: string;
    gemini_api_key?: string;
    hf_token?: string;
  }>) =>
    post<Settings>("/api/settings", patch),

  projects: () =>
    get<{ projects: GeneratedProject[] }>("/api/projects"),

  projectFiles: (name: string) =>
    get<{ files: string[] }>(`/api/projects/${encodeURIComponent(name)}/files`),

  deleteProject: async (name: string, deleteFiles = false): Promise<void> => {
    const url = `${BASE}/api/projects/${encodeURIComponent(name)}?delete_files=${deleteFiles}`;
    const r = await fetch(url, { method: "DELETE" });
    if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
  },

  // Developer API key management
  listKeys: () => get<{ keys: ApiKey[] }>("/api/keys"),

  createKey: (name: string) =>
    post<ApiKeyFull>("/api/keys/create", { name }),

  deleteKey: async (id: string): Promise<{ status: string }> => {
    const r = await fetch(`${BASE}/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(`Delete key failed: ${r.status}`);
    return r.json();
  },

  renameKey: async (id: string, name: string): Promise<{ status: string }> => {
    const r = await fetch(`${BASE}/api/keys/${encodeURIComponent(id)}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`Rename failed: ${r.status}`);
    return r.json();
  },

  getProjectFile: (name: string, path: string) =>
    get<{ content: string; path: string }>(
      `/api/projects/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`
    ),

  getLogs: (limit = 60) =>
    get<{ logs: string[] }>(`/api/logs?limit=${limit}`),

  v1Chat: async (key: string, messages: { role: string; content: string }[], model = "local"): Promise<any> => {
    const r = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const d = await r.json();
        if (d.detail) msg = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
      } catch {}
      throw new Error(msg);
    }
    return r.json();
  },

  downloadProject: async (name: string): Promise<void> => {
    const r = await fetch(`${BASE}/api/projects/${encodeURIComponent(name)}/download`);
    if (!r.ok) throw new Error(`Download failed: ${r.status}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export async function streamChat(opts: {
  messages: ChatMessage[];
  onToken?: (text: string) => void;
  onMeta?: (meta: Record<string, any>) => void;
  onDone?: () => void;
  onError?: (err: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const r = await fetch(`${BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: opts.messages }),
    signal: opts.signal,
  });

  if (!r.ok || !r.body) {
    opts.onError?.(`stream failed: ${r.status}`);
    return;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (line === "") {
        currentEvent = "message";
        continue;
      }

      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (!data) continue;

        let parsed: any = data;
        try {
          parsed = JSON.parse(data);
        } catch {}

        if (currentEvent === "meta")  opts.onMeta?.(parsed);
        if (currentEvent === "token" && parsed?.content) opts.onToken?.(parsed.content);
        if (currentEvent === "error") {
          opts.onError?.(parsed?.error ?? "unknown error");
          return;
        }
        if (currentEvent === "done") {
          opts.onDone?.();
          return;
        }
      }
    }
  }
}
