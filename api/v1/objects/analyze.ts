// POST /api/v1/objects/analyze  (multipart field "image") — same contract as the Java backend.
import { ApiFailure, MAX_IMAGE_BYTES, analyzeWithGemini, detectMimeType, handle, json } from '../../_lib/core.js'
import { applySafety } from '../../_lib/safety.js'

export const POST = handle(async (req) => {
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    throw new ApiFailure(415, 'REQUEST_ERROR', 'The request could not be processed.')
  }
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_IMAGE_BYTES + 512 * 1024) {
    throw new ApiFailure(413, 'FILE_TOO_LARGE', 'The image is larger than the maximum allowed size.')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ApiFailure(400, 'INVALID_REQUEST', 'The request body is missing or malformed.')
  }
  const file = form.get('image')
  if (!file || typeof file === 'string') {
    throw new ApiFailure(400, 'MISSING_IMAGE', "Please attach an image in the 'image' field.")
  }
  const data = new Uint8Array(await file.arrayBuffer())
  if (data.length === 0) throw new ApiFailure(400, 'EMPTY_FILE', 'No image was provided, or the file is empty.')
  if (data.length > MAX_IMAGE_BYTES) {
    throw new ApiFailure(413, 'FILE_TOO_LARGE', 'The image is larger than the maximum allowed size.')
  }
  const mimeType = detectMimeType(data)
  if (!mimeType) {
    throw new ApiFailure(415, 'UNSUPPORTED_TYPE', 'Unsupported image type. Please upload a JPEG, PNG or WebP image.')
  }

  const start = Date.now()
  const report = applySafety(await analyzeWithGemini(data, mimeType))
  // Log only metadata. Never the image, never the model's full output.
  console.log(
    `[knowit] analyzed type=${mimeType} bytes=${data.length} confidence=${report.identification.confidence} ` +
      `risk=${report.safety.riskLevel} took=${Date.now() - start}ms`,
  )
  return json(report)
})
