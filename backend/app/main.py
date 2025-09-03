from fastapi import FastAPI

app = FastAPI(title="mirror-os backend")

@app.get("/health")
def health():
    return {"status": "ok"}
