import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import type {
  DockhandContainer,
  DockhandEnvironment,
  DockhandStack,
} from './dockhand.types';

const HEALTH_TIMEOUT_MS = 5000;

@Injectable()
export class DockhandService implements OnApplicationBootstrap {
  private readonly log = new Logger(DockhandService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const url = `${this.baseUrl()}/api/environments`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.get<string>('DOCKHAND_TOKEN')}`,
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this.log.warn(
          `Dockhand health-ping → ${res.status} ${res.statusText} (${url}). Tool calls will likely fail.`,
        );
        return;
      }
      this.log.log(`Dockhand health-ping OK → ${url}`);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.log.warn(
        `Dockhand health-ping FAILED → ${url}: ${msg}. Tool calls will fail until this is fixed.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private baseUrl(): string {
    return this.config.get<string>('DOCKHAND_BASE_URL')!.replace(/\/+$/, '');
  }

  private axiosConfig(): AxiosRequestConfig {
    return {
      headers: {
        Authorization: `Bearer ${this.config.get<string>('DOCKHAND_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      validateStatus: (s) => s >= 200 && s < 500,
    };
  }

  private withEnv(path: string, env?: string | number): string {
    if (env === undefined || env === null || env === '') return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}env=${encodeURIComponent(String(env))}`;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await firstValueFrom(
      this.http.get<T>(`${this.baseUrl()}${path}`, this.axiosConfig()),
    );
    if (res.status >= 400) {
      throw new Error(`Dockhand GET ${path} → ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await firstValueFrom(
      this.http.post<T>(`${this.baseUrl()}${path}`, body ?? {}, this.axiosConfig()),
    );
    if (res.status >= 400) {
      throw new Error(`Dockhand POST ${path} → ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res.data;
  }

  // --- Environments (Hawser agents) -----------------------------------------

  listEnvironments(): Promise<DockhandEnvironment[]> {
    return this.get<DockhandEnvironment[]>('/api/environments');
  }

  // --- Containers -----------------------------------------------------------

  listContainers(env?: string | number): Promise<DockhandContainer[]> {
    return this.get<DockhandContainer[]>(this.withEnv('/api/containers', env));
  }

  getContainer(id: string, env?: string | number): Promise<DockhandContainer> {
    return this.get<DockhandContainer>(
      this.withEnv(`/api/containers/${encodeURIComponent(id)}`, env),
    );
  }

  startContainer(id: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/containers/${encodeURIComponent(id)}/start`, env));
  }

  stopContainer(id: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/containers/${encodeURIComponent(id)}/stop`, env));
  }

  restartContainer(id: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/containers/${encodeURIComponent(id)}/restart`, env));
  }

  containerLogs(id: string, env?: string | number): Promise<unknown> {
    return this.get(this.withEnv(`/api/containers/${encodeURIComponent(id)}/logs`, env));
  }

  // --- Stacks ---------------------------------------------------------------

  listStacks(env?: string | number): Promise<DockhandStack[]> {
    return this.get<DockhandStack[]>(this.withEnv('/api/stacks', env));
  }

  getStack(name: string, env?: string | number): Promise<DockhandStack> {
    return this.get<DockhandStack>(
      this.withEnv(`/api/stacks/${encodeURIComponent(name)}`, env),
    );
  }

  startStack(name: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/stacks/${encodeURIComponent(name)}/start`, env));
  }

  stopStack(name: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/stacks/${encodeURIComponent(name)}/stop`, env));
  }

  restartStack(name: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/stacks/${encodeURIComponent(name)}/restart`, env));
  }

  deployStack(name: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/stacks/${encodeURIComponent(name)}/deploy`, env));
  }

  downStack(name: string, env?: string | number): Promise<unknown> {
    return this.post(this.withEnv(`/api/stacks/${encodeURIComponent(name)}/down`, env));
  }

  triggerStackWebhook(id: string, secret: string): Promise<unknown> {
    return this.post(
      `/api/git/stacks/${encodeURIComponent(id)}/webhook?secret=${encodeURIComponent(secret)}`,
    );
  }
}
