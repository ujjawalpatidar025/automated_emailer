import dns from "node:dns";
import mongoose from "mongoose";

export async function connectDB(uri) {
  if (!uri) {
    throw new Error("MONGO_URI is not set. Add it to server/.env");
  }

  // mongodb+srv:// needs a raw DNS SRV/TXT lookup to expand into the real
  // shard hosts. Some networks/VPNs block that specific query type even
  // though normal hostname lookups work fine (it fails as
  // `querySrv ECONNREFUSED`) — pointing Node at public resolvers for just
  // this fixes it without needing to hardcode Atlas's shard hostnames.
  if (uri.startsWith("mongodb+srv://")) {
    try {
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
    } catch {
      /* non-fatal — fall back to whatever was already configured */
    }
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[db] connected: ${mongoose.connection.host} / ${mongoose.connection.name}`);

  mongoose.connection.on("error", (err) => {
    console.error("[db] connection error:", err.message);
  });
}
