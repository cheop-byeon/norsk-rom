"""Conservative pronunciation-practice hints from ASR text, not phonetic scoring."""
import re
import unicodedata
from difflib import SequenceMatcher


def _tokens(text):
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)?",unicodedata.normalize('NFKC',text).casefold(),flags=re.UNICODE)


def compare_phrase(target,recognized):
    expected=_tokens(target);heard=_tokens(recognized)
    if not expected:raise ValueError('Enter a phrase to practise.')
    if not heard:raise ValueError('No speech was recognized. Try recording again in a quiet place.')
    matcher=SequenceMatcher(a=expected,b=heard,autojunk=False)
    differences=[]
    for tag,a1,a2,b1,b2 in matcher.get_opcodes():
        if tag!='equal':differences.append({'target':expected[a1:a2],'heard':heard[b1:b2]})
    return {'target':target,'recognized':recognized,'differences':differences,
            'feedback_kind':'transcript_comparison_hint',
            'message':('The recognizer heard different words. Try the phrase again slowly, then compare what it heard.' if differences
                       else 'The recognizer understood the full phrase. This is not a phonetic or accent score.')}
