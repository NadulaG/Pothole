#!/usr/bin/env python3
"""
Basic integration test:
- Supabase connectivity
- Fetch 1 hazard id (or use --hazard-id)
- Dedalus agent + hosted MCP server tool calls
- Returns compact JSON + timings
"""

import os, sys, json, time, asyncio, argparse
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client
from dedalus_labs import AsyncDedalus, DedalusRunner

# ---------- Config ----------
DEFAULT_MODEL = os.getenv("DEDALUS_MODEL", "openai/gpt-5-mini")
DEFAULT_MCP  = os.getenv("DEDALUS_MCP_SLUG", "ez2103/pothole-mcp-server")
AGENT_TIMEOUT_SEC = int(os.getenv("AGENT_TIMEOUT_SEC", "30"))

def die(msg: str, code: int = 1):
    print(json.dumps({"ok": False, "error": msg}, indent=2))
    sys.exit(code)

async def run_agent(prompt: str, model: str, mcp: str, timeout_s: int) -> str:
    client = AsyncDedalus()
    runner = DedalusRunner(client)

    async def call():
        resp = await runner.run(
            input=prompt,
            model=model,
            mcp_servers=[mcp],
            stream=False
        )
        return resp.final_output

    return await asyncio.wait_for(call(), timeout=timeout_s)

def build_prompt(hazard: dict) -> str:
    hid = hazard.get("id")
    hazard_json = json.dumps(hazard, default=str, indent=2)
    return f"""
You are a municipal hazard planning agent. Do NOT classify anything.
Use ONLY the MCP tools `estimate_repair_plan` and `project_worsening`.

Hazard record (from DB):
{hazard_json}

Tasks:
1) Call estimate_repair_plan(hazard_id="{hid}").
2) Call project_worsening(hazard_id="{hid}", horizon_days=30).
3) Return ONLY valid, compact JSON:
{{
  "hazard_id": "{hid}",
  "plan": <full_output_from_estimate_repair_plan>,
  "projection_30d": <full_output_from_project_worsening>
}}
""".strip()

def main():
    load_dotenv()  # optional .env/.env.local support

    parser = argparse.ArgumentParser(description="Supabase + MCP agent smoke test")
    parser.add_argument("--hazard-id", help="Existing hazard UUID to test")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--mcp", default=DEFAULT_MCP)
    parser.add_argument("--timeout", type=int, default=AGENT_TIMEOUT_SEC)
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        die("Missing SUPABASE_URL or SUPABASE_KEY in env")

    # 1) Supabase ping + get hazard
    t0 = time.time()
    try:
        sb: Client = create_client(supabase_url, supabase_key)
    except Exception as e:
        die(f"Failed to create Supabase client: {e}")

    hazard_id: Optional[str] = args.hazard_id
    try:
        if hazard_id:
            res = sb.table("hazards").select("*").eq("id", hazard_id).limit(1).execute()
        else:
            # Grab the most recent as a default test record
            res = (
                sb.table("hazards")
                .select("*")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
        rows = res.data or []
    except Exception as e:
        die(f"Supabase query failed: {e}")

    if not rows:
        die("No hazard found to test (supply --hazard-id or insert a row).")

    hazard = rows[0]
    hazard_id = hazard.get("id")
    t_sb = round(time.time() - t0, 3)

    # 2) Build prompt for MCP tools
    prompt = build_prompt(hazard)

    # 3) Run agent with timeout
    t1 = time.time()
    try:
        output_text = asyncio.run(run_agent(prompt, args.model, args.mcp, args.timeout))
    except asyncio.TimeoutError:
        die(f"Agent call exceeded {args.timeout}s (timeout)")
    except Exception as e:
        die(f"Agent/MCP error: {e}")
    t_agent = round(time.time() - t1, 3)

    # 4) Parse JSON (or pass through raw)
    try:
        payload = json.loads(output_text)
        ok = True
    except Exception:
        payload = {"raw_agent_output": output_text}
        ok = False  # not strictly an error, but mark non-JSON

    result = {
        "ok": ok,
        "model": args.model,
        "mcp": args.mcp,
        "hazard_id": hazard_id,
        "timings": {"supabase_s": t_sb, "agent_s": t_agent, "total_s": round(time.time()-t0, 3)},
        "output": payload,
    }
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
