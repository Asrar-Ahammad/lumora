const { S3Client, PutBucketCorsCommand } = require("@aws-sdk/client-s3");
require("dotenv").config({ path: ".env.local" });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const corsParams = {
  Bucket: bucketName,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        AllowedOrigins: ["*"],
        ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
        MaxAgeSeconds: 3600,
      },
    ],
  },
};

const command = new PutBucketCorsCommand(corsParams);

r2Client.send(command)
  .then(() => console.log("CORS configured successfully!"))
  .catch((err) => console.error("Failed to configure CORS:", err));
