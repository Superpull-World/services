import express, { Request, Response } from 'express';
import multer from 'multer';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { verifyJWT } from '../middleware/auth';
import { JwtPayload } from 'jsonwebtoken';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

interface FileRequest extends Request {
  file?: Express.Multer.File;
  user?: string | JwtPayload;
}

const s3Client = new S3Client({
  endpoint: 'https://s3.filebase.com',
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.FILEBASE_SECRET_ACCESS_KEY!,
  },
  region: 'us-east-1',
});

router.post(
  '/',
  verifyJWT,
  upload.single('file'),
  async (req: FileRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const fileBuffer = req.file.buffer;
      const fileName = `${Date.now()}-${req.file.originalname}`;

      const uploadParams = {
        Bucket: process.env.FILEBASE_BUCKET_NAME!,
        Key: fileName,
        Body: fileBuffer,
        ContentType: req.file.mimetype,
      };

      // Upload file
      await s3Client.send(new PutObjectCommand(uploadParams));

      // Get file metadata to retrieve CID
      const headParams = {
        Bucket: process.env.FILEBASE_BUCKET_NAME!,
        Key: fileName,
      };

      const headResponse = await s3Client.send(
        new HeadObjectCommand(headParams),
      );
      const cid = headResponse.Metadata?.['cid'];

      console.log('File metadata:', headResponse.Metadata);
      console.log('File CID:', cid);

      const fileUrl = `https://${process.env.FILEBASE_BUCKET_NAME}.s3.filebase.com/${fileName}`;
      const ipfsUrl = cid
        ? `${process.env.FILEBASE_IPFS_GATEWAY}/${cid}`
        : undefined;

      res.json({
        success: true,
        data: {
          fileName,
          fileUrl,
          ipfsUrl,
          cid,
          contentType: req.file.mimetype,
          size: req.file.size,
        },
      });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  },
);

export default router;
