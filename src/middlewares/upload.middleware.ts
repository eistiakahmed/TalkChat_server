import multer from 'multer';
import { BadRequestError } from '../errors/AppError.js';

// Use memory storage for direct Cloudinary stream upload
const storage = multer.memoryStorage();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    // Allowed mime types
    const allowedMimeTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      // Audio
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/mp4',
      'audio/webm',
      // Video
      'video/mp4',
      'video/webm',
      'video/quicktime',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`Unsupported file type: ${file.mimetype}`));
    }
  },
});
