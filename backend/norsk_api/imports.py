"""Safe, small URL imports for the learning Studio."""
from html.parser import HTMLParser
from html import unescape
import ipaddress
import re
import socket
import zipfile
from io import BytesIO
from defusedxml import ElementTree as ET
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlsplit, unquote

import httpx

MAX_MEDIA_BYTES = 50 * 1024 * 1024
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_FEED_BYTES = 2 * 1024 * 1024
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
                        raise ValueError('This media file is over 50 MB. Use a shorter downloadable clip or a local file.')
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > limit:
                            raise ValueError('This media file is over 50 MB. Use a shorter downloadable clip or a local file.')
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


def import_podimo_page(url: str) -> dict:
    """Import only public text from a Podimo page; never fetch episode audio."""
    def validated_page(value):
        value = _public_http_url(value)
        host = (urlsplit(value).hostname or '').rstrip('.').lower()
        if host != 'podimo.com' and not host.endswith('.podimo.com'):
            raise ValueError('Use a public episode page from podimo.com.')
        return value

    current = validated_page(url)
    with httpx.Client(timeout=httpx.Timeout(25, connect=8), follow_redirects=False,
                      headers={'User-Agent': 'NorskRom/0.1 (personal language-learning app)'}) as client:
        for redirect_count in range(4):
            current = validated_page(current)
            with client.stream('GET', current) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get('location')
                    if not location or redirect_count == 3:
                        raise ValueError('The Podimo page redirected too many times.')
                    current = urljoin(current, location)
                    continue
                response.raise_for_status()
                content_type = response.headers.get('content-type', '').split(';', 1)[0].lower()
                if content_type.startswith(('audio/', 'video/')):
                    raise ValueError('Podimo episode audio is not imported. Use public page text, a publisher RSS feed, or an authorized transcript.')
                if content_type not in {'text/html', 'text/plain', 'application/xhtml+xml'}:
                    raise ValueError('This Podimo page does not expose readable public text. Use a publisher RSS feed or an authorized transcript.')
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_TEXT_BYTES:
                        raise ValueError('This Podimo page is too large to import.')
                    chunks.append(chunk)
                title, text = _extract_text(b''.join(chunks), content_type, current)
                return {'kind': 'text', 'title': title, 'text': text, 'url': current}
    raise ValueError('Could not open that public Podimo page.')


def import_podcast_feed(url: str) -> dict:
    """Read a public RSS/Atom feed's audio enclosure metadata, without downloading episodes."""
    current = _public_http_url(url)
    with httpx.Client(timeout=httpx.Timeout(20, connect=8), follow_redirects=False,
                      headers={'User-Agent': 'NorskRom/0.1 (personal language-learning app)'}) as client:
        for redirect_count in range(4):
            current = _public_http_url(current)
            with client.stream('GET', current) as response:
                if response.status_code in {301,302,303,307,308}:
                    location=response.headers.get('location')
                    if not location or redirect_count==3:raise ValueError('The podcast feed redirected too many times.')
                    current=urljoin(current,location);continue
                response.raise_for_status();chunks=[];size=0
                for chunk in response.iter_bytes():
                    size+=len(chunk)
                    if size>MAX_FEED_BYTES:raise ValueError('This podcast feed is too large to read.')
                    chunks.append(chunk)
                break
        else:raise ValueError('Could not open that podcast feed.')
    try:root=ET.fromstring(b''.join(chunks))
    except ET.ParseError as exc:raise ValueError('That URL is not a readable RSS or Atom podcast feed.') from exc
    local=lambda element:element.tag.rsplit('}',1)[-1].lower()
    def child_text(element,names):
        for node in element.iter():
            if local(node) in names and node.text and node.text.strip():return ' '.join(node.text.split())
        return ''
    feed_title=child_text(root,{'title'}) or 'Podcast feed'
    episodes=[];seen=set()
    entries=[node for node in root.iter() if local(node) in {'item','entry'}]
    for entry in entries:
        title=child_text(entry,{'title'})
        audio_url='';mime=''
        for node in entry.iter():
            if local(node)=='enclosure' and node.attrib.get('url'):
                audio_url=node.attrib['url'];mime=node.attrib.get('type','').lower();break
            if local(node)=='link' and node.attrib.get('rel','alternate')=='enclosure' and node.attrib.get('href'):
                audio_url=node.attrib['href'];mime=node.attrib.get('type','').lower();break
        if not title or not audio_url:continue
        audio_url=urljoin(current,audio_url)
        try:audio_url=_public_http_url(audio_url)
        except ValueError:continue
        ext=urlsplit(audio_url).path.lower().rsplit('.',1)
        audio_like=mime.startswith('audio/') or (len(ext)==2 and f".{ext[-1]}" in MEDIA_EXTENSIONS)
        if not audio_like or audio_url in seen:continue
        seen.add(audio_url)
        description=child_text(entry,{'description','summary','subtitle'})
        description=unescape(re.sub(r'<[^>]*>',' ',description))[:500]
        published=child_text(entry,{'pubdate','published','updated'})[:80]
        episodes.append({'title':title[:180],'audio_url':audio_url,'description':description,'published':published})
        if len(episodes)>=50:break
    if not episodes:raise ValueError('No public audio episodes were found in that feed.')
    return {'title':feed_title[:180],'episodes':episodes,'feed_url':current}


