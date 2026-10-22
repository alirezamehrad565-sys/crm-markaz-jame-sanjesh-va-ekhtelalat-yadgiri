import type { Hono } from 'hono';
import type { AppBindings, AppVariables } from './types';

export type AppHono = Hono<{ Bindings: AppBindings; Variables: AppVariables }>;
