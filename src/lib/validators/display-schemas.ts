/**
 * Display Validation Schemas
 * 
 * Zod schemas for validating display-related data
 * at the API layer before it reaches the database
 */

import { z } from 'zod';
import { DisplayOrientation } from '@/generated/prisma';

// ============================================
// Enum Schemas
// ============================================

/**
 * Valid display orientations from Prisma schema
 */
export const DisplayOrientationSchema = z.nativeEnum(DisplayOrientation);

/**
 * Valid display statuses
 */
export const DisplayStatusSchema = z.enum(['online', 'offline', 'error', 'unknown']);

/**
 * Valid resolution patterns
 */
export const ResolutionSchema = z.string()
  .regex(/^\d{3,4}x\d{3,4}$/, 'Resolution must be in format WIDTHxHEIGHT (e.g., 1920x1080)')
  .optional()
  .default('1920x1080');

// ============================================
// Display Configuration Schemas
// ============================================

/**
 * Schema for display settings/configuration
 */
export const DisplaySettingsSchema = z.object({
  brightness: z.number().int().min(0).max(100).optional(),
  volume: z.number().int().min(0).max(100).optional(),
  autoPlay: z.boolean().optional().default(true),
  showClock: z.boolean().optional().default(false),
  showWeather: z.boolean().optional().default(false),
  timezone: z.string().optional(),
  language: z.string().length(2).optional(), // ISO 639-1 code
  refreshInterval: z.number().int().min(60).max(3600).optional(), // Seconds
});

// ============================================
// Display CRUD Schemas
// ============================================

/**
 * Schema for creating a new display
 */
export const CreateDisplaySchema = z.object({
  name: z.string()
    .min(1, 'Display name is required')
    .max(255, 'Display name must be less than 255 characters')
    .trim(),
  description: z.string().optional(), // For future use
  location: z.string()
    .max(255, 'Location must be less than 255 characters')
    .optional(),
  resolution: ResolutionSchema,
  orientation: DisplayOrientationSchema.optional().default(DisplayOrientation.LANDSCAPE),
  assignedPlaylistId: z.string().uuid('Playlist ID must be a valid UUID').optional().nullable(),
  settings: DisplaySettingsSchema.optional(),
  clockSettings: z.any().optional(), // JSON clock configuration
  isRaspberryPi: z.boolean().optional().default(false), // Raspberry Pi optimization flag
});

/**
 * Schema for updating an existing display
 */
export const UpdateDisplaySchema = z.object({
  name: z.string()
    .min(1, 'Display name cannot be empty')
    .max(255, 'Display name must be less than 255 characters')
    .trim()
    .optional(),
  description: z.string().optional(), // For future use
  location: z.string()
    .max(255, 'Location must be less than 255 characters')
    .optional(),
  resolution: ResolutionSchema.optional(),
  orientation: DisplayOrientationSchema.optional(),
  assignedPlaylistId: z.string().uuid('Playlist ID must be a valid UUID').optional().nullable(),
  settings: DisplaySettingsSchema.optional(),
  clockSettings: z.any().optional(), // JSON clock configuration
  isRaspberryPi: z.boolean().optional(), // Raspberry Pi optimization flag
});

/**
 * Schema for bulk creating displays
 */
export const BulkCreateDisplaySchema = z.object({
  count: z.number()
    .int()
    .min(1, 'Must create at least 1 display')
    .max(100, 'Cannot create more than 100 displays at once'),
  prefix: z.string()
    .min(1, 'Prefix is required')
    .max(200, 'Prefix must be less than 200 characters')
    .trim(),
  settings: z.object({
    location: z.string().optional(),
    resolution: ResolutionSchema.optional(),
    orientation: DisplayOrientationSchema.optional(),
    assignedPlaylistId: z.string().uuid().optional(),
  }).optional(),
});

/**
 * Schema for display heartbeat/status update
 */
export const DisplayHeartbeatSchema = z.object({
  ipAddress: z.string()
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address')
    .optional(),
  userAgent: z.string()
    .max(500, 'User agent must be less than 500 characters')
    .optional(),
  screenResolution: z.string()
    .regex(/^\d{3,4}x\d{3,4}$/)
    .optional(),
  browserInfo: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    platform: z.string().optional(),
  }).optional(),
});

// ============================================
// Query Parameter Schemas
// ============================================

/**
 * Schema for display list query parameters
 */
export const DisplayQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  status: DisplayStatusSchema.optional(),
  location: z.string().optional(),
  playlistId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'location', 'lastSeen', 'createdAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ============================================
// Response Validation Schemas
// ============================================

/**
 * Schema for validating API display response
 */
export const ApiDisplayResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  urlSlug: z.string(),
  resolution: z.string(),
  orientation: z.string(),
  location: z.string().nullable(),
  isActive: z.boolean(),
  isOnline: z.boolean(),
  playlistId: z.string().uuid().nullable(),
  lastSeen: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  playlist: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }).optional().nullable(),
});

/**
 * Schema for frontend display format
 */
export const FrontendDisplaySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  location: z.string(),
  uniqueUrl: z.string(),
  resolution: z.string(),
  orientation: z.string(),
  assignedPlaylistId: z.string().uuid().nullable(),
  assignedPlaylist: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }).optional().nullable(),
  status: DisplayStatusSchema,
  lastSeen: z.date().nullable(),
  ipAddress: z.string(),
  userAgent: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
  isActive: z.boolean(),
  settings: z.object({}).optional(),
});

// ============================================
// Validation Functions
// ============================================

/**
 * Validate create display request
 */
export function validateCreateDisplay(data: unknown) {
  return CreateDisplaySchema.safeParse(data);
}

/**
 * Validate update display request
 */
export function validateUpdateDisplay(data: unknown) {
  return UpdateDisplaySchema.safeParse(data);
}

/**
 * Validate bulk create request
 */
export function validateBulkCreateDisplay(data: unknown) {
  return BulkCreateDisplaySchema.safeParse(data);
}

/**
 * Validate display heartbeat
 */
export function validateDisplayHeartbeat(data: unknown) {
  return DisplayHeartbeatSchema.safeParse(data);
}

/**
 * Validate display query parameters
 */
export function validateDisplayQuery(params: URLSearchParams) {
  const query = Object.fromEntries(params.entries());
  return DisplayQuerySchema.safeParse(query);
}

/**
 * Validate API response format (for development/testing)
 */
export function validateApiDisplayResponse(data: unknown) {
  return ApiDisplayResponseSchema.safeParse(data);
}

// ============================================
// Type Exports
// ============================================

export type CreateDisplayInput = z.infer<typeof CreateDisplaySchema>;
export type UpdateDisplayInput = z.infer<typeof UpdateDisplaySchema>;
export type BulkCreateDisplayInput = z.infer<typeof BulkCreateDisplaySchema>;
export type DisplayHeartbeat = z.infer<typeof DisplayHeartbeatSchema>;
export type DisplayQuery = z.infer<typeof DisplayQuerySchema>;
export type ApiDisplayResponse = z.infer<typeof ApiDisplayResponseSchema>;
export type FrontendDisplay = z.infer<typeof FrontendDisplaySchema>;