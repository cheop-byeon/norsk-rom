"""Safe, small URL imports for the learning Studio."""
from html.parser import HTMLParser
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit, unquote

import httpx

MAX_MEDIA_BYTES = 12 * 1024 * 1024
MAX_TEXT_BYTES = 2 * 1024 * 1024
MEDIA_EXTENSIONS = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
}


class _ArticleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = []
        self.paragraphs = []
        self.current = []
        self.in_title = False
        self.skip = 0
        self.in_paragraph = False

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header'}:
            self.skip += 1
        if tag == 'title':
            self.in_title = True
        if tag in {'p', 'h1', 'h2', 'li'} and not self.skip:
            self.in_paragraph = True
            self.current = []

    def handle_endtag(self, tag):
        if tag in {'script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header'} and self.skip:
            self.skip -= 1
        if tag == 'title':
            self.in_title = False
        if tag in {'p', 'h1', 'h2', 'li'} and self.in_paragraph:
            value = ' '.join(' '.join(self.current).split())
            if value:
                self.paragraphs.append(value)
            self.in_paragraph = False
            self.current = []

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        if self.in_paragraph and not self.skip:
            self.current.append(data)


def _public_http_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        if parts.scheme not in {'http', 'https'} or not parts.hostname or parts.username or parts.password:
            raise ValueError
        if parts.port not in (None, 80, 443):
            raise ValueError
        host = parts.hostname.rstrip('.').lower()
        if host == 'localhost' or host.endswith('.localhost') or host.endswith('.local'):
            raise ValueError
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, parts.port or (443 if parts.scheme == 'https' else 80), type=socket.SOCK_STREAM)]
        if not addresses or any(not address.is_global for address in addresses):
            raise ValueError
        return url
    except (ValueError, OSError, socket.gaierror):
        raise ValueError('Enter a public http or https URL. Local network addresses are not allowed.')


def _extract_text(data: bytes, content_type: str, url: str) -> tuple[str, str]:
    text = data.decode('utf-8-sig', errors='replace')
    if 'html' in content_type or text.lstrip().lower().startswith(('<!doctype html', '<html')):
        parser = _ArticleText()
        parser.feed(text)
        title = ' '.join(' '.join(parser.title).split()) or unquote(urlsplit(url).path.rsplit('/', 1)[-1]) or 'Imported web text'
        text = '\n'.join(parser.paragraphs)
    else:
        title = unquote(urlsplit(url).path.rsplit('/', 1)[-1]) or 'Imported text'
    text = '\n'.join(line.strip() for line in text.splitlines() if line.strip())
    if not text:
        raise ValueError('No readable text was found at that URL. Try a direct transcript or article page.')
    return title[:180], text[:4000]


def import_url(url: str) -> dict:
    """Fetch a public text page or directly downloadable short media file."""
    current = _public_http_url(url)
    with httpx.Client(timeout=httpx.Timeout(25, connect=8), follow_redirects=False,
                      headers={'User-Agent': 'NorskRom/0.1 (personal language-learning app)'}) as client:
        for redirect_count in range(4):
            current = _public_http_url(current)
            with client.stream('GET', current) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get('location')
                    if not location or redirect_count == 3:
                        raise ValueError('The source redirected too many times.')
                    current = urljoin(current, location)
                    continue
                response.raise_for_status()
                content_type = response.headers.get('content-type', '').split(';', 1)[0].lower()
                path = urlsplit(current).path.lower()
                extension_type = next((kind for ext, kind in MEDIA_EXTENSIONS.items() if path.endswith(ext)), None)
                media_type = content_type if content_type.startswith(('audio/', 'video/')) else extension_type
                if media_type:
                    limit = MAX_MEDIA_BYTES
                    if response.headers.get('content-length', '').isdigit() and int(response.headers['content-length']) > limit:
                        raise ValueError('This media file is over 12 MB. Use a shorter downloadable clip or a local file.')
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > limit:
                            raise ValueError('This media file is over 12 MB. Use a shorter downloadable clip or a local file.')
                        chunks.append(chunk)
                    title = unquote(path.rsplit('/', 1)[-1]) or 'Imported media'
                    return {'kind': 'media', 'title': title[:180], 'media_type': media_type,
                            'data': b''.join(chunks), 'url': current}
                if content_type.startswith('text/') or 'html' in content_type or 'xml' in content_type or not content_type:
                    limit = MAX_TEXT_BYTES
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > limit:
                            raise ValueError('This page is too large to import. Try a transcript or a specific article page.')
                        chunks.append(chunk)
                    title, text = _extract_text(b''.join(chunks), content_type, current)
                    return {'kind': 'text', 'title': title, 'text': text, 'url': current}
                raise ValueError('This link does not look like an audio, video, transcript, or article. Try a direct media download link.')
    raise ValueError('Could not open that source URL.')
