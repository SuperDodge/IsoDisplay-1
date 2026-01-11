import sharp from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';

// Note: Sharp's .rotate() method automatically rotates images based on EXIF orientation
// This ensures photos from phones/cameras display correctly regardless of how they were taken

// Image processing options
export interface ImageProcessingOptions {
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  backgroundColor?: string;
  preserveMetadata?: boolean;
}

// Thumbnail sizes
export const THUMBNAIL_SIZES = {
  small: { width: 200, height: 200 },
  medium: { width: 800, height: 800 },
  large: { width: 1920, height: 1080 },
  display: { width: 640, height: 360 }, // 16:9 aspect ratio for display preview
};

// Process uploaded image
export async function processImage(
  inputPath: string,
  outputDir: string,
  options: ImageProcessingOptions = {}
): Promise<{
  original: string;
  thumbnails: Record<string, string>;
  metadata: sharp.Metadata;
}> {
  const {
    quality = 85,
    format = 'webp',
    backgroundColor = '#ffffff',
    preserveMetadata = false,
  } = options;

  // Get image metadata and auto-rotate based on EXIF orientation
  const image = sharp(inputPath).rotate(); // This auto-rotates based on EXIF orientation
  const metadata = await image.metadata();

  // Ensure output directory exists (outputDir is already absolute)
  await fs.mkdir(outputDir, { recursive: true });

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const results: Record<string, string> = {};

  // Process thumbnails
  for (const [sizeName, dimensions] of Object.entries(THUMBNAIL_SIZES)) {
    // Skip display size here as it's handled separately
    if (sizeName === 'display') continue;
    
    const outputFileName = `${baseName}-${sizeName}.${format}`;
    const outputPath = path.join(outputDir, outputFileName);

    let pipeline = sharp(inputPath)
      .rotate() // Auto-rotate based on EXIF orientation
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    // Handle transparent images
    if (metadata.channels === 4 || metadata.hasAlpha) {
      pipeline = pipeline.flatten({ background: backgroundColor });
    }

    // Apply format and quality
    switch (format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, progressive: true });
        break;
      case 'png':
        pipeline = pipeline.png({ quality, compressionLevel: 9 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality, effort: 6 });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality, effort: 6 });
        break;
    }

    // Handle metadata - always remove orientation tag after rotation
    if (!preserveMetadata) {
      pipeline = pipeline.withMetadata({
        orientation: undefined // Remove orientation after rotating
      });
    } else {
      pipeline = pipeline.withMetadata({
        orientation: undefined // Remove orientation to prevent double rotation
      });
    }

    await pipeline.toFile(outputPath);
    results[sizeName] = outputPath;
  }

  // Process optimized original
  const originalOutputName = `${baseName}-original.${format}`;
  const originalOutputPath = path.join(outputDir, originalOutputName);
  
  let originalPipeline = sharp(inputPath).rotate(); // Auto-rotate based on EXIF
  
  // Only resize if larger than large size
  if (metadata.width && metadata.width > THUMBNAIL_SIZES.large.width) {
    originalPipeline = originalPipeline.resize(THUMBNAIL_SIZES.large.width, null, {
      withoutEnlargement: true,
    });
  }

  // Apply format and quality to original
  switch (format) {
    case 'jpeg':
      originalPipeline = originalPipeline.jpeg({ quality: 90, progressive: true });
      break;
    case 'png':
      originalPipeline = originalPipeline.png({ quality: 95 });
      break;
    case 'webp':
      originalPipeline = originalPipeline.webp({ quality: 90 });
      break;
    case 'avif':
      originalPipeline = originalPipeline.avif({ quality: 90 });
      break;
  }

  await originalPipeline.toFile(originalOutputPath);

  return {
    original: originalOutputPath,
    thumbnails: results,
    metadata,
  };
}

// Convert HEIC/HEIF to JPEG
export async function convertHeicToJpeg(
  inputPath: string,
  outputPath?: string
): Promise<string> {
  const output = outputPath || inputPath.replace(/\.(heic|heif)$/i, '.jpg');

  await sharp(inputPath)
    .rotate() // Auto-rotate based on EXIF orientation
    .jpeg({ quality: 90, progressive: true })
    .withMetadata({ orientation: undefined }) // Remove orientation after rotating
    .toFile(output);

  return output;
}

// Extract image metadata
export async function extractImageMetadata(imagePath: string): Promise<{
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  density?: number;
  hasAlpha?: boolean;
  orientation?: number;
  exif?: Record<string, any>;
}> {
  // Get metadata after auto-rotation to get correct dimensions
  const metadata = await sharp(imagePath).rotate().metadata();
  const originalMetadata = await sharp(imagePath).metadata(); // Get original for EXIF
  const stats = await fs.stat(imagePath);

  return {
    width: metadata.width, // Width after rotation
    height: metadata.height, // Height after rotation
    format: metadata.format,
    size: stats.size,
    density: metadata.density,
    hasAlpha: metadata.hasAlpha,
    orientation: originalMetadata.orientation, // Original orientation value
    exif: originalMetadata.exif as Record<string, any>,
  };
}

