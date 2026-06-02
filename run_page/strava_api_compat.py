import functools
import os

from stravalib.protocol import ApiV3

STRAVA_API_SERVER = os.getenv("STRAVA_API_SERVER", "www.api-v3.strava.com")
STRAVA_API_BASE = os.getenv("STRAVA_API_BASE", "")
STRAVA_OAUTH_SERVER = os.getenv("STRAVA_OAUTH_SERVER", "www.strava.com")


def _resolve_url(self, url):
    if url.startswith("http"):
        return url

    path = url.strip("/")
    if path.startswith("oauth/"):
        return f"https://{STRAVA_OAUTH_SERVER}/{path}"

    api_base = STRAVA_API_BASE.strip("/")
    if api_base:
        path = f"{api_base}/{path}"
    return f"https://{STRAVA_API_SERVER}/{path}"


def _request(self, url, params=None, files=None, method="GET", check_for_errors=True):
    url = self._resolve_url(url)
    self.log.info(
        "{method} {url!r} with params {params!r}".format(
            method=method, url=url, params=params
        )
    )
    if params is None:
        params = {}
    else:
        params = dict(params)

    headers = {}
    if self.access_token:
        headers["Authorization"] = f"Bearer {self.access_token}"

    methods = {
        "GET": functools.partial(self.rsession.get, headers=headers),
        "POST": functools.partial(self.rsession.post, files=files, headers=headers),
        "PUT": functools.partial(self.rsession.put, headers=headers),
        "DELETE": functools.partial(self.rsession.delete, headers=headers),
    }

    try:
        requester = methods[method.upper()]
    except KeyError:
        raise ValueError(f"Invalid/unsupported request method specified: {method}")

    raw = requester(url, params=params)
    self.rate_limiter(raw.headers)

    if check_for_errors:
        self._handle_protocol_error(raw)

    if raw.status_code in [204]:
        return {}
    return raw.json()


def apply_strava_api_compat():
    if getattr(ApiV3, "_neewii_header_auth_patch", False):
        return

    ApiV3._resolve_url = _resolve_url
    ApiV3._request = _request
    ApiV3._neewii_header_auth_patch = True


__all__ = [
    "STRAVA_API_SERVER",
    "STRAVA_API_BASE",
    "STRAVA_OAUTH_SERVER",
    "apply_strava_api_compat",
]
