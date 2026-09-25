"""Plain-text previews derived from post content; never persisted as authored copy."""
import re
from html.parser import HTMLParser


class _PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        elif tag in {"p", "div", "br", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        elif tag in {"p", "div", "li"}:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def strip_markdown(text: str, max_length: int = 200) -> str:
    """Omit non-prose blocks and preserve readable link and inline-code text."""
    if not text:
        return ""
    lines = []
    fence = None
    for line in text.splitlines():
        marker = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if marker:
            token = marker.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            continue
        if fence or re.match(r"^\s{0,3}(#{1,6}\s|\|)|^( {4}|\t)", line):
            continue
        if re.match(r"^\s*(?:[-*_]\s*){3,}$|^\s*\[[^]]+\]:", line):
            continue
        lines.append(re.sub(r"^\s*(?:>\s*|[-+*]\s+|\d+[.)]\s+)", "", line))
    text = " ".join(lines)
    text = re.sub(r"!\[[^]]*\](?:\([^)]*\)|\[[^]]*\])", "", text)
    text = re.sub(r"\[([^]]+)\](?:\([^)]*\)|\[[^]]*\])", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"(\*{1,3}|_{1,3}|~~)(.+?)\1", r"\2", text)
    parser = _PlainText()
    parser.feed(text)
    text = re.sub(r"\s+", " ", "".join(parser.parts)).strip()
    return text if len(text) <= max_length else text[:max_length].rstrip() + "…"
