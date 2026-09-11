import mongoose from "mongoose";

const recipientSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: String, default: null },
    // extra CSV columns, so {{placeholders}} can use them
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true }
);

const batchLogSchema = new mongoose.Schema(
  {
    batchNo: Number,
    trigger: String, // manual | scheduled | retry
    requested: Number,
    attempted: Number,
    sent: Number,
    failed: Number,
    stoppedEarly: Boolean,
    stopReason: String,
    pickFrom: String,
    pickOffset: Number,
    finishedAt: Date,
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: "09:00" }, // 24h HH:MM, server-local
    count: { type: Number, default: 50 },
    lastRunDate: { type: String, default: null }, // YYYY-MM-DD
    lastRunAt: { type: Date, default: null },
    lastResult: { type: String, default: null },
  },
  { _id: false }
);

const progressSchema = new mongoose.Schema(
  {
    inProgress: { type: Boolean, default: false },
    batchNo: Number,
    total: Number,
    index: Number,
    currentEmail: String,
    trigger: String,
    startedAt: Date,
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true },
    // may contain {{name}} / {{email}} / {{anyCsvColumn}} / {{key|fallback}}
    body: { type: String, required: true },
    isHtml: { type: Boolean, default: false },

    resume: {
      path: String,
      originalName: String,
      mimeType: String,
      size: Number,
    },

    recipients: { type: [recipientSchema], default: [] },

    status: {
      type: String,
      enum: ["draft", "sending", "paused", "completed", "failed"],
      default: "draft",
    },

    pickFrom: { type: String, enum: ["start", "end", "offset"], default: "start" },
    pickOffset: { type: Number, default: 0 },

    schedule: { type: scheduleSchema, default: () => ({}) },
    progress: { type: progressSchema, default: () => ({ inProgress: false }) },

    lastSendReport: { type: batchLogSchema, default: null },
    batchLog: { type: [batchLogSchema], default: [] },
  },
  { timestamps: true }
);

campaignSchema.virtual("counts").get(function () {
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const r of this.recipients) {
    if (r.status === "sent") sent += 1;
    else if (r.status === "failed") failed += 1;
    else pending += 1;
  }
  return { total: this.recipients.length, sent, failed, pending };
});

campaignSchema.set("toJSON", { virtuals: true });
campaignSchema.set("toObject", { virtuals: true });

export const Campaign = mongoose.model("Campaign", campaignSchema);
