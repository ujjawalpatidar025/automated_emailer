import jwt from "jsonwebtoken";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set in server/.env");
  return s;
}

export function signToken(payload) {
  return jwt.sign(payload, secret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}
