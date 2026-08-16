import type {
  FractalItem,
  FractalList,
  PaginationQuery,
  // Application
  User,
  CreateUserParams,
  UpdateUserParams,
  Node,
  CreateNodeParams,
  UpdateNodeParams,
  NodeConfiguration,
  Location,
  CreateLocationParams,
  Allocation,
  CreateAllocationParams,
  AppServer,
  CreateServerParams,
  UpdateServerDetailsParams,
  UpdateServerBuildParams,
  UpdateServerStartupParams,
  AppDatabase,
  CreateDatabaseParams,
  Nest,
  Egg,
  // Client
  ClientServer,
  ResourceUsage,
  WebSocketCredentials,
  PowerAction,
  FileObject,
  Backup,
  CreateBackupParams,
  Schedule,
  CreateScheduleParams,
  ScheduleTask,
  CreateScheduleTaskParams,
  ClientDatabase,
  CreateClientDatabaseParams,
  NetworkAllocation,
  Subuser,
  CreateSubuserParams,
  StartupVariable,
  AccountInfo,
  ApiKey,
  SshKey,
  ActivityLogEntry,
} from "./types.js";

// ── Error ────────────────────────────────────────────────────────────

export class PterodactylError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    let detail: string;
    try {
      const parsed = JSON.parse(body);
      const errors = parsed.errors;
      detail = Array.isArray(errors)
        ? errors.map((e: { detail?: string }) => e.detail).join("; ")
        : body;
    } catch {
      detail = body;
    }
    super(`Pterodactyl API ${status}: ${detail}`);
    this.name = "PterodactylError";
  }
}

// ── Config ───────────────────────────────────────────────────────────

export interface PterodactylConfig {
  /** Panel base URL, e.g. "https://panel.example.com" (no trailing slash) */
  baseUrl: string;
  /** API key – ptla_* for Application API, ptlc_* for Client API */
  apiKey: string;
}

// ── Base HTTP client ─────────────────────────────────────────────────

type QueryParams = Record<string, string | number | boolean | undefined>;

class HttpClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: PterodactylConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: QueryParams,
    rawBody = false,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = rawBody ? "text/plain" : "application/json";
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body:
        body !== undefined
          ? rawBody
            ? String(body)
            : JSON.stringify(body)
          : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new PterodactylError(res.status, text);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") || contentType.includes("vnd.pterodactyl")) {
      return (await res.json()) as T;
    }

    return (await res.text()) as T;
  }

  get<T>(path: string, query?: QueryParams) {
    return this.request<T>("GET", path, undefined, query);
  }
  post<T>(path: string, body?: unknown, query?: QueryParams) {
    return this.request<T>("POST", path, body, query);
  }
  postRaw<T>(path: string, body: string, query?: QueryParams) {
    return this.request<T>("POST", path, body, query, true);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }
  delete<T = void>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

// ── Application API ──────────────────────────────────────────────────

export class ApplicationAPI {
  constructor(private http: HttpClient) {}

  private base = "/api/application";

  // ─── Users ───

  listUsers(query?: PaginationQuery) {
    return this.http.get<FractalList<User>>(`${this.base}/users`, query);
  }

  getUser(id: number) {
    return this.http.get<FractalItem<User>>(`${this.base}/users/${id}`);
  }

  getUserByExternalId(externalId: string) {
    return this.http.get<FractalItem<User>>(
      `${this.base}/users/external/${externalId}`,
    );
  }

  createUser(params: CreateUserParams) {
    return this.http.post<FractalItem<User>>(`${this.base}/users`, params);
  }

  updateUser(id: number, params: UpdateUserParams) {
    return this.http.patch<FractalItem<User>>(
      `${this.base}/users/${id}`,
      params,
    );
  }

  deleteUser(id: number) {
    return this.http.delete(`${this.base}/users/${id}`);
  }

  // ─── Nodes ───

  listNodes(query?: PaginationQuery) {
    return this.http.get<FractalList<Node>>(`${this.base}/nodes`, query);
  }

  getNode(id: number) {
    return this.http.get<FractalItem<Node>>(`${this.base}/nodes/${id}`);
  }

  getNodeConfiguration(id: number) {
    return this.http.get<NodeConfiguration>(
      `${this.base}/nodes/${id}/configuration`,
    );
  }

  createNode(params: CreateNodeParams) {
    return this.http.post<FractalItem<Node>>(`${this.base}/nodes`, params);
  }

