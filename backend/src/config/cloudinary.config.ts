import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from './env.config.js';
import { logger } from '../utils/logger.js';
import { Readable } from 'stream';

if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('Cloudinary SDK configured successfully');
} else {
  logger.warn('Cloudinary environment variables missing. Media upload to cloud is unconfigured.');
}

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format?: string;
  bytes: number;
}

/**
 * Upload a file Buffer directly to Cloudinary using upload_stream.
 */
export const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder: string = 'talkchat',
  resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          logger.error({ error }, 'Cloudinary upload error');
          return reject(error || new Error('Upload to Cloudinary failed'));
        }

        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Delete an asset from Cloudinary by its publicId.
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<any> => {
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error) {
    logger.error({ error, publicId }, 'Cloudinary deletion failed');
    throw error;
  }
};

export { cloudinary };
