from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, field_validator
from dotenv import load_dotenv
from pathlib import Path
import json
import os
import requests

load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
OPENROUTER_MODELS = [
    "nvidia/nemotron-3.5-super-vl:free",
    "openai/gpt-oss-120b",
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "z-ai/glm-4-5-air",
    "openai/gpt-oss-20b",
]

class FarmData(BaseModel):
    model_config = ConfigDict(extra='ignore')

    crop: str
    soil_type: str
    season: str
    location: str
    temp_min: int
    temp_max: int
    annual_rainfall: int
    land_size: float
    land_unit: str
    water_source: str
    farming_experience: str
    budget: str
    extra_notes: str = ""
    language: str = "English"

    @field_validator("temp_min", "temp_max", "annual_rainfall", mode="before")
    @classmethod
    def coerce_numbers(cls, value):
        if value is None or value == "":
            return 0
        return int(value)

    @field_validator("land_size", mode="before")
    @classmethod
    def coerce_land_size(cls, value):
        if value is None or value == "":
            return 0.0
        return float(value)

def build_prompt(d: FarmData) -> str:
    lang_note = f"IMPORTANT: Write your ENTIRE response in {d.language}." if d.language == "Marathi" else ""
    return f"""You are a world-class agricultural scientist and farming advisor.

Farmer Profile:
- Crop: {d.crop}
- Soil: {d.soil_type}
- Season: {d.season}
- Location: {d.location}
- Temperature: {d.temp_min}°C to {d.temp_max}°C
- Annual Rainfall: {d.annual_rainfall}mm
- Land: {d.land_size} {d.land_unit}
- Water Source: {d.water_source}
- Experience: {d.farming_experience}
- Budget: {d.budget}
- Notes: {d.extra_notes or "None"}


{lang_note}
Be specific with numbers, dates, quantities."""

def model_targets():
    if GROQ_API_KEY:
        yield "Groq", GROQ_MODEL, GROQ_URL, GROQ_API_KEY
    if OPENROUTER_API_KEY:
        for model in OPENROUTER_MODELS:
            yield "OpenRouter", model, OPENROUTER_URL, OPENROUTER_API_KEY

def call_model(prompt: str, model: str, url: str, api_key: str, stream: bool = True, provider: str = ""):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "OpenRouter":
        headers["HTTP-Referer"] = "https://crop-advisor.app"
        headers["X-Title"] = "Smart Crop Advisor"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are an expert agronomist. Format responses in clean Markdown. Be specific and data-driven."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_completion_tokens": 4000,
        "stream": stream,
    }
    return requests.post(url, headers=headers, json=payload, stream=stream, timeout=120)

@app.post("/api/advise")
async def advise(data: FarmData):
    prompt = build_prompt(data)

    def stream_gen():
        last_error = "Configure GROQ_API_KEY and/or OPENROUTER_API_KEY in backend/.env."
        for provider, model, url, api_key in model_targets():
            resp = None
            try:
                resp = call_model(prompt, model, url, api_key, provider=provider)
                if resp.status_code != 200:
                    try:
                        body = resp.json()
                        detail = body.get("error", {}).get("message", "")
                    except (ValueError, AttributeError):
                        detail = ""
                    if resp.status_code == 429:
                        last_error = f"{provider} {model} is rate-limited (HTTP 429)."
                    elif resp.status_code in (401, 402, 403):
                        last_error = f"{provider} rejected the request (HTTP {resp.status_code}). Check its API key and account access."
                    else:
                        last_error = f"{provider} {model}: {detail or f'HTTP {resp.status_code}'}"
                    continue

                received_content = False
                model_sent = False
                stream_error = ""
                for chunk in resp.iter_lines():
                    if not chunk:
                        continue
                    line = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
                    if line.startswith("data:"):
                        line = line[5:].strip()
                    if line == "[DONE]":
                        break
                    try:
                        obj = json.loads(line)
                    except (TypeError, ValueError):
                        continue

                    provider_error = obj.get("error")
                    if provider_error:
                        stream_error = provider_error.get("message", str(provider_error)) if isinstance(provider_error, dict) else str(provider_error)
                        break

                    choices = obj.get("choices") or []
                    delta = choices[0].get("delta", {}).get("content", "") if choices else ""
                    if isinstance(delta, list):
                        delta = "".join(part.get("text", "") for part in delta if isinstance(part, dict))
                    if delta:
                        if not model_sent:
                            yield f"data: {json.dumps({'type':'model','model':f'{provider}: {model}'})}\n\n"
                            model_sent = True
                        received_content = True
                        yield f"data: {json.dumps({'type':'token','text':delta})}\n\n"

                if received_content:
                    yield f"data: {json.dumps({'type':'done'})}\n\n"
                    return
                if stream_error:
                    last_error = f"{provider} {model} stream error: {stream_error}"
                else:
                    last_error = f"{provider} {model} returned an empty response."
            except requests.RequestException as exc:
                last_error = f"{provider} {model} request failed: {exc}"
            except Exception as exc:
                last_error = f"{provider} {model} response could not be read: {exc}"
            finally:
                if resp is not None:
                    resp.close()

        yield f"data: {json.dumps({'type':'error','message':f'All configured models failed. Last error: {last_error}'})}\n\n"

    return StreamingResponse(stream_gen(), media_type="text/event-stream")


@app.post("/api/alternatives")
async def alternatives(data: FarmData):
    prompt = f"""Given soil: {data.soil_type}, season: {data.season}, original crop: {data.crop}.
Suggest TOP 5 alternative crops. For each: name, why it suits, profitability (1-5 stars), difficulty (Easy/Medium/Hard).
Format as clean markdown list."""
    for provider, model, url, api_key in model_targets():
        resp = None
        try:
            resp = call_model(prompt, model, url, api_key, stream=False, provider=provider)
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                if "<think>" in content and "</think>" in content:
                    content = content[content.find("</think>")+8:].strip()
                return {"alternatives": content}
        except Exception:
            continue
        finally:
            if resp is not None:
                resp.close()
    return {"alternatives": "Could not load alternatives."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)