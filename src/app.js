const cors = require("cors");
const express = require("express");
const apiRouter = require("./routes");
const phoneComparisonRouter = require("./routes/phone-comparison");
const errorHandler = require("./middleware/error-handler");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    database: require("mongoose").connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.use("/api/v1", apiRouter);
app.use("/api/phones", phoneComparisonRouter);
app.use("/api/v1/phones", phoneComparisonRouter);
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});
app.use(errorHandler);

module.exports = app;
