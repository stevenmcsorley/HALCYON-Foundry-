"""Enrichment engine for executing built-in and custom enrichment actions."""
import asyncio
import httpx
import json
import hashlib
import re
import os
from typing import Dict, Any, Optional
from datetime import datetime
import logging
from .metrics import enrich_runs_total, enrich_latency_seconds

logger = logging.getLogger("enrichment.engine")

# Feature flags
ENRICH_ENABLE = os.getenv("ENRICH_ENABLE", "true").lower() == "true"
ENRICH_ALLOW_HTTP = os.getenv("ENRICH_ALLOW_HTTP", "true").lower() == "true"
DEFAULT_TIMEOUT = int(os.getenv("ENRICH_TIMEOUT_MS", "5000")) / 1000.0


def redact_secrets(data: Any) -> Any:
    """Redact sensitive information from output."""
    if isinstance(data, dict):
        redacted = {}
        for k, v in data.items():
            key_lower = k.lower()
            if any(secret in key_lower for secret in ["key", "secret", "token", "password", "api_key", "auth"]):
                redacted[k] = "[REDACTED]"
            else:
                redacted[k] = redact_secrets(v)
        return redacted
    elif isinstance(data, list):
        return [redact_secrets(item) for item in data]
    elif isinstance(data, str):
        # Redact potential API keys or tokens
        if re.match(r'^[A-Za-z0-9]{32,}$', data):
            return "[REDACTED]"
    return data


async def run_geoip(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run GeoIP lookup."""
    provider = action_config.get("provider", "ipapi")
    # Normalize provider to lowercase for comparison
    provider = str(provider).lower() if provider else "ipapi"
    logger.info(f"GeoIP provider: {provider} (from config: {action_config.get('provider')})")
    
    attrs = subject.get("attrs", {})
    ip = attrs.get("source") or attrs.get("ip") or attrs.get("ip_address")
    
    # Also try to extract IP from subject id or other fields
    if not ip:
        subject_id = subject.get("id", "")
        subject_type = subject.get("type", "")
        # Try to extract IP from subject ID (e.g., "ip-192.168.1.100" or "entity-192.168.1.100")
        import re
        ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', subject_id)
        if ip_match:
            ip = ip_match.group(0)
    
    if not ip:
        # Return a helpful error instead of raising
        return {
            "error": "No IP address found in subject",
            "hint": "Subject should contain IP address in attrs.source, attrs.ip, or subject ID"
        }
    
    # Use ip-api.com (free, no API key required, 45 requests/minute limit)
    # Support both "ipapi" and "freegeoip" (legacy) provider names
    if provider in ["ipapi", "freegeoip"]:
        url = f"http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query"
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                # ip-api.com returns status field, check if query was successful
                if data.get("status") == "fail":
                    return {
                        "error": data.get("message", "GeoIP lookup failed"),
                        "status": "failed"
                    }
                # Map ip-api.com format to a more standard format
                return redact_secrets({
                    "ip": data.get("query", ip),
                    "country": data.get("country"),
                    "countryCode": data.get("countryCode"),
                    "region": data.get("regionName"),
                    "city": data.get("city"),
                    "zip": data.get("zip"),
                    "latitude": data.get("lat"),
                    "longitude": data.get("lon"),
                    "timezone": data.get("timezone"),
                    "isp": data.get("isp"),
                    "org": data.get("org"),
                    "as": data.get("as"),
                    "provider": "ip-api.com"
                })
            except Exception as e:
                return {
                    "error": f"GeoIP lookup failed: {str(e)}",
                    "status": "error",
                    "exception_type": type(e).__name__
                }
    else:
        return {
            "error": f"Unknown GeoIP provider: {provider}",
            "status": "error"
        }


async def run_reverse_geocode(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run reverse geocoding lookup."""
    attrs = subject.get("attrs", {})
    lat = attrs.get("latitude") or attrs.get("lat")
    lon = attrs.get("longitude") or attrs.get("lng") or attrs.get("lon")
    
    if not lat or not lon:
        # Return error instead of raising
        return {
            "error": "No latitude/longitude found in subject",
            "hint": "Subject should contain coordinates in attrs.latitude/lat and attrs.longitude/lon/lng"
        }
    
    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}"
    
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, headers={"User-Agent": "HALCYON/1.0"}) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
            return redact_secrets(response.json())
        except Exception as e:
            return {
                "error": f"Reverse geocoding failed: {str(e)}",
                "status": "error",
                "exception_type": type(e).__name__
            }


