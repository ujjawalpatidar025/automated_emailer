import { verifyToken } from "../utils/jwt.js";

// Bearer token in the Authorization header is the normal path. A `token`
// query param is accepted too, ONLY for the SSE stream route — EventSource
// can't set custom headers, so that's the one request type with no other
// way to authenticate.
function extractToken(req) {
  const auth = req.headers.authorization || "";
  const [scheme, value] = auth.split(" ");
  if (scheme === "Bearer" && value) return value;
  if (typeof req.query?.token === "string" && req.query.token) return req.query.token;
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Session expired — please log in again" });
  }
}
