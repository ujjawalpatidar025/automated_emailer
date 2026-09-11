import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  register,
  login,
  logout,
  me,
  updateMe,
  mailerHealth,
} from "../controllers/authController.js";

const router = Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post("/register", h(register));
router.post("/login", h(login));
router.post("/logout", h(logout));
router.get("/me", requireAuth, h(me));
router.patch("/me", requireAuth, h(updateMe));
router.get("/mailer-health", requireAuth, h(mailerHealth));

export default router;
