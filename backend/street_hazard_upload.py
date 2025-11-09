import os, mimetypes
from pathlib import Path
from typing import Optional, Tuple
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "hazard-images")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def upload_local_file_to_supabase(
    file_path: str | Path,
    storage_prefix: str = "",
    bucket: str = SUPABASE_BUCKET,
    make_public: bool = True,
    sign_seconds: Optional[int] = None,
    upsert: bool = True,
) -> Tuple[str, Optional[str]]:
    p = Path(file_path).resolve()
    if not p.exists():
        raise FileNotFoundError(str(p))

    storage_path = f"{storage_prefix.strip('/')}/{p.name}" if storage_prefix else p.name
    data = p.read_bytes()
    ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"

    supabase.storage.from_(bucket).upload(
        path=storage_path,
        file=data,
        file_options={
            "cache-control": "3600",
            "content-type": ctype,
            "upsert": str(upsert).lower(),
        },
    )

    url = None
    if make_public:
        url = supabase.storage.from_(bucket).get_public_url(storage_path)
    elif sign_seconds:
        signed = supabase.storage.from_(bucket).create_signed_url(storage_path, sign_seconds)
        url = signed.get("signedURL")

    return storage_path, url
