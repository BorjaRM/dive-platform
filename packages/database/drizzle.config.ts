import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/iam-schema.ts',
  out: './drizzle',
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
});
