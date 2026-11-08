// GET /api/health — quick check that the functions are deployed and the key is set.
export function GET() {
  return Response.json({ status: 'UP', backend: 'vercel', geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY) })
}
