import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { HttpError } from "@/lib/auth";

const R2_PART_URL_TTL_SECONDS = 60 * 60;

let client: S3Client | null = null;

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!bucket) throw new HttpError(503, "Le stockage de fichiers R2 n'est pas configuré");
  return bucket;
}

function getClient(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HttpError(503, "Le stockage de fichiers R2 n'est pas configuré");
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export async function beginR2MultipartUpload(input: {
  key: string;
  contentType: string;
}): Promise<string> {
  const result = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: getBucket(),
      Key: input.key,
      ContentType: input.contentType,
    }),
  );
  if (!result.UploadId) throw new Error("R2 n'a pas retourné d'identifiant d'upload");
  return result.UploadId;
}

export async function signR2UploadPart(input: {
  key: string;
  uploadId: string;
  partNumber: number;
}): Promise<string> {
  return getSignedUrl(
    getClient(),
    new UploadPartCommand({
      Bucket: getBucket(),
      Key: input.key,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    }),
    { expiresIn: R2_PART_URL_TTL_SECONDS },
  );
}

export async function completeR2MultipartUpload(input: {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}): Promise<void> {
  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map(({ partNumber, etag }) => ({
          PartNumber: partNumber,
          ETag: etag,
        })),
      },
    }),
  );
}

export async function abortR2MultipartUpload(input: {
  key: string;
  uploadId: string;
}): Promise<void> {
  await getClient().send(
    new AbortMultipartUploadCommand({
      Bucket: getBucket(),
      Key: input.key,
      UploadId: input.uploadId,
    }),
  );
}

export async function getR2ObjectSize(key: string): Promise<number | null> {
  try {
    const result = await getClient().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    return result.ContentLength ?? null;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof error.$metadata === "object" &&
      error.$metadata !== null &&
      "httpStatusCode" in error.$metadata &&
      error.$metadata.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

export async function signR2Download(key: string, fileName: string): Promise<string> {
  const safeFileName = fileName.replace(/[\r\n"]/g, "_");
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
      ResponseContentType: "application/octet-stream",
    }),
    { expiresIn: R2_PART_URL_TTL_SECONDS },
  );
}

export async function deleteR2Object(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}
