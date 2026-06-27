require('dotenv').config({ path: '.env.local' });
const { generatePresignedPutUrl } = require('./src/lib/r2');

async function test() {
  try {
    console.log("Testing generatePresignedPutUrl...");
    console.log("R2 Bucket:", process.env.R2_BUCKET_NAME);
    const url = await generatePresignedPutUrl("test-key.txt", "text/plain", 100);
    console.log("Success! Presigned URL:", url);
  } catch (err) {
    console.error("Error generating presigned URL:", err);
  }
}

test();
