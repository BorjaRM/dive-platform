import {
  appDatabaseUrl,
  assertRuntimeDatabaseRole,
} from '@dive-center/database';
import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.tokens.js';

@Injectable()
class DatabasePoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: async () => {
        const pool = new Pool({ connectionString: appDatabaseUrl() });
        try {
          await assertRuntimeDatabaseRole(pool);
          return pool;
        } catch (error) {
          await pool.end().catch(() => undefined);
          throw error;
        }
      },
    },
    DatabasePoolLifecycle,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
