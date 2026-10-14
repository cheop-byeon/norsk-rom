import io
import zipfile
import pytest

from norsk_api.imports import _extract_text, _public_http_url, import_podimo_page, import_podcast_feed, extract_document


def test_extract_article_paragraphs_and_title():
    title, text = _extract_text(
        b'<html><head><title>Nyheter i dag</title></head><body><nav>Menu</nav><h1>God morgen</h1><p>Dette er en lengre norsk nyhetstekst.</p><script>ignore()</script></body></html>',
        'text/html', 'https://example.org/news')
    assert title == 'Nyheter i dag'
    assert 'God morgen' in text and 'Dette er en lengre norsk nyhetstekst.' in text
    assert 'Menu' not in text and 'ignore' not in text


def test_reject_private_and_non_http_urls():
    for url in ('http://127.0.0.1/audio.mp3', 'http://localhost/page', 'file:///etc/passwd', 'https://user:pass@example.org'):
        with pytest.raises(ValueError, match='public http or https'):
            _public_http_url(url)


def test_podcast_feed_reads_public_audio_enclosures_without_downloading_them(monkeypatch):
    payload=b'''<rss version="2.0"><channel><title>Norwegian Practice</title>
      <item><title>Episode one</title><description>Useful phrases</description><pubDate>Today</pubDate>
      <enclosure url="https://cdn.example.org/episode.mp3" type="audio/mpeg"/></item>
      <item><title>Video extra</title><enclosure url="https://cdn.example.org/extra.txt" type="text/plain"/></item>
      </channel></rss>'''
    class Response:
        status_code=200;headers={}
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_bytes(self):yield payload
        def raise_for_status(self):pass
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def stream(self,*args,**kwargs):return Response()
    monkeypatch.setattr('norsk_api.imports._public_http_url',lambda url:url)
    monkeypatch.setattr('norsk_api.imports.httpx.Client',Client)
    result=import_podcast_feed('https://pod.example.org/feed.xml')
    assert result['title']=='Norwegian Practice'
    assert len(result['episodes'])==1
    assert result['episodes'][0]['title']=='Episode one'
    assert result['episodes'][0]['audio_url']=='https://cdn.example.org/episode.mp3'


def test_podimo_import_extracts_only_public_page_text(monkeypatch):
    payload=b'<html><head><title>En norsk podkast</title></head><body><h1>En norsk podkast</h1><p>En offentlig episodebeskrivelse.</p></body></html>'
    class Response:
        status_code=200;headers={'content-type':'text/html; charset=utf-8'}
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_bytes(self):yield payload
        def raise_for_status(self):pass
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def stream(self,*args,**kwargs):return Response()
    monkeypatch.setattr('norsk_api.imports._public_http_url',lambda url:url)
    monkeypatch.setattr('norsk_api.imports.httpx.Client',Client)
    result=import_podimo_page('https://podimo.com/no/episode/example')
    assert result['title']=='En norsk podkast'
    assert result['text']=='En norsk podkast\nEn offentlig episodebeskrivelse.'


def test_podimo_import_rejects_audio_before_reading_body(monkeypatch):
    class Response:
        status_code=200;headers={'content-type':'audio/mpeg'}
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_bytes(self):raise AssertionError('Podimo audio body must not be read')
        def raise_for_status(self):pass
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def stream(self,*args,**kwargs):return Response()
    monkeypatch.setattr('norsk_api.imports._public_http_url',lambda url:url)
    monkeypatch.setattr('norsk_api.imports.httpx.Client',Client)
    with pytest.raises(ValueError,match='episode audio is not imported'):
        import_podimo_page('https://podimo.com/no/episode/example')


def test_document_import_extracts_txt_docx_and_epub_text():
    source='Dette er en norsk setning som vi bruker til å øve på lytting og tale.'
    assert extract_document(source.encode(),'lesson.txt')['text']==source
    subtitles='''WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHei, hvordan går det?\n\n2\n00:00:04,000 --> 00:00:06,000\nDet går veldig bra.\n'''
    subtitle_text=extract_document(subtitles.encode(),'lesson.vtt')['text']
    assert subtitle_text=='Hei, hvordan går det?\nDet går veldig bra.'
    docx=io.BytesIO()
    with zipfile.ZipFile(docx,'w') as archive:
        archive.writestr('word/document.xml',f'<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>{source}</w:t></w:r></w:p></w:body></w:document>')
    assert source in extract_document(docx.getvalue(),'lesson.docx')['text']
    epub=io.BytesIO()
    with zipfile.ZipFile(epub,'w') as archive:archive.writestr('OEBPS/chapter.xhtml',f'<html><body><p>{source}</p></body></html>')
    assert source in extract_document(epub.getvalue(),'lesson.epub')['text']


def test_scanned_pdf_reports_that_ocr_is_not_available():
    from pypdf import PdfWriter
    pdf=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=100,height=100);writer.write(pdf)
    with pytest.raises(ValueError,match='OCR is not enabled'):
        extract_document(pdf.getvalue(),'scan.pdf')
