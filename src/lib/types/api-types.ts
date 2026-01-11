/**
 * API Type Definitions
 * 
 * This file contains type definitions that bridge the gap between:
 * - Prisma database schema types
 * - API response/request types
 * - Frontend UI types
 * 
 * All API responses should use these types to ensure consistency.
 */

import type { 
  Playlist as PrismaPlaylist,
  PlaylistItem as PrismaPlaylistItem,
  Content as PrismaContent,
  User as PrismaUser,
  Display as PrismaDisplay,
  TransitionType,
  ContentType,
  ProcessingStatus,
  DisplayOrientation
} from '@/generated/prisma';

// ============================================
// API Response Types (What the API returns)
// ============================================

/**
 * API Playlist Response
 * This is what the API returns when fetching playlists
 */
export interface ApiPlaylistResponse {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  items?: ApiPlaylistItemResponse[];
  creator?: ApiUserResponse;
  displays?: ApiDisplayResponse[];
  tags?: ApiTagResponse[];
  sharedWith?: ApiUserResponse[];
}

/**
 * API Playlist Item Response
 */
export interface ApiPlaylistItemResponse {
  id: string;
  playlistId: string;
  contentId: string;
  duration: number;
  order: number;
  transitionType: TransitionType;
  transitionDuration: number | null;
  createdAt: string;
  updatedAt: string;
  content?: ApiContentResponse;
}

/**
 * API Content Response
 */
export interface ApiContentResponse {
  id: string;
  name: string;
  description?: string | null;
  fileName?: string;
  type: ContentType | string;
  filePath: string | null;
  metadata: any;
  backgroundColor: string | null;
  cropSettings: any;
  fileSize: string | null; // BigInt serialized as string
  mimeType: string | null;
  originalName: string | null;
  fileHash: string | null;
  duration?: number | null; // Duration in seconds for video content
  processingStatus: ProcessingStatus | string;
  processingError: string | null;
  storageLocation: string | null;
  uploadedBy: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  thumbnailUrl?: string; // Added by API
  thumbnails?: ApiThumbnailResponse[];
}

/**
 * API Thumbnail Response
 */
export interface ApiThumbnailResponse {
  id: string;
  contentId: string;
  size: string;
  width: number;
  height: number;
  filePath: string;
  fileSize: string; // BigInt serialized as string
  format: string;
  createdAt: string;
}

/**
 * API Tag Response
 */
export interface ApiTagResponse {
  id: string;
  name: string;
  createdAt?: string;
}

/**
 * API User Response (Public fields only)
 */
export interface ApiUserResponse {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * API Display Response
 */
export interface ApiDisplayResponse {
  id: string;
  name: string;
  urlSlug: string;
  playlistId: string | null;
  resolution: string;
  orientation: DisplayOrientation;
  lastSeen: string | null;
  isOnline?: boolean;
  isActive?: boolean;
  isRaspberryPi?: boolean;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  playlist?: ApiPlaylistResponse;
}

// ============================================
// API Request Types (What the API expects)
// ============================================

/**
 * Create Playlist Request
 */
export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  isActive?: boolean;
  items?: CreatePlaylistItemRequest[];
  tags?: string[];
}

/**
 * Update Playlist Request
 */
export interface UpdatePlaylistRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
  items?: CreatePlaylistItemRequest[];
  tags?: string[];
}

/**
 * Create/Update Playlist Item Request
 */
export interface CreatePlaylistItemRequest {
  contentId: string;
  order: number;
  duration: number;
  transitionType: string; // Will be converted to enum
  transitionDuration?: number;
}

/**
 * Create Content Request
 */
export interface CreateContentRequest {
  name: string;
  type: ContentType;
  filePath?: string;
  metadata?: any;
  backgroundColor?: string;
  cropSettings?: any;
  fileSize?: number;
  mimeType?: string;
  originalName?: string;
  fileHash?: string;
}

/**
 * Update Content Request
 */
export interface UpdateContentRequest {
  name?: string;
  metadata?: any;
  backgroundColor?: string;
  cropSettings?: any;
}

/**
 * Create Display Request
 */
export interface CreateDisplayRequest {
  name: string;
  urlSlug: string;
  playlistId?: string;
  resolution?: string;
  orientation?: DisplayOrientation;
  location?: string;
  isRaspberryPi?: boolean;
}

/**
 * Update Display Request
 */
export interface UpdateDisplayRequest {
  name?: string;
  playlistId?: string | null;
  resolution?: string;
  orientation?: DisplayOrientation;
  location?: string;
  isRaspberryPi?: boolean;
}