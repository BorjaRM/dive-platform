import { appDatabaseUrl } from '@dive-center/database';
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
      useFactory: () => new Pool({ connectionString: appDatabaseUrl() }),
    },
    DatabasePoolLifecycle,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
