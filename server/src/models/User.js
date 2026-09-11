import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true, select: false },

    // The Gmail account this user sends campaigns from.
    gmailAddress: { type: String, required: true, trim: true, lowercase: true },
    gmailSenderName: { type: String, trim: true, default: "" },
    // AES-256-GCM ciphertext (see utils/crypto.js) — never returned by default.
    gmailAppPasswordEnc: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.gmailAppPasswordEnc;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);
