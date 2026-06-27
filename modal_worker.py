import os
import json
import modal

app = modal.App("lumora-worker")

image = (
    modal.Image.debian_slim()
    .pip_install(
        "openai", 
        "boto3", 
        "psycopg2-binary",
        "pgvector",
        "redis"
    )
)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("lumora-secrets")],
    schedule=modal.Cron("* * * * *"),
    timeout=300
)
def process_queue():
    import redis
    from openai import OpenAI
    import boto3
    import psycopg2
    from pgvector.psycopg2 import register_vector
    
    r = redis.Redis.from_url(os.environ["UPSTASH_REDIS_REST_URL"])
    
    # Process up to 10 items per invocation
    for _ in range(10):
        job = r.rpop("lumora:ai_jobs")
        if not job:
            break
            
        data = json.loads(job)
        media_id = data["mediaId"]
        r2_key = data["r2Key"]
        
        print(f"Processing media: {media_id}")
        
        s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
        
        # Download image
        s3.download_file(os.environ["R2_BUCKET_NAME"], r2_key, "/tmp/image.jpg")
        
        # Call OpenAI Vision to get description
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        import base64
        with open("/tmp/image.jpg", "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this image in extreme detail for semantic search."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
                    ],
                }
            ],
        )
        description = response.choices[0].message.content
        
        # Generate embedding
        embed_resp = client.embeddings.create(
            input=description,
            model="text-embedding-3-small"
        )
        embedding = embed_resp.data[0].embedding
        
        # Save to DB
        conn = psycopg2.connect(os.environ["DIRECT_URL"])
        register_vector(conn)
        cur = conn.cursor()
        
        cur.execute(
            "UPDATE \"Media\" SET \"aiDescription\" = %s, \"aiEmbedding\" = %s WHERE id = %s",
            (description, embedding, media_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        print(f"Finished processing media: {media_id}")
