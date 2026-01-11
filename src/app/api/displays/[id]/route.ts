import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '@/lib/auth-helpers';
// Removed authOptions import
import { displayService } from '@/lib/services/display-service';
import { playlistService } from '@/lib/services/playlist-service';
import { validateUpdateDisplay, type UpdateDisplayInput } from '@/lib/validators/display-schemas';
import { validationErrorResponse, ErrorResponses, isValidUUID } from '@/lib/validators/api-validators';
import { broadcastDisplayUpdate, broadcastPlaylistUpdate } from '@/lib/socket-server';
import { apiToFrontendPlaylist } from '@/lib/transformers/api-transformers';

// Helper to serialize BigInt values
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value);
    }
    return serialized;
  }
  return obj;
}

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// GET /api/displays/[id] - Get single display
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    // Validate ID format
    if (!isValidUUID(id)) {
      return ErrorResponses.badRequest('Invalid display ID format');
    }
    
    const display = await displayService.getDisplay(id);
    
    if (!display) {
      return NextResponse.json({ error: 'Display not found' }, { status: 404 });
    }

    // Serialize BigInt values before returning
    const serializedDisplay = serializeBigInt(display);
    return NextResponse.json(serializedDisplay);
  } catch (error) {
    console.error('Error fetching display:', error);
    return NextResponse.json(
      { error: 'Failed to fetch display' },
      { status: 500 }
    );
  }
}

// PUT /api/displays/[id] - Update display
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    // Validate ID format
    if (!isValidUUID(id)) {
      return ErrorResponses.badRequest('Invalid display ID format');
    }
    
    const body = await request.json();

    // Validate request body
    const validation = validateUpdateDisplay(body);
    if (!validation.success) {
      return validationErrorResponse(validation.error);
    }

    const validatedData = validation.data as UpdateDisplayInput;

    const display = await displayService.updateDisplay(id, validatedData);

    if (!display) {
      return NextResponse.json({ error: 'Display not found' }, { status: 404 });
    }

    // If the playlist was updated, notify the display via WebSocket
    if (validatedData.assignedPlaylistId !== undefined) {
      // Get the full display with playlist data
      const fullDisplay = await displayService.getDisplay(id);
      const serializedDisplay = serializeBigInt(fullDisplay);
      
      if (display.assignedPlaylistId) {
        // Get the full playlist data if a playlist is assigned
        const playlist = await playlistService.getById(display.assignedPlaylistId);
        if (playlist) {
          // Transform playlist to frontend format
          const frontendPlaylist = apiToFrontendPlaylist(playlist as any);
          
          // Serialize BigInt values before sending via WebSocket
          const serializedPlaylist = serializeBigInt(frontendPlaylist);
          
          // Send WebSocket notification to the display
          broadcastPlaylistUpdate(id, serializedPlaylist);
        }
      } else {
        // Playlist was set to "none" - explicitly send null
        broadcastPlaylistUpdate(id, null);
      }
      
      // Always send display update notification when playlist changes
      // Include the full display data with assignedPlaylist populated or explicitly null
      broadcastDisplayUpdate(id, {
        ...serializedDisplay,
        assignedPlaylist: display.assignedPlaylistId ? serializedDisplay.assignedPlaylist : null,
        refresh: true  // Force refresh when playlist changes
      });
    } else if (validatedData.clockSettings !== undefined) {
      // If only clock settings were updated, send display update
      const serializedDisplay = serializeBigInt(display);
      broadcastDisplayUpdate(id, {
        ...serializedDisplay,
        refresh: false
      });
    }

    // Serialize BigInt values before returning
    const serializedDisplay = serializeBigInt(display);
    return NextResponse.json(serializedDisplay);
  } catch (error) {
    console.error('Error updating display:', error);
    return NextResponse.json(
      { error: 'Failed to update display' },
      { status: 500 }
    );
  }
}

// DELETE /api/displays/[id] - Delete display
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    // Validate ID format
    if (!isValidUUID(id)) {
      return ErrorResponses.badRequest('Invalid display ID format');
    }
    
    const success = await displayService.deleteDisplay(id);
    
    if (!success) {
      return NextResponse.json({ error: 'Display not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Display deleted successfully' });
  } catch (error) {
    console.error('Error deleting display:', error);
    return NextResponse.json(
      { error: 'Failed to delete display' },
      { status: 500 }
    );
  }
}