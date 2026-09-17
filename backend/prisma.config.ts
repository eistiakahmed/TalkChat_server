/**
 * @file TalkChat Backend - Prisma CLI Configuration
 * @description Centralized configuration for Prisma CLI v7 (schema location, migrations, and datasource connection URL).
 * @see https://pris.ly/d/config-datasource Reference documentation for the prisma config file (Prisma ORM v7)
 * @see https://pris.ly/prisma-config Prisma Config overview and best practices
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  /**
   * Path to the multi-file schema directory
   * @see https://pris.ly/docs/orm/v7/prisma-schema/overview/location#multi-file-prisma-schema
   */
  schema: 'prisma/schema',

  /**
   * Migration files directory
   */
  migrations: {
    path: 'prisma/migrations',
  },

  /**
   * Database connection URL used by Prisma CLI for migrations and Studio
   * In Prisma 7, connection URLs for CLI are defined here rather than in schema files.
   */
  datasource: {
    url: env('DATABASE_URL'),
  },
});
