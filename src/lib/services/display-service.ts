import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { Display, CreateDisplayInput, UpdateDisplayInput, DisplayStatus } from '@/types/display';
import { DisplayOrientation } from '@/generated/prisma';

class DisplayService {
  // Generate unique URL for display
  private async generateUniqueUrl(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const uniqueUrl = nanoid(10); // Generate 10-character ID
      
      // Check if URL already exists
      const existing = await prisma.display.findUnique({
        where: { urlSlug: uniqueUrl },
      });

      if (!existing) {
        return uniqueUrl;
      }

      attempts++;
    }

    throw new Error('Failed to generate unique URL after multiple attempts');
  }

  // Create new display
  async createDisplay(input: CreateDisplayInput & { createdBy: string }): Promise<Display> {
    const urlSlug = await this.generateUniqueUrl();

    const display = await prisma.display.create({
      data: {
        name: input.name,
        location: input.location,
        urlSlug,
        resolution: input.resolution || '1920x1080',
        orientation: (input.orientation || 'LANDSCAPE') as DisplayOrientation,
        playlistId: input.assignedPlaylistId || null,
        isOnline: false,
        clockSettings: input.clockSettings || {},
        isRaspberryPi: input.isRaspberryPi || false,
      },
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.formatDisplay(display);
  }

  // Get all displays
  async getAllDisplays(includeInactive: boolean = false): Promise<Display[]> {
    const displays = await prisma.display.findMany({
      where: {}, // No isActive field in schema
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return displays.map(d => this.formatDisplay(d));
  }

  // Get single display
  async getDisplay(displayId: string): Promise<Display | null> {
    const display = await prisma.display.findUnique({
      where: { id: displayId },
      include: {
        playlist: {
          include: {
            items: {
              include: {
                content: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
      },
    });

    if (!display) return null;
    return this.formatDisplay(display);
  }

  // Get display by unique URL slug
  async getByUniqueUrl(urlSlug: string): Promise<Display | null> {
    const display = await prisma.display.findUnique({
      where: { urlSlug },
      include: {
        playlist: {
          include: {
            items: {
              include: {
                content: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
      },
    });

    if (!display) return null;
    return this.formatDisplay(display);
  }

  // Get display by unique URL
  async getDisplayByUrl(urlSlug: string): Promise<Display | null> {
    const display = await prisma.display.findUnique({
      where: { urlSlug },
      include: {
        playlist: {
          include: {
            items: {
              include: {
                content: true,
              },
              orderBy: {
                order: 'asc',
              },
            },
          },
        },
      },
    });

    if (!display) return null;
    
    // Update last seen
    await this.updateLastSeen(display.id);
    
    return this.formatDisplay(display);
  }

  // Update display
  async updateDisplay(displayId: string, input: UpdateDisplayInput): Promise<Display | null> {
    // Build update data object with only defined values
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Only add fields that are defined
    if (input.name !== undefined) updateData.name = input.name;
    if (input.location !== undefined) updateData.location = input.location;
    if (input.resolution !== undefined) updateData.resolution = input.resolution;
    if (input.orientation !== undefined) updateData.orientation = input.orientation as DisplayOrientation;
    if (input.assignedPlaylistId !== undefined) updateData.playlistId = input.assignedPlaylistId;
    if (input.isRaspberryPi !== undefined) updateData.isRaspberryPi = input.isRaspberryPi;
    
    // Handle clockSettings - ensure it's a valid JSON object
    if (input.clockSettings !== undefined) {
      // Ensure clockSettings is properly formatted as JSON
      updateData.clockSettings = JSON.parse(JSON.stringify(input.clockSettings));
    }

    try {
      const display = await prisma.display.update({
        where: { id: displayId },
        data: updateData,
        include: {
          playlist: {
            include: {
              items: {
                include: {
                  content: true,
                },
                orderBy: {
                  order: 'asc',
                },
              },
            },
          },
        },
      });

      return this.formatDisplay(display);
    } catch (error) {
      console.error('DisplayService.updateDisplay - Prisma error:', error);
      throw error;
    }
  }

  // Delete display
  async deleteDisplay(displayId: string): Promise<boolean> {
    const result = await prisma.display.delete({
      where: { id: displayId },
    });

    return !!result;
  }

  // Update display status
  async updateStatus(displayId: string, status: 'online' | 'offline'): Promise<void> {
    await prisma.display.update({
      where: { id: displayId },
      data: {
        isOnline: status === 'online',
        lastSeen: new Date(),
      },
    });
  }

  // Update display status and last seen
  async updateLastSeen(
    displayId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await prisma.display.update({
      where: { id: displayId },
      data: {
        isOnline: true,
        lastSeen: new Date(),
      },
    });
  }

  // Check display status (for monitoring)
  async checkDisplayStatus(displayId: string): Promise<DisplayStatus> {
    const display = await prisma.display.findUnique({
      where: { id: displayId },
      select: {
        lastSeen: true,
        isOnline: true,
      },
    });

    if (!display) return 'unknown';

    // Consider offline if not seen in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    if (!display.lastSeen || display.lastSeen < fiveMinutesAgo) {
      await prisma.display.update({
        where: { id: displayId },
        data: { isOnline: false },
      });
      return 'offline';
    }

    return display.isOnline ? 'online' : 'offline';
  }

  // Bulk create displays
  async bulkCreateDisplays(
    count: number,
    prefix: string,
    settings: Partial<CreateDisplayInput>,
    createdBy: string
  ): Promise<Display[]> {
    const displays: Display[] = [];

    for (let i = 1; i <= count; i++) {
      const display = await this.createDisplay({
        name: `${prefix} ${i}`,
        location: settings.location,
        resolution: settings.resolution || '1920x1080',
        orientation: (settings.orientation || 'LANDSCAPE') as any,
        assignedPlaylistId: settings.assignedPlaylistId,
        createdBy,
      });
      displays.push(display);
    }

    return displays;
  }

  // Regenerate display URL
  async regenerateUrl(displayId: string): Promise<string> {
    const newUrl = await this.generateUniqueUrl();

    await prisma.display.update({
      where: { id: displayId },
      data: {
        urlSlug: newUrl,
        updatedAt: new Date(),
      },
    });

    return newUrl;
  }

  // Format display from Prisma to application type
  private formatDisplay(display: any): Display {
    // Determine status based on isOnline and lastSeen
    let status: DisplayStatus = 'unknown';
    if (display.isOnline) {
      status = 'online';
    } else if (display.lastSeen) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      status = display.lastSeen > fiveMinutesAgo ? 'online' : 'offline';
    } else {
      status = 'offline';
    }

    // Format playlist if it exists
    let formattedPlaylist = display.playlist;
    if (display.playlist && display.playlist.items) {
      formattedPlaylist = {
        ...display.playlist,
        items: display.playlist.items.map((item: any) => ({
          id: item.id,
          contentId: item.contentId,
          order: item.order,
          duration: item.duration,
          transition: item.transitionType?.toLowerCase() || 'fade',
          transitionDuration: (item.transitionDuration || 1000) / 1000, // Convert ms to seconds
          title: item.content?.name || '',
          thumbnail: item.content?.filePath ? 
            `/uploads/${item.content.filePath.split('/uploads/').pop()}` : '',
          contentType: item.content?.type?.toLowerCase() || 'image',
          content: {
            ...item.content,
            // Extract just the relative path from uploads/ onwards
            fileUrl: item.content?.filePath ? (() => {
              const parts = item.content.filePath.split('/uploads/');
              const relativePath = parts.length > 1 ? parts[parts.length - 1] : parts[0];
              return `/uploads/${relativePath}`;
            })() : '',
            backgroundColor: item.content?.backgroundColor,
            metadata: item.content?.metadata
          },
          cropSettings: item.content?.cropSettings || item.cropSettings,
          backgroundColor: item.content?.backgroundColor
        }))
      };
    }

    return {
      id: display.id,
      name: display.name,
      description: '',  // No description field in schema
      location: display.location || '',
      uniqueUrl: display.urlSlug,  // Map urlSlug to uniqueUrl
      resolution: display.resolution,
      orientation: display.orientation,
      assignedPlaylistId: display.playlistId,
      assignedPlaylist: formattedPlaylist,
      status,
      lastSeen: display.lastSeen,
      ipAddress: '',  // No ipAddress field in schema
      userAgent: '',  // No userAgent field in schema
      createdAt: display.createdAt,
      updatedAt: display.updatedAt,
      createdBy: '',  // No createdBy field in schema
      isActive: true,  // Always true since we don't have soft delete
      settings: {},  // No settings field in schema
      clockSettings: display.clockSettings || {},
      isRaspberryPi: display.isRaspberryPi || false,
    };
  }
}

export const displayService = new DisplayService();