async def run_keyword_match(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run keyword matching against subject attributes and message."""
    keywords = action_config.get("keywords", [])
    if not keywords:
        return {"matched": [], "count": 0}
    
    # Search in both attrs and message/description
    attrs = subject.get("attrs", {})
    message = subject.get("message", "") or subject.get("description", "") or ""
    
    # Combine all text for searching
    text = (json.dumps(attrs) + " " + message + " " + str(subject.get("id", ""))).lower()
    
    matched = [kw for kw in keywords if kw.lower() in text]
    return {
        "matched": matched,
        "count": len(matched),
        "keywords_searched": keywords,
        "matched_keywords": matched
    }


async def run_http_get(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run HTTP GET request with templating."""
    if not ENRICH_ALLOW_HTTP:
        return {
            "error": "HTTP actions are disabled (ENRICH_ALLOW_HTTP=false)",
            "status": "disabled"
        }
    
    url_template = action_config.get("url", "")
    if not url_template:
        return {
            "error": "No URL configured",
            "status": "error"
        }
    
    # Simple templating: ${alert.attrs.source}, ${case.title}, etc.
    url = url_template
    for key, value in _flatten_dict(subject).items():
        placeholder = f"${{{key}}}"
        if placeholder in url:
            url = url.replace(placeholder, str(value))
    
    timeout = action_config.get("timeoutMs", DEFAULT_TIMEOUT * 1000) / 1000.0
    headers = action_config.get("headers", {})
    
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            # Try to parse as JSON, but return text if not JSON
            try:
                return redact_secrets(response.json())
            except:
                return {
                    "status": "success",
                    "status_code": response.status_code,
                    "body": response.text[:1000]  # Limit response size
                }
        except httpx.ConnectError as e:
            return {
                "error": f"Cannot connect to {url}",
                "detail": str(e),
                "status": "connection_error",
                "hint": "Check if the URL is correct and the service is reachable"
            }
        except httpx.TimeoutException:
            return {
                "error": f"Request to {url} timed out",
                "status": "timeout"
            }
        except Exception as e:
            return {
                "error": f"HTTP GET failed: {str(e)}",
                "status": "error",
                "exception_type": type(e).__name__
            }


async def run_http_post(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run HTTP POST request with templating."""
    if not ENRICH_ALLOW_HTTP:
        return {
            "error": "HTTP actions are disabled (ENRICH_ALLOW_HTTP=false)",
            "status": "disabled"
        }
    
    url_template = action_config.get("url", "")
    if not url_template:
        return {
            "error": "No URL configured",
            "status": "error"
        }
    
    url = url_template
    for key, value in _flatten_dict(subject).items():
        placeholder = f"${{{key}}}"
        if placeholder in url:
            url = url.replace(placeholder, str(value))
    
    timeout = action_config.get("timeoutMs", DEFAULT_TIMEOUT * 1000) / 1000.0
    headers = action_config.get("headers", {})
    body = action_config.get("body", {})
    
    # Template body as well
    body_str = json.dumps(body)
    for key, value in _flatten_dict(subject).items():
        placeholder = f"${{{key}}}"
        if placeholder in body_str:
            body_str = body_str.replace(placeholder, str(value))
    body = json.loads(body_str)
    
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            response = await client.post(url, headers=headers, json=body)
            response.raise_for_status()
            # Try to parse as JSON, but return text if not JSON
            try:
                return redact_secrets(response.json())
            except:
                return {
                    "status": "success",
                    "status_code": response.status_code,
                    "body": response.text[:1000]  # Limit response size
                }
        except httpx.ConnectError as e:
            return {
                "error": f"Cannot connect to {url}",
                "detail": str(e),
                "status": "connection_error",
                "hint": "Check if the URL is correct and the service is reachable"
            }
        except httpx.TimeoutException:
            return {
                "error": f"Request to {url} timed out",
                "status": "timeout"
            }
        except Exception as e:
            return {
                "error": f"HTTP POST failed: {str(e)}",
                "status": "error",
                "exception_type": type(e).__name__
            }


async def run_vt_hash_lookup(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run VirusTotal hash lookup."""
    api_key = action_config.get("api_key") or os.getenv("VT_API_KEY")
    logger.info(f"VirusTotal API key check: action_config has key={bool(action_config.get('api_key'))}, env var={bool(os.getenv('VT_API_KEY'))}")
    if not api_key:
        return {
            "error": "VirusTotal API key not configured",
            "hint": "Set VT_API_KEY environment variable or configure in action config"
        }
    
    attrs = subject.get("attrs", {})
    hash_value = attrs.get("hash") or attrs.get("md5") or attrs.get("sha256")
    
    # Also try to extract from subject ID or message
    if not hash_value:
        subject_id = subject.get("id", "")
        subject_text = subject.get("message", "") or subject.get("description", "") or ""
        import re
        # Try SHA256 first (64 chars), then MD5 (32 chars)
        sha256_match = re.search(r'\b[a-fA-F0-9]{64}\b', subject_id + " " + subject_text)
        if sha256_match:
            hash_value = sha256_match.group(0)
            logger.info(f"Extracted SHA256 from subject: {hash_value[:16]}...")
        else:
            md5_match = re.search(r'\b[a-fA-F0-9]{32}\b', subject_id + " " + subject_text)
            if md5_match:
                hash_value = md5_match.group(0)
                logger.info(f"Extracted MD5 from subject: {hash_value}")
    
    if not hash_value:
        return {
            "error": "No hash found in subject",
            "hint": "Subject should contain hash in attrs.hash, attrs.md5, or attrs.sha256"
        }
    
    url = f"https://www.virustotal.com/vtapi/v2/file/report"
    params = {"apikey": api_key, "resource": hash_value}
    
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        try:
            response = await client.get(url, params=params)
            
            # Handle rate limiting (204 No Content)
            if response.status_code == 204:
                return {
                    "error": "VirusTotal rate limit exceeded",
                    "hint": "Free tier: 4 requests/min, 500/day. Please wait before retrying.",
                    "status": "rate_limited"
                }
            
            # Handle quota exceeded or other errors
            if response.status_code != 200:
                error_text = response.text[:200] if response.text else "Unknown error"
                return {
                    "error": f"VirusTotal API error: HTTP {response.status_code}",
                    "detail": error_text,
                    "status": "error"
                }
            
            result = response.json()
            
            # Check for API errors in response
            if isinstance(result, dict) and result.get("response_code") == 0:
                return {
                    "error": "Hash not found in VirusTotal database",
                    "response_code": 0,
                    "status": "not_found"
                }
            
            # Redact API key from response
            if "apikey" in result:
                result["apikey"] = "[REDACTED]"
            
            return redact_secrets(result)
            
        except httpx.TimeoutException:
            return {
                "error": "VirusTotal API request timeout",
                "status": "timeout"
            }
        except Exception as e:
            return {
                "error": f"VirusTotal lookup failed: {str(e)}",
                "status": "error",
                "exception_type": type(e).__name__
            }


async def run_whois(action_config: Dict[str, Any], subject: Dict[str, Any]) -> Dict[str, Any]:
    """Run WHOIS lookup."""
    # WHOIS lookup - for IPs we use ip-api.com, for domains we use a simple DNS-based lookup
    attrs = subject.get("attrs", {})
    domain = attrs.get("domain") or attrs.get("hostname")
    ip = attrs.get("ip") or attrs.get("source") or attrs.get("ip_address")
    
    # Also try to extract from subject ID or message
    if not domain and not ip:
        subject_id = subject.get("id", "")
        subject_text = subject.get("message", "") or subject.get("description", "") or ""
        import re
        # Try IP first (more reliable for WHOIS)
        ip_match = re.search(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', subject_id + " " + subject_text)
        if ip_match:
            ip = ip_match.group(0)
        else:
            # Try domain
            domain_match = re.search(r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b', subject_id + " " + subject_text)
            if domain_match:
                domain = domain_match.group(0)
    
    # Determine target for logging (but prioritize IP over domain)
    target = ip if ip else domain
    
    logger.info(f"WHOIS lookup: ip={ip}, domain={domain}, target={target}, attrs={attrs}")
    
    # Priority: If both IP and domain are found, prefer IP (more reliable for ip-api.com)
    # For IPs, use ip-api.com (works well for IP geolocation)
    if ip:
        logger.info(f"WHOIS: Using IP {ip} for lookup (domain {domain} ignored)")
        url = f"http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query"
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                if data.get("status") == "fail":
                    logger.error(f"WHOIS IP lookup failed: {data.get('message')}")
                    return {
                        "error": data.get("message", "WHOIS lookup failed"),
                        "status": "failed"
                    }
                # Return WHOIS-like data for IP
                result = redact_secrets({
                    "target": ip,
                    "type": "ip",
                    "country": data.get("country"),
                    "countryCode": data.get("countryCode"),
                    "region": data.get("regionName"),
                    "city": data.get("city"),
                    "isp": data.get("isp"),
                    "org": data.get("org"),
                    "as": data.get("as"),
                    "timezone": data.get("timezone"),
                    "provider": "ip-api.com",
                    "note": "IP geolocation data (not full WHOIS)"
                })
                logger.info(f"WHOIS IP lookup success: {result.get('country')}, {result.get('city')}")
                return result
            except Exception as e:
                logger.error(f"WHOIS IP lookup exception: {e}", exc_info=True)
                return {
                    "error": f"WHOIS lookup failed: {str(e)}",
                    "status": "error",
                    "exception_type": type(e).__name__
                }
    
    # For domains, ip-api.com doesn't work well. Use a simple DNS-based approach
    # Try to resolve the domain to get IP, then look up the IP
    # Only do this if we don't have an IP already
    if domain and not ip:
        logger.info(f"WHOIS: Using domain {domain} (will resolve to IP first)")
        import socket
        try:
            # Resolve domain to IP
            resolved_ip = socket.gethostbyname(domain)
            logger.info(f"Resolved domain {domain} to IP {resolved_ip}")
            
            # Look up the resolved IP
            url = f"http://ip-api.com/json/{resolved_ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query"
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                if data.get("status") == "fail":
                    logger.error(f"WHOIS domain lookup failed: {data.get('message')}")
                    return {
                        "error": data.get("message", "WHOIS lookup failed"),
                        "status": "failed"
                    }
                # Return WHOIS-like data for domain
                result = redact_secrets({
                    "target": domain,
                    "resolved_ip": resolved_ip,
                    "type": "domain",
                    "country": data.get("country"),
                    "countryCode": data.get("countryCode"),
                    "region": data.get("regionName"),
                    "city": data.get("city"),
                    "isp": data.get("isp"),
                    "org": data.get("org"),
                    "as": data.get("as"),
                    "timezone": data.get("timezone"),
                    "provider": "ip-api.com (via DNS resolution)",
                    "note": "Domain resolved to IP, then IP geolocation data retrieved (not full WHOIS)"
                })
                logger.info(f"WHOIS domain lookup success: {result.get('country')}, {result.get('city')}")
                return result
        except socket.gaierror as e:
            logger.error(f"Domain {domain} could not be resolved: {e}")
            return {
                "error": f"Domain {domain} could not be resolved",
                "status": "failed"
            }
        except Exception as e:
            logger.error(f"WHOIS domain lookup exception: {e}", exc_info=True)
            return {
                "error": f"WHOIS lookup failed: {str(e)}",
                "status": "error",
                "exception_type": type(e).__name__
            }
    
    return {
        "error": "Unable to determine target type",
        "status": "error"
    }


# Action registry
ACTION_REGISTRY = {
    "geoip": run_geoip,
    "reverse_geocode": run_reverse_geocode,
    "keyword_match": run_keyword_match,
    "http_get": run_http_get,
    "http_post": run_http_post,
    "vt_hash_lookup": run_vt_hash_lookup,
    "whois": run_whois,
}


def _flatten_dict(d: Dict[str, Any], parent_key: str = "", sep: str = ".") -> Dict[str, Any]:
    """Flatten nested dictionary for templating."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


async def execute_action(
    action_id: str,
    action_kind: str,
    action_config: Dict[str, Any],
    subject: Dict[str, Any]
) -> Dict[str, Any]:
    """Execute an enrichment action."""
    if not ENRICH_ENABLE:
        return {
            "error": "Enrichment is disabled (ENRICH_ENABLE=false)",
            "status": "disabled"
        }
    
    if action_kind not in ACTION_REGISTRY:
        return {
            "error": f"Unknown action kind: {action_kind}",
            "status": "error"
        }
    
    start_time = datetime.utcnow()
    
    try:
        with enrich_latency_seconds.labels(action=action_id).time():
            result = await ACTION_REGISTRY[action_kind](action_config, subject)
        
        # Check if result contains an error
        if isinstance(result, dict) and "error" in result:
            enrich_runs_total.labels(action=action_id, status="failed").inc()
            return result
        
        enrich_runs_total.labels(action=action_id, status="success").inc()
        return result
    except Exception as e:
        enrich_runs_total.labels(action=action_id, status="failed").inc()
        logger.error(f"Action {action_id} failed: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "error",
            "exception_type": type(e).__name__
        }

