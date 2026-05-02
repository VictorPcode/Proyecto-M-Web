import "dotenv/config";
import express from "express";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});
