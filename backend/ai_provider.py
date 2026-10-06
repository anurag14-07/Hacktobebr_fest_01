import json
import logging
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


def generate_educational_answer(
    question: str,
    history: list[dict] | None = None,
    report_excerpt: str | None = None,
) -> dict[str, object] | None:
    api_key = os.getenv("GEMMA_API_KEY")
    model = os.getenv("GEMMA_MODEL", "gemma-3-27b-it")
    endpoint = os.getenv(
        "GEMMA_API_URL",
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    )
    if not api_key:
        return None

    model_id = quote(model, safe="-._")
    endpoint = endpoint.replace("{model}", model_id).replace(f"{{{model}}}", model_id)
    if "{" in endpoint or "}" in endpoint:
        logger.error("Gemini API URL contains an unresolved placeholder.")
        return None
    separator = "&" if "?" in endpoint else "?"
    url = f"{endpoint}{separator}{urlencode({'key': api_key})}"
    history_lines = []
    for item in (history or [])[-8:]:
        role = "User" if item.get("role") == "user" else "Assistant"
        history_lines.append(f"{role}: {item.get('content', '')}")
    history_block = "\n".join(history_lines) or "None"
    report_block = (report_excerpt or "").strip()[:4000] or "No report text is available."
    prompt = (
        "You are an educational health-information assistant, not a clinician. "
        "Do not diagnose, prescribe medicines, recommend or calculate doses, "
        "or advise changing treatment. Do not invent lab values or claim to have "
        "reviewed a report unless report text is provided below. "
        "Answer in plain language and return only a JSON object with string keys "
        "summary, explanation, suggested_next_step, and disclaimer, plus an "
        "important_points array of strings. Encourage a qualified clinician for "
        "personal interpretation. If the user describes a possible emergency, "
        "tell them to contact local emergency services.\n\n"
        f"Report context:\n{report_block}\n\n"
        f"Recent conversation:\n{history_block}\n\n"
        f"Question: {question}"
    )
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }
    ).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=40) as response:
            payload = json.loads(response.read())
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
        result = json.loads(text)
        if not isinstance(result, dict):
            logger.warning("Gemini API returned JSON that was not an object.")
            return None
        required = {"summary", "explanation", "important_points", "suggested_next_step", "disclaimer"}
        if not required.issubset(result) or not isinstance(result["important_points"], list):
            logger.warning("Gemini API response did not match the expected answer shape.")
            return None
        if not all(isinstance(result[key], str) for key in required - {"important_points"}) or not all(
            isinstance(point, str) for point in result["important_points"]
        ):
            logger.warning("Gemini API response contains invalid field types.")
            return None
        return result
    except HTTPError as error:
        logger.warning("Gemini API request failed with HTTP %s.", error.code)
        return None
    except (URLError, TimeoutError) as error:
        logger.warning("Gemini API request could not complete: %s.", error)
        return None
    except (KeyError, IndexError, TypeError, ValueError) as error:
        logger.warning("Gemini API returned an invalid response: %s.", error)
        return None