  updateNode(id: number, params: UpdateNodeParams) {
    return this.http.patch<FractalItem<Node>>(
      `${this.base}/nodes/${id}`,
      params,
    );
  }

  deleteNode(id: number) {
    return this.http.delete(`${this.base}/nodes/${id}`);
  }

  // ─── Node Allocations ───

  listAllocations(nodeId: number, query?: PaginationQuery) {
    return this.http.get<FractalList<Allocation>>(
      `${this.base}/nodes/${nodeId}/allocations`,
      query,
    );
  }

  createAllocation(nodeId: number, params: CreateAllocationParams) {
    return this.http.post(
      `${this.base}/nodes/${nodeId}/allocations`,
      params,
    );
  }

  deleteAllocation(nodeId: number, allocationId: number) {
    return this.http.delete(
      `${this.base}/nodes/${nodeId}/allocations/${allocationId}`,
    );
  }

  // ─── Locations ───

  listLocations(query?: PaginationQuery) {
    return this.http.get<FractalList<Location>>(
      `${this.base}/locations`,
      query,
    );
  }

  getLocation(id: number) {
    return this.http.get<FractalItem<Location>>(
      `${this.base}/locations/${id}`,
    );
  }

  createLocation(params: CreateLocationParams) {
    return this.http.post<FractalItem<Location>>(
      `${this.base}/locations`,
      params,
    );
  }

  updateLocation(id: number, params: Partial<CreateLocationParams>) {
    return this.http.patch<FractalItem<Location>>(
      `${this.base}/locations/${id}`,
      params,
    );
  }

  deleteLocation(id: number) {
    return this.http.delete(`${this.base}/locations/${id}`);
  }

  // ─── Servers ───

  listServers(query?: PaginationQuery) {
    return this.http.get<FractalList<AppServer>>(
      `${this.base}/servers`,
      query,
    );
  }

  getServer(id: number) {
    return this.http.get<FractalItem<AppServer>>(
      `${this.base}/servers/${id}`,
    );
  }

  getServerByExternalId(externalId: string) {
    return this.http.get<FractalItem<AppServer>>(
      `${this.base}/servers/external/${externalId}`,
    );
  }

  createServer(params: CreateServerParams) {
    return this.http.post<FractalItem<AppServer>>(
      `${this.base}/servers`,
      params,
    );
  }

  updateServerDetails(id: number, params: UpdateServerDetailsParams) {
    return this.http.patch<FractalItem<AppServer>>(
      `${this.base}/servers/${id}/details`,
      params,
    );
  }

  updateServerBuild(id: number, params: UpdateServerBuildParams) {
    return this.http.patch<FractalItem<AppServer>>(
      `${this.base}/servers/${id}/build`,
      params,
    );
  }

  updateServerStartup(id: number, params: UpdateServerStartupParams) {
    return this.http.patch<FractalItem<AppServer>>(
      `${this.base}/servers/${id}/startup`,
      params,
    );
  }

  suspendServer(id: number) {
    return this.http.post(`${this.base}/servers/${id}/suspend`);
  }

  unsuspendServer(id: number) {
    return this.http.post(`${this.base}/servers/${id}/unsuspend`);
  }

  reinstallServer(id: number) {
    return this.http.post(`${this.base}/servers/${id}/reinstall`);
  }

  deleteServer(id: number, force = false) {
    const path = force
      ? `${this.base}/servers/${id}/force`
      : `${this.base}/servers/${id}`;
    return this.http.delete(path);
  }

  // ─── Server Databases (admin) ───

  listServerDatabases(serverId: number) {
    return this.http.get<FractalList<AppDatabase>>(
      `${this.base}/servers/${serverId}/databases`,
    );
  }

  getServerDatabase(serverId: number, databaseId: number) {
    return this.http.get<FractalItem<AppDatabase>>(
      `${this.base}/servers/${serverId}/databases/${databaseId}`,
    );
  }

  createServerDatabase(serverId: number, params: CreateDatabaseParams) {
    return this.http.post<FractalItem<AppDatabase>>(
      `${this.base}/servers/${serverId}/databases`,
      params,
    );
  }

  resetServerDatabasePassword(serverId: number, databaseId: number) {
    return this.http.post(
      `${this.base}/servers/${serverId}/databases/${databaseId}/reset-password`,
    );
  }