def extract_document(data: bytes, filename: str) -> dict:
    """Extract selectable text from common documents; OCR is intentionally separate."""
    if not data or len(data)>25*1024*1024:raise ValueError('Choose a document smaller than 25 MB.')
    suffix=PurePosixPath(filename.replace('\\','/')).suffix.lower()
    title=PurePosixPath(filename).name[:180] or 'Imported document'
    if suffix in {'.txt','.md','.srt','.vtt'}:
        text=data.decode('utf-8-sig',errors='replace')
        if suffix in {'.srt','.vtt'}:
            lines=[]
            for line in text.splitlines():
                stripped=line.strip()
                if not stripped or stripped.upper()=='WEBVTT' or re.fullmatch(r'\d+',stripped):continue
                if '-->' in stripped:continue
                lines.append(re.sub(r'</?[^>]+>','',stripped))
            text='\n'.join(lines)
    elif suffix=='.pdf':
        try:
            from pypdf import PdfReader
            reader=PdfReader(BytesIO(data),strict=False)
            text='\n'.join(page.extract_text() or '' for page in reader.pages[:100])
        except ImportError as exc:raise RuntimeError('PDF extraction requires the pypdf package.') from exc
        except Exception as exc:raise ValueError('Could not read this PDF. Try exporting it as a text-searchable PDF.') from exc
    elif suffix in {'.docx','.epub'}:
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                names=archive.namelist()
                if suffix=='.docx':
                    xml=ET.fromstring(archive.read('word/document.xml'))
                    paragraphs=[]
                    for node in xml.iter():
                        if node.tag.rsplit('}',1)[-1]=='p':
                            value=''.join(child.text or '' for child in node.iter() if child.tag.rsplit('}',1)[-1]=='t')
                            if value.strip():paragraphs.append(value.strip())
                    text='\n'.join(paragraphs)
                else:
                    html_files=[name for name in names if name.lower().endswith(('.xhtml','.html','.htm'))]
                    chapters=[]
                    for name in sorted(html_files)[:100]:
                        parser=_ArticleText();parser.feed(archive.read(name).decode('utf-8',errors='replace'))
                        paragraphs=[' '.join(part.split()) for part in parser.paragraphs if part]
                        chapters.extend(paragraphs)
                    text='\n'.join(chapters)
        except (zipfile.BadZipFile,KeyError,ET.ParseError) as exc:raise ValueError(f'Could not read this {suffix[1:].upper()} document.') from exc
    else:
        raise ValueError('Supported files are TXT, Markdown, SRT/VTT subtitles, text-searchable PDF, EPUB, and DOCX.')
    text='\n'.join(line.strip() for line in text.splitlines() if line.strip())
    if not text:raise ValueError('No selectable text was found. Scanned-image OCR is not enabled yet.')
    truncated=len(text)>4000
    return {'title':title,'text':text[:4000],'truncated':truncated,'source_kind':'text'}
