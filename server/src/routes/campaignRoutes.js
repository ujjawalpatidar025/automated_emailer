import { Router } from "express";
import { uploadCampaignFiles } from "../middleware/upload.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  sendBatch,
  sendSelected,
  retryFailed,
  streamCampaign,
  getCampaignAnalytics,
  getGlobalAnalytics,
} from "../controllers/campaignController.js";

const router = Router();

// wrap async handlers so rejections hit the error middleware
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireAuth);

router.get("/analytics", h(getGlobalAnalytics));

router.post("/campaigns", uploadCampaignFiles, h(createCampaign));
router.get("/campaigns", h(listCampaigns));
router.get("/campaigns/:id", h(getCampaign));
router.patch("/campaigns/:id", h(updateCampaign));
router.delete("/campaigns/:id", h(deleteCampaign));

router.post("/campaigns/:id/send", h(sendBatch));
router.post("/campaigns/:id/send-selected", h(sendSelected));
router.post("/campaigns/:id/retry-failed", h(retryFailed));
router.get("/campaigns/:id/stream", h(streamCampaign));
router.get("/campaigns/:id/analytics", h(getCampaignAnalytics));

export default router;
