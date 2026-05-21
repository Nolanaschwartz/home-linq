import { tool } from 'ai';
import { z } from 'zod';
import { DockhandService } from '../dockhand/dockhand.service';

const envField = z
  .union([z.string(), z.number()])
  .optional()
  .describe(
    'Environment id from listEnvironments. Omit to use the local Dockhand environment.',
  );

export function buildDockhandTools(dockhand: DockhandService) {
  return {
    listEnvironments: tool({
      description:
        'List all environments (Hawser agents / Docker hosts) managed by Dockhand. Call this first when the user mentions a host by name.',
      parameters: z.object({}),
      execute: async () => dockhand.listEnvironments(),
    }),

    listContainers: tool({
      description: 'List Docker containers in an environment.',
      parameters: z.object({ env: envField }),
      execute: async ({ env }) => dockhand.listContainers(env),
    }),

    getContainer: tool({
      description: 'Get details for one container by id or name.',
      parameters: z.object({
        id: z.string().describe('Container id or name'),
        env: envField,
      }),
      execute: async ({ id, env }) => dockhand.getContainer(id, env),
    }),

    startContainer: tool({
      description: 'Start a stopped container.',
      parameters: z.object({ id: z.string(), env: envField }),
      execute: async ({ id, env }) => {
        await dockhand.startContainer(id, env);
        return { ok: true, id };
      },
    }),

    stopContainer: tool({
      description: 'Stop a running container. Destructive — require user confirmation.',
      parameters: z.object({ id: z.string(), env: envField }),
      execute: async ({ id, env }) => {
        await dockhand.stopContainer(id, env);
        return { ok: true, id };
      },
    }),

    restartContainer: tool({
      description: 'Restart a container. Destructive — require user confirmation.',
      parameters: z.object({ id: z.string(), env: envField }),
      execute: async ({ id, env }) => {
        await dockhand.restartContainer(id, env);
        return { ok: true, id };
      },
    }),

    containerLogs: tool({
      description: 'Fetch recent logs from a container.',
      parameters: z.object({ id: z.string(), env: envField }),
      execute: async ({ id, env }) => dockhand.containerLogs(id, env),
    }),

    listStacks: tool({
      description: 'List compose stacks in an environment.',
      parameters: z.object({ env: envField }),
      execute: async ({ env }) => dockhand.listStacks(env),
    }),

    getStack: tool({
      description: 'Get details for one stack by name.',
      parameters: z.object({ name: z.string(), env: envField }),
      execute: async ({ name, env }) => dockhand.getStack(name, env),
    }),

    startStack: tool({
      description: 'Start a stack.',
      parameters: z.object({ name: z.string(), env: envField }),
      execute: async ({ name, env }) => {
        await dockhand.startStack(name, env);
        return { ok: true, name };
      },
    }),

    stopStack: tool({
      description: 'Stop a stack. Destructive — require user confirmation.',
      parameters: z.object({ name: z.string(), env: envField }),
      execute: async ({ name, env }) => {
        await dockhand.stopStack(name, env);
        return { ok: true, name };
      },
    }),

    restartStack: tool({
      description: 'Restart a stack. Destructive — require user confirmation.',
      parameters: z.object({ name: z.string(), env: envField }),
      execute: async ({ name, env }) => {
        await dockhand.restartStack(name, env);
        return { ok: true, name };
      },
    }),

    deployStack: tool({
      description:
        'Deploy/redeploy a stack from its current compose file. Destructive — require user confirmation.',
      parameters: z.object({ name: z.string(), env: envField }),
      execute: async ({ name, env }) => {
        await dockhand.deployStack(name, env);
        return { ok: true, name };
      },
    }),

    downStack: tool({
      description: 'Bring a stack down (compose down). Destructive — require user confirmation.',
      parameters: z.object({ name: z.string(), env: envField }),
      execute: async ({ name, env }) => {
        await dockhand.downStack(name, env);
        return { ok: true, name };
      },
    }),
  };
}
