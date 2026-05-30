import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Use process.env with fallback for CI/CD where DATABASE_URL may not be set during `prisma generate`
    // The dummy URL allows generate to complete; actual DB connection happens at runtime
    url: process.env.DATABASE_URL || 'sqlserver://localhost:1433;database=dummy;user=sa;password=dummy',
  },
});
