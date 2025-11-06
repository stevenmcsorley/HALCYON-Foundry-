"""AI-assisted playbook generation and explanation."""
import os
import json
import logging
from typing import Dict, Any, Optional
import httpx

logger = logging.getLogger("enrichment.ai")


# Available enrichment actions for context
AVAILABLE_ACTIONS = [
    {"id": "geoip", "name": "GeoIP Lookup", "kind": "geoip", "description": "Get geolocation data for an IP address"},
    {"id": "whois", "name": "WHOIS Lookup", "kind": "whois", "description": "Get WHOIS information for IP or domain"},
    {"id": "vt-hash", "name": "VirusTotal Hash", "kind": "vt_hash_lookup", "description": "Check file hash against VirusTotal"},
    {"id": "reverse-geocode", "name": "Reverse Geocode", "kind": "reverse_geocode", "description": "Convert coordinates to address"},
    {"id": "keyword-match", "name": "Keyword Match", "kind": "keyword_match", "description": "Search for keywords in alert/case text"},
    {"id": "http-get", "name": "HTTP GET", "kind": "http_get", "description": "Make HTTP GET request to webhook"},
    {"id": "http-post", "name": "HTTP POST", "kind": "http_post", "description": "Make HTTP POST request to webhook"},
]

# Playbook step templates
STEP_TEMPLATES = {
    "enrich": {
        "kind": "enrich",
        "actionId": "{action_id}",
        "stepId": "{step_id}",
        "onError": "continue"
    },
    "attach_note": {
        "kind": "attach_note",
        "stepId": "attach_note",
        "text": "{note_text}",
        "onError": "continue"
    },
    "wait": {
        "kind": "wait",
        "stepId": "wait",
        "waitSeconds": 5,
        "onError": "continue"
    }
}


async def generate_playbook_from_prompt(
    prompt: str,
    available_actions: Optional[list] = None
) -> Dict[str, Any]:
    """
    Generate a playbook JSON structure from a natural language prompt.
    
    Uses OpenAI API if available, otherwise falls back to rule-based generation.
    """
    if available_actions is None:
        available_actions = AVAILABLE_ACTIONS
    
    # Check if OpenAI API key is available
    openai_api_key = os.getenv("OPENAI_API_KEY")
    
    if openai_api_key:
        try:
            return await _generate_with_openai(prompt, available_actions, openai_api_key)
        except Exception as e:
            logger.warning(f"OpenAI generation failed: {e}, falling back to rule-based")
    
    # Fallback to rule-based generation
    return _generate_rule_based(prompt, available_actions)


async def _generate_with_openai(
    prompt: str,
    available_actions: list,
    api_key: str
) -> Dict[str, Any]:
    """Generate playbook using OpenAI API."""
    actions_context = "\n".join([
        f"- {a['id']}: {a['description']}" for a in available_actions
    ])
    
    system_prompt = f"""You are a playbook generation assistant for a security automation platform.

Available enrichment actions:
{actions_context}

Generate a playbook JSON structure based on user requests. The playbook should have:
- A "steps" array with step objects
- Each step has: kind, stepId, and actionId (for enrich steps)
- Valid step kinds: enrich, attach_note, wait, condition, branch
- Return ONLY valid JSON, no markdown or explanation.

Example playbook structure:
{{
  "steps": [
    {{
      "kind": "enrich",
      "actionId": "geoip",
      "stepId": "geoip_lookup",
      "onError": "continue"
    }},
    {{
      "kind": "attach_note",
      "stepId": "attach_note",
      "text": "Enrichment complete",
      "onError": "continue"
    }}
  ]
}}"""

    user_prompt = f"Create a playbook that: {prompt}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-3.5-turbo",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 1000
            }
        )
        
        if response.status_code != 200:
            raise Exception(f"OpenAI API error: {response.status_code} - {response.text}")
        
        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()
        
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        playbook_json = json.loads(content)
        return playbook_json


def _generate_rule_based(prompt: str, available_actions: list) -> Dict[str, Any]:
    """Generate playbook using rule-based matching (fallback)."""
    prompt_lower = prompt.lower()
    steps = []
    step_counter = 1
    
    # Map keywords to actions
    action_keywords = {
        "geoip": ["geoip", "geolocation", "location", "ip location"],
        "whois": ["whois", "domain", "ip info"],
        "vt-hash": ["virustotal", "vt", "hash", "malware", "virus"],
        "reverse-geocode": ["reverse geocode", "address", "coordinates"],
        "keyword-match": ["keyword", "search", "match"],
        "http-get": ["http get", "webhook", "get request"],
        "http-post": ["http post", "post request", "send"]
    }
    
    # Find matching actions
    matched_actions = []
    for action in available_actions:
        action_id = action["id"]
        keywords = action_keywords.get(action_id, [])
        if any(keyword in prompt_lower for keyword in keywords):
            matched_actions.append(action_id)
    
    # Add enrich steps for matched actions
    for action_id in matched_actions:
        steps.append({
            "kind": "enrich",
            "actionId": action_id,
            "stepId": f"{action_id}_step",
            "onError": "continue"
        })
        step_counter += 1
    
    # Add attach_note if requested
    if any(word in prompt_lower for word in ["note", "attach", "save", "document"]):
        steps.append({
            "kind": "attach_note",
            "stepId": "attach_note",
            "text": "Playbook execution complete",
            "onError": "continue"
        })
    
    # If no actions matched, add a default geoip step
    if not steps:
        steps.append({
            "kind": "enrich",
            "actionId": "geoip",
            "stepId": "geoip_lookup",
            "onError": "continue"
        })
    
    return {
        "steps": steps
    }


async def explain_playbook_step(step: Dict[str, Any], available_actions: Optional[list] = None) -> str:
    """Generate a natural language explanation of a playbook step."""
    if available_actions is None:
        available_actions = AVAILABLE_ACTIONS
    
    kind = step.get("kind", "unknown")
    
    explanations = {
        "enrich": lambda s: _explain_enrich_step(s, available_actions),
        "attach_note": lambda s: f"Attach a note with text: '{s.get('text', '')}'",
        "wait": lambda s: f"Wait for {s.get('waitSeconds', 0)} seconds",
        "condition": lambda s: f"Check condition: {s.get('condition', '')}",
        "branch": lambda s: f"Branch based on condition: {s.get('condition', '')}",
    }
    
    explainer = explanations.get(kind, lambda s: f"Execute {kind} step")
    return explainer(step)


def _explain_enrich_step(step: Dict[str, Any], available_actions: list) -> str:
    """Explain an enrich step."""
    action_id = step.get("actionId")
    if not action_id:
        return "Enrich step (action not specified)"
    
    # Find action description
    action = next((a for a in available_actions if a["id"] == action_id), None)
    if action:
        return f"Run {action['name']}: {action['description']}"
    
    return f"Run enrichment action: {action_id}"