  deleteServerDatabase(serverId: number, databaseId: number) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/databases/${databaseId}`,
    );
  }

  // ─── Nests & Eggs ───

  listNests(query?: PaginationQuery) {
    return this.http.get<FractalList<Nest>>(`${this.base}/nests`, query);
  }

  getNest(id: number) {
    return this.http.get<FractalItem<Nest>>(`${this.base}/nests/${id}`);
  }

  listEggs(nestId: number, query?: PaginationQuery) {
    return this.http.get<FractalList<Egg>>(
      `${this.base}/nests/${nestId}/eggs`,
      query,
    );
  }

  getEgg(nestId: number, eggId: number) {
    return this.http.get<FractalItem<Egg>>(
      `${this.base}/nests/${nestId}/eggs/${eggId}`,
    );
  }
}

// ── Client API ───────────────────────────────────────────────────────

export class ClientAPI {
  constructor(private http: HttpClient) {}

  private base = "/api/client";

  // ─── Servers ───

  listServers(query?: PaginationQuery) {
    return this.http.get<FractalList<ClientServer>>(this.base, query);
  }

  getServer(serverId: string) {
    return this.http.get<FractalItem<ClientServer>>(
      `${this.base}/servers/${serverId}`,
    );
  }

  getResourceUsage(serverId: string) {
    return this.http.get<FractalItem<ResourceUsage>>(
      `${this.base}/servers/${serverId}/resources`,
    );
  }

  getWebSocket(serverId: string) {
    return this.http.get<FractalItem<WebSocketCredentials>>(
      `${this.base}/servers/${serverId}/websocket`,
    );
  }

  sendCommand(serverId: string, command: string) {
    return this.http.post(`${this.base}/servers/${serverId}/command`, {
      command,
    });
  }

  sendPowerAction(serverId: string, signal: PowerAction) {
    return this.http.post(`${this.base}/servers/${serverId}/power`, {
      signal,
    });
  }

  getActivity(serverId: string, query?: PaginationQuery) {
    return this.http.get<FractalList<ActivityLogEntry>>(
      `${this.base}/servers/${serverId}/activity`,
      query,
    );
  }

  // ─── Files ───

  listFiles(serverId: string, directory = "/") {
    return this.http.get<FractalList<FileObject>>(
      `${this.base}/servers/${serverId}/files/list`,
      { directory },
    );
  }

  getFileContents(serverId: string, file: string) {
    return this.http.get<string>(
      `${this.base}/servers/${serverId}/files/contents`,
      { file },
    );
  }

  getDownloadUrl(serverId: string, file: string) {
    return this.http.get<{ attributes: { url: string } }>(
      `${this.base}/servers/${serverId}/files/download`,
      { file },
    );
  }

  getUploadUrl(serverId: string) {
    return this.http.get<{ attributes: { url: string } }>(
      `${this.base}/servers/${serverId}/files/upload`,
    );
  }

  writeFile(serverId: string, file: string, content: string) {
    return this.http.postRaw(
      `${this.base}/servers/${serverId}/files/write`,
      content,
      { file },
    );
  }

  renameFile(
    serverId: string,
    root: string,
    files: { from: string; to: string }[],
  ) {
    return this.http.put(`${this.base}/servers/${serverId}/files/rename`, {
      root,
      files,
    });
  }

  copyFile(serverId: string, location: string) {
    return this.http.post(`${this.base}/servers/${serverId}/files/copy`, {
      location,
    });
  }

  compressFiles(serverId: string, root: string, files: string[]) {
    return this.http.post(`${this.base}/servers/${serverId}/files/compress`, {
      root,
      files,
    });
  }

  decompressFile(serverId: string, root: string, file: string) {
    return this.http.post(
      `${this.base}/servers/${serverId}/files/decompress`,
      { root, file },
    );
  }

  deleteFiles(serverId: string, root: string, files: string[]) {
    return this.http.post(`${this.base}/servers/${serverId}/files/delete`, {
      root,
      files,
    });
  }

  createFolder(serverId: string, root: string, name: string) {
    return this.http.post(
      `${this.base}/servers/${serverId}/files/create-folder`,
      { root, name },
    );
  }

  chmodFiles(
    serverId: string,
    root: string,
    files: { file: string; mode: number }[],
  ) {
    return this.http.post(`${this.base}/servers/${serverId}/files/chmod`, {
      root,
      files,
    });
  }

  pullFile(serverId: string, url: string, directory: string) {
    return this.http.post(`${this.base}/servers/${serverId}/files/pull`, {
      url,
      directory,
    });
  }

  // ─── Databases ───

  listDatabases(serverId: string) {
    return this.http.get<FractalList<ClientDatabase>>(
      `${this.base}/servers/${serverId}/databases`,
    );
  }

  createDatabase(serverId: string, params: CreateClientDatabaseParams) {
    return this.http.post<FractalItem<ClientDatabase>>(
      `${this.base}/servers/${serverId}/databases`,
      params,
    );
  }

  rotateDatabasePassword(serverId: string, databaseId: string) {
    return this.http.post<FractalItem<ClientDatabase>>(
      `${this.base}/servers/${serverId}/databases/${databaseId}/rotate-password`,
    );
  }

  deleteDatabase(serverId: string, databaseId: string) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/databases/${databaseId}`,
    );
  }

  // ─── Schedules ───

  listSchedules(serverId: string) {
    return this.http.get<FractalList<Schedule>>(
      `${this.base}/servers/${serverId}/schedules`,
    );
  }

  getSchedule(serverId: string, scheduleId: number) {
    return this.http.get<FractalItem<Schedule>>(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}`,
    );
  }

  createSchedule(serverId: string, params: CreateScheduleParams) {
    return this.http.post<FractalItem<Schedule>>(
      `${this.base}/servers/${serverId}/schedules`,
      params,
    );
  }

  updateSchedule(
    serverId: string,
    scheduleId: number,
    params: Partial<CreateScheduleParams>,
  ) {
    return this.http.post<FractalItem<Schedule>>(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}`,
      params,
    );
  }

  executeSchedule(serverId: string, scheduleId: number) {
    return this.http.post(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}/execute`,
    );
  }

  deleteSchedule(serverId: string, scheduleId: number) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}`,
    );
  }

  createScheduleTask(
    serverId: string,
    scheduleId: number,
    params: CreateScheduleTaskParams,
  ) {
    return this.http.post<FractalItem<ScheduleTask>>(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}/tasks`,
      params,
    );
  }

  updateScheduleTask(
    serverId: string,
    scheduleId: number,
    taskId: number,
    params: Partial<CreateScheduleTaskParams>,
  ) {
    return this.http.post<FractalItem<ScheduleTask>>(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}/tasks/${taskId}`,
      params,
    );
  }

  deleteScheduleTask(
    serverId: string,
    scheduleId: number,
    taskId: number,
  ) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/schedules/${scheduleId}/tasks/${taskId}`,
    );
  }

  // ─── Network ───

  listAllocations(serverId: string) {
    return this.http.get<FractalList<NetworkAllocation>>(
      `${this.base}/servers/${serverId}/network/allocations`,
    );
  }

  createAllocation(serverId: string) {
    return this.http.post<FractalItem<NetworkAllocation>>(
      `${this.base}/servers/${serverId}/network/allocations`,
    );
  }

  updateAllocation(
    serverId: string,
    allocationId: number,
    notes: string,
  ) {
    return this.http.post<FractalItem<NetworkAllocation>>(
      `${this.base}/servers/${serverId}/network/allocations/${allocationId}`,
      { notes },
    );
  }

  setPrimaryAllocation(serverId: string, allocationId: number) {
    return this.http.post<FractalItem<NetworkAllocation>>(
      `${this.base}/servers/${serverId}/network/allocations/${allocationId}/primary`,
    );
  }

  deleteAllocation(serverId: string, allocationId: number) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/network/allocations/${allocationId}`,
    );
  }

  // ─── Subusers ───

  listSubusers(serverId: string) {
    return this.http.get<FractalList<Subuser>>(
      `${this.base}/servers/${serverId}/users`,
    );
  }

  getSubuser(serverId: string, userId: string) {
    return this.http.get<FractalItem<Subuser>>(
      `${this.base}/servers/${serverId}/users/${userId}`,
    );
  }

  createSubuser(serverId: string, params: CreateSubuserParams) {
    return this.http.post<FractalItem<Subuser>>(
      `${this.base}/servers/${serverId}/users`,
      params,
    );
  }

  updateSubuser(
    serverId: string,
    userId: string,
    permissions: string[],
  ) {
    return this.http.post<FractalItem<Subuser>>(
      `${this.base}/servers/${serverId}/users/${userId}`,
      { permissions },
    );
  }

  deleteSubuser(serverId: string, userId: string) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/users/${userId}`,
    );
  }

  // ─── Backups ───

  listBackups(serverId: string, query?: PaginationQuery) {
    return this.http.get<FractalList<Backup>>(
      `${this.base}/servers/${serverId}/backups`,
      query,
    );
  }

  createBackup(serverId: string, params?: CreateBackupParams) {
    return this.http.post<FractalItem<Backup>>(
      `${this.base}/servers/${serverId}/backups`,
      params,
    );
  }

  getBackup(serverId: string, backupId: string) {
    return this.http.get<FractalItem<Backup>>(
      `${this.base}/servers/${serverId}/backups/${backupId}`,
    );
  }

  getBackupDownloadUrl(serverId: string, backupId: string) {
    return this.http.get<{ attributes: { url: string } }>(
      `${this.base}/servers/${serverId}/backups/${backupId}/download`,
    );
  }

  toggleBackupLock(serverId: string, backupId: string) {
    return this.http.post<FractalItem<Backup>>(
      `${this.base}/servers/${serverId}/backups/${backupId}/lock`,
    );
  }

  restoreBackup(serverId: string, backupId: string, truncate = false) {
    return this.http.post(
      `${this.base}/servers/${serverId}/backups/${backupId}/restore`,
      { truncate },
    );
  }

  deleteBackup(serverId: string, backupId: string) {
    return this.http.delete(
      `${this.base}/servers/${serverId}/backups/${backupId}`,
    );
  }

  // ─── Startup ───

  listStartupVariables(serverId: string) {
    return this.http.get<FractalList<StartupVariable>>(
      `${this.base}/servers/${serverId}/startup`,
    );
  }

  updateStartupVariable(serverId: string, key: string, value: string) {
    return this.http.put<FractalItem<StartupVariable>>(
      `${this.base}/servers/${serverId}/startup/variable`,
      { key, value },
    );
  }

  // ─── Settings ───

  renameServer(serverId: string, name: string, description?: string) {
    return this.http.post(
      `${this.base}/servers/${serverId}/settings/rename`,
      { name, description },
    );
  }

  reinstallServer(serverId: string) {
    return this.http.post(
      `${this.base}/servers/${serverId}/settings/reinstall`,
    );
  }

  setDockerImage(serverId: string, docker_image: string) {
    return this.http.put(
      `${this.base}/servers/${serverId}/settings/docker-image`,
      { docker_image },
    );
  }

  // ─── Account ───

  getAccount() {
    return this.http.get<FractalItem<AccountInfo>>(
      `${this.base}/account`,
    );
  }

  updateEmail(email: string, password: string) {
    return this.http.put(`${this.base}/account/email`, { email, password });
  }

  updatePassword(
    current_password: string,
    password: string,
    password_confirmation: string,
  ) {
    return this.http.put(`${this.base}/account/password`, {
      current_password,
      password,
      password_confirmation,
    });
  }

  listApiKeys() {
    return this.http.get<FractalList<ApiKey>>(
      `${this.base}/account/api-keys`,
    );
  }

  createApiKey(description: string, allowed_ips?: string[]) {
    return this.http.post(`${this.base}/account/api-keys`, {
      description,
      allowed_ips: allowed_ips ?? [],
    });
  }

  deleteApiKey(identifier: string) {
    return this.http.delete(
      `${this.base}/account/api-keys/${identifier}`,
    );
  }

  listSshKeys() {
    return this.http.get<FractalList<SshKey>>(
      `${this.base}/account/ssh-keys`,
    );
  }

  addSshKey(name: string, public_key: string) {
    return this.http.post(`${this.base}/account/ssh-keys`, {
      name,
      public_key,
    });
  }

  removeSshKey(fingerprint: string) {
    return this.http.post(`${this.base}/account/ssh-keys/remove`, {
      fingerprint,
    });
  }

  getAccountActivity(query?: PaginationQuery) {
    return this.http.get<FractalList<ActivityLogEntry>>(
      `${this.base}/account/activity`,
      query,
    );
  }
}

// ── Main Client ──────────────────────────────────────────────────────

export class PterodactylClient {
  private http: HttpClient;

  /** Admin endpoints (requires ptla_* key) */
  public readonly application: ApplicationAPI;
  /** User endpoints (requires ptlc_* key) */
  public readonly client: ClientAPI;

  constructor(config: PterodactylConfig) {
    this.http = new HttpClient(config);
    this.application = new ApplicationAPI(this.http);
    this.client = new ClientAPI(this.http);
  }
}
