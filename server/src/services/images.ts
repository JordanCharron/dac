import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import env from '../lib/env.js';

const THUMB_DIR = path.resolve(env.UPLOAD_DIR, 'thumbs');
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

export async function processUploadedImage(fullPath: string, filename: string): Promise<string> {
  try {
    // Normalize original: max 1200px wide, quality 85
    const normalized = await sharp(fullPath).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    fs.writeFileSync(fullPath, normalized);

    // Thumbnail: 200x200 cover
    const thumbPath = path.join(THUMB_DIR, filename);
    await sharp(normalized).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(thumbPath);
  } catch (err) {
    console.warn('[images] processing failed:', err);
  }
  return `/uploads/${filename}`;
}