// Generate image preview with custom background
export async function generatePreviewWithBackground(
  inputPath: string,
  backgroundColor: string,
  outputPath?: string
): Promise<string> {
  const output = outputPath || inputPath.replace(/\.[^.]+$/, '-preview.jpg');
  const metadata = await sharp(inputPath).metadata();
  
  let pipeline = sharp(inputPath)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(1200, 1200, {
      fit: 'inside',
      withoutEnlargement: true,
    });

  // Apply background if image has transparency
  if (metadata.hasAlpha || metadata.channels === 4) {
    pipeline = pipeline.flatten({ background: backgroundColor });
  }
  
  await pipeline
    .jpeg({ quality: 85, progressive: true })
    .toFile(output);
  
  return output;
}

// Create image sprite sheet for video-like preview
export async function createImageSprite(
  imagePaths: string[],
  outputPath: string,
  options: {
    columns?: number;
    tileWidth?: number;
    tileHeight?: number;
  } = {}
): Promise<string> {
  const { columns = 4, tileWidth = 200, tileHeight = 200 } = options;
  const rows = Math.ceil(imagePaths.length / columns);
  
  // Create tiles
  const tiles = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const buffer = await sharp(imagePath)
        .rotate() // Auto-rotate based on EXIF orientation
        .resize(tileWidth, tileHeight, { fit: 'cover' })
        .toBuffer();
      return buffer;
    })
  );
  
  // Create composite image
  const compositeInputs = tiles.map((buffer, index) => ({
    input: buffer,
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight,
  }));
  
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(compositeInputs)
    .jpeg({ quality: 80 })
    .toFile(outputPath);
  
  return outputPath;
}

// Validate image dimensions for display
export async function validateImageForDisplay(
  imagePath: string,
  maxWidth: number = 3840,
  maxHeight: number = 2160
): Promise<{ valid: boolean; message?: string }> {
  // Check dimensions after auto-rotation
  const metadata = await sharp(imagePath).rotate().metadata();
  
  if (!metadata.width || !metadata.height) {
    return { valid: false, message: 'Could not determine image dimensions' };
  }
  
  if (metadata.width > maxWidth || metadata.height > maxHeight) {
    return {
      valid: false,
      message: `Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed (${maxWidth}x${maxHeight})`,
    };
  }
  
  return { valid: true };
}

