import express from "express";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = 4001;
httpServer.listen(PORT, () => {
  console.log(`Minimal test server on port ${PORT}`);
});

console.log("After httpServer.listen()");
