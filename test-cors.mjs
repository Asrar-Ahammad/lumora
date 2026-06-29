import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import 'dotenv/config';

async function test() {
  const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: "test-cors-file.txt",
    ContentType: "text/plain",
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn: 900 });
  console.log("URL:", url);

  const res = await fetch(url, {
    method: "OPTIONS",
    headers: {
      "Origin": "http://localhost:3000",
      "Access-Control-Request-Method": "PUT"
    }
  });

  console.log("OPTIONS status:", res.status);
  console.log("CORS Headers:", res.headers.get("access-control-allow-origin"));
  
  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "text/plain"
    },
    body: "hello world"
  });
  console.log("PUT status:", putRes.status);
  const text = await putRes.text();
  console.log("PUT response:", text.substring(0, 200));
}

test();
