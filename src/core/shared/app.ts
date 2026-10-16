/**
 * زیرساخت مشترک — زمان تهران، کدملی، اسکیمای Zod و ثابت‌ها — ساخت اپ Hono و اتصال میدلورها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های زیرساختی اپ Hono — لایه ۱
// domain modules برای registerRoutes از این تایپ استفاده می‌کنند
// (بدون این، هر ماژول باید generic کامل Hono را خودش تعریف کند)

import type { Hono } from 'hono';
import type { AppBindings, AppVariables } from './types';

export type AppHono = Hono<{ Bindings: AppBindings; Variables: AppVariables }>;