// Generate display-accurate thumbnail from URL (for YouTube videos)
export async function generateDisplayThumbnailFromUrl(
  inputUrl: string,
  outputPath: string,
  backgroundColor: string = '#000000'
): Promise<string> {
  try {
    // Download the image from URL
    const response = await fetch(inputUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch thumbnail: ${response.statusText}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Parse the background color for sharp
    const bgColor = backgroundColor.startsWith('#') 
      ? backgroundColor 
      : '#000000';
    
    // Get the image metadata
    const metadata = await sharp(imageBuffer).metadata();
    const inputWidth = metadata.width || 640;
    const inputHeight = metadata.height || 360;
    
    // YouTube thumbnails come in different aspect ratios:
    // - Modern videos: 16:9 (1280x720, 1920x1080, etc.)
    // - Older videos: 4:3 with black bars already embedded
    // We need to detect if the thumbnail already has black bars
    
    const imageAspect = inputWidth / inputHeight;
    const is4x3WithBars = Math.abs(imageAspect - (4/3)) < 0.1; // Check if it's roughly 4:3
    
    let processedImage: Buffer;
    
    if (is4x3WithBars) {
      // For 4:3 thumbnails (likely with embedded black bars), 
      // crop to remove the black bars first, then resize to 16:9
      // YouTube typically adds black bars to make 16:9 content fit in 4:3
      // So we crop the center 75% height (which would be 16:9 content in 4:3 frame)
      const crop16x9Height = Math.round(inputHeight * 0.75);
      const cropTop = Math.round((inputHeight - crop16x9Height) / 2);
      
      processedImage = await sharp(imageBuffer)
        // First extract what should be the 16:9 content
        .extract({
          left: 0,
          top: cropTop,
          width: inputWidth,
          height: crop16x9Height
        })
        // Then resize to exactly 640x360
        .resize(640, 360, {
          fit: 'fill', // Fill the entire frame since we've already cropped
          position: 'center'
        })
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();
    } else {
      // For already 16:9 content or other aspect ratios, 
      // resize to fit within 640x360 and add padding if needed
      const targetAspect = 16 / 9;
      let resizeWidth, resizeHeight;
      
      if (imageAspect > targetAspect) {
        // Image is wider than 16:9 - fit to width
        resizeWidth = 640;
        resizeHeight = Math.round(640 / imageAspect);
      } else {
        // Image is taller or exactly 16:9 - fit to height
        resizeHeight = 360;
        resizeWidth = Math.round(360 * imageAspect);
      }
      
      // Process the image: resize and pad to exactly 640x360
      processedImage = await sharp(imageBuffer)
        .resize(resizeWidth, resizeHeight, {
          fit: 'inside',
          withoutEnlargement: false
        })
        .extend({
          top: Math.floor((360 - resizeHeight) / 2),
          bottom: Math.ceil((360 - resizeHeight) / 2),
          left: Math.floor((640 - resizeWidth) / 2),
          right: Math.ceil((640 - resizeWidth) / 2),
          background: bgColor
        })
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();
    }
    
    // Save to file
    await sharp(processedImage)
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Error generating display thumbnail from URL:', error);
    throw error;
  }
}

// Generate display-accurate thumbnail with letterboxing/pillarboxing
export async function generateDisplayThumbnail(
  inputPath: string,
  outputPath?: string,
  backgroundColor: string = '#000000',
  imageScale: 'contain' | 'cover' | 'fill' = 'contain',
  imageSize: number = 100
): Promise<string> {
  const output = outputPath || inputPath.replace(/\.[^.]+$/, '-display-thumb.jpg');
  
  try {
    // Parse the background color for sharp
    const bgColor = backgroundColor.startsWith('#') 
      ? backgroundColor 
      : '#000000';
    
    // Always create a 640x360 canvas with the background color
    const canvas = sharp({
      create: {
        width: 640,
        height: 360,
        channels: 3,
        background: bgColor
      }
    });
    
    // Get the input image metadata to calculate proper sizing (after rotation)
    const metadata = await sharp(inputPath).rotate().metadata();
    const inputWidth = metadata.width || 640;
    const inputHeight = metadata.height || 360;
    
    let resizedImage: Buffer;
    
    if (imageScale === 'cover') {
      // Cover: scale image to cover entire canvas, crop if necessary
      resizedImage = await sharp(inputPath)
        .rotate() // Auto-rotate based on EXIF orientation
        .resize(640, 360, {
          fit: 'cover',
          position: 'center'
        })
        .toBuffer();
    } else if (imageScale === 'fill') {
      // Fill: stretch image to fill entire canvas (may distort aspect ratio)
      resizedImage = await sharp(inputPath)
        .rotate() // Auto-rotate based on EXIF orientation
        .resize(640, 360, {
          fit: 'fill'
        })
        .toBuffer();
    } else {
      // Contain: fit image within canvas, apply size percentage
      const canvasAspect = 640 / 360;
      const imageAspect = inputWidth / inputHeight;
      
      let targetWidth, targetHeight;
      
      if (imageAspect > canvasAspect) {
        // Image is wider - fit to width
        targetWidth = Math.round(640 * (imageSize / 100));
        targetHeight = Math.round(targetWidth / imageAspect);
      } else {
        // Image is taller - fit to height
        targetHeight = Math.round(360 * (imageSize / 100));
        targetWidth = Math.round(targetHeight * imageAspect);
      }
      
      // Ensure we don't exceed the canvas size even at 100%
      if (targetWidth > 640) {
        targetWidth = 640;
        targetHeight = Math.round(targetWidth / imageAspect);
      }
      if (targetHeight > 360) {
        targetHeight = 360;
        targetWidth = Math.round(targetHeight * imageAspect);
      }
      
      resizedImage = await sharp(inputPath)
        .rotate() // Auto-rotate based on EXIF orientation
        .resize(targetWidth, targetHeight, {
          fit: 'inside',  // Changed from 'fill' to 'inside' to preserve aspect ratio
          withoutEnlargement: true
        })
        .toBuffer();
    }
    
    // Composite the resized image onto the canvas
    await canvas
      .composite([{
        input: resizedImage,
        gravity: 'center'
      }])
      .jpeg({ quality: 85, progressive: true })
      .toFile(output);
      
  } catch (error) {
    console.error('Error generating display thumbnail:', error);
    // Fallback: create a simple thumbnail
    await sharp({
      create: {
        width: 640,
        height: 360,
        channels: 3,
        background: backgroundColor || '#000000'
      }
    })
      .composite([{
        input: await sharp(inputPath)
          .rotate() // Auto-rotate based on EXIF orientation
          .resize(640, 360, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .toBuffer(),
        gravity: 'center'
      }])
      .jpeg({ quality: 85 })
      .toFile(output);
  }
  
  return output;
}

// Batch process images
export async function batchProcessImages(
  imagePaths: string[],
  outputDir: string,
  options: ImageProcessingOptions = {}
): Promise<Array<{
  input: string;
  output: Awaited<ReturnType<typeof processImage>>;
  error?: string;
}>> {
  const results = [];
  
  for (const imagePath of imagePaths) {
    try {
      const output = await processImage(imagePath, outputDir, options);
      results.push({ input: imagePath, output });
    } catch (error) {
      results.push({
        input: imagePath,
        output: null as any,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return results;
}