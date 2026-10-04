import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { AppModule } from '../app/app.module.js';
import { generateLocalOpenApi, listenLocalSwagger } from './local-openapi.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: { open: { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  if (positionals.length > 1) {
    throw new Error(
      'Usage: pnpm --filter @dive-center/api swagger:local [port] [--open]',
    );
  }
  const portArgument = positionals[0];
  if (portArgument !== undefined && !/^\d+$/.test(portArgument)) {
    throw new Error('Local Swagger port must be an integer from 0 to 65535');
  }
  const port = portArgument === undefined ? 3002 : Number(portArgument);
  const document = await generateLocalOpenApi(AppModule);
  const app = await listenLocalSwagger(document, port);
  const url = `${await app.getUrl()}/docs`;
  console.log(`Local Swagger: ${url}`);
  if (values.open) {
    if (process.platform !== 'darwin') {
      console.warn(
        'Automatic browser opening is supported on macOS; open the URL above.',
      );
      return;
    }
    try {
      await promisify(execFile)('open', [url]);
    } catch {
      console.warn('Could not open the browser; open the URL above.');
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Local Swagger failed',
  );
  process.exitCode = 1;
});
