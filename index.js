require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./src/app");

const port = Number(process.env.PORT) || 5000;
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(1);
}

async function start() {
  await mongoose.connect(mongoUri);
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
