import { preview } from 'vite';

// Own the preview in-process: close its server directly, without Windows
// process-tree termination (which can be restricted in managed workspaces).
export default async function setup() {
  const server = await preview({ preview: { host: 'localhost', port: Number(process.env.PW_TEST_PORT ?? 4183), strictPort: true } });
  return async () => { await server.close(); };
}
