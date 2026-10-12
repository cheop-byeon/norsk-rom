import pytest

from norsk_api.imports import _extract_text, _public_http_url


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
