import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { encryptSecret, decryptSecret } from "../utils/crypto.js";
import { signToken } from "../utils/jwt.js";
import { verifyMailerFor } from "../services/mailer.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "token";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

function setAuthCookie(res, userId) {
  res.cookie(COOKIE_NAME, signToken({ sub: String(userId) }), cookieOptions());
}

const clean = (s) => (typeof s === "string" ? s.trim() : "");

// POST /api/auth/register
export async function register(req, res) {
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const password = req.body.password || "";
  const gmailAddress = clean(req.body.gmailAddress).toLowerCase();
  const gmailSenderName = clean(req.body.gmailSenderName) || name;
  const gmailAppPassword = clean(req.body.gmailAppPassword).replace(/\s+/g, "");

  if (!name) return res.status(400).json({ error: "Your name is required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!EMAIL_RE.test(gmailAddress)) {
    return res.status(400).json({ error: "Enter the Gmail address you'll send campaigns from" });
  }
  if (!gmailAppPassword) {
    return res.status(400).json({ error: "A Gmail App Password is required to send email" });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  // Catch a bad app password or typo'd Gmail address right at signup, rather
  // than the first time the user tries to send a campaign.
  try {
    await verifyMailerFor({ gmailAddress }, gmailAppPassword);
  } catch (err) {
    return res.status(400).json({
      error: `Could not sign in to Gmail with those details: ${err.message}`,
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    gmailAddress,
    gmailSenderName,
    gmailAppPasswordEnc: encryptSecret(gmailAppPassword),
  });

  setAuthCookie(res, user._id);
  res.status(201).json({ user });
}

// POST /api/auth/login
export async function login(req, res) {
  const email = clean(req.body.email).toLowerCase();
  const password = req.body.password || "";
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  setAuthCookie(res, user._id);
  user.passwordHash = undefined;
  res.json({ user });
}

// POST /api/auth/logout
export function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}

// GET /api/auth/me
export async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user });
}

// PATCH /api/auth/me — update profile / rotate the Gmail App Password
export async function updateMe(req, res) {
  const user = await User.findById(req.userId).select("+gmailAppPasswordEnc");
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { name, gmailAddress, gmailSenderName, gmailAppPassword } = req.body;

  if (name != null) {
    const n = clean(name);
    if (!n) return res.status(400).json({ error: "Name cannot be empty" });
    user.name = n;
  }

  if (gmailAddress != null || gmailAppPassword != null) {
    const nextAddress = clean(gmailAddress || user.gmailAddress).toLowerCase();
    if (!EMAIL_RE.test(nextAddress)) {
      return res.status(400).json({ error: "Enter a valid Gmail address" });
    }
    const nextPassword = clean(gmailAppPassword).replace(/\s+/g, "")
      || decryptSecret(user.gmailAppPasswordEnc);

    try {
      await verifyMailerFor({ gmailAddress: nextAddress }, nextPassword);
    } catch (err) {
      return res.status(400).json({
        error: `Could not sign in to Gmail with those details: ${err.message}`,
      });
    }
    user.gmailAddress = nextAddress;
    user.gmailAppPasswordEnc = encryptSecret(nextPassword);
  }

  if (gmailSenderName != null) user.gmailSenderName = clean(gmailSenderName);

  await user.save();
  res.json({ user });
}

// GET /api/auth/mailer-health — verify the CURRENT user's stored credentials
export async function mailerHealth(req, res) {
  try {
    const user = await User.findById(req.userId).select("+gmailAppPasswordEnc");
    if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
    const appPassword = decryptSecret(user.gmailAppPasswordEnc);
    const info = await verifyMailerFor(user, appPassword);
    res.json(info);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}
