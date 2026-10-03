import { v2 as cloudinary } from "cloudinary";

let configured = false;

/**
 * Lazily configures the Cloudinary SDK from env vars and returns the client.
 * Done lazily (not at import time) so a deployment missing these vars only
 * fails when someone actually uploads a resume, not on every cold start.
 */
function client() {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error(
        "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must all be set to upload a resume"
      );
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

// Resumes are PDFs/Word docs, not images — `resource_type: "raw"` stores and
// serves the original bytes untouched, which is what a plain email
// attachment needs (an image/video pipeline would be allowed to transcode).
const RESOURCE_TYPE = "raw";
const FOLDER = "automator-email/resumes";

/** Uploads a resume buffer to Cloudinary; returns { url, publicId }. */
export async function uploadResume(buffer, originalName) {
  const dataUri = `data:application/octet-stream;base64,${buffer.toString("base64")}`;
  const safeName = originalName.replace(/[^\w.\-]+/g, "_");
  const result = await client().uploader.upload(dataUri, {
    resource_type: RESOURCE_TYPE,
    folder: FOLDER,
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`,
    use_filename: true,
    unique_filename: false,
  });
  return { url: result.secure_url, publicId: result.public_id };
}

/** Deletes a previously-uploaded resume. Best-effort — a stale asset left
 * behind on failure costs storage, not correctness. */
export async function deleteResume(publicId) {
  if (!publicId) return;
  await client().uploader.destroy(publicId, { resource_type: RESOURCE_TYPE });
}
