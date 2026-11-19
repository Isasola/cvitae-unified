"""Inventory scraper source IDs and ingestion patterns without executing them."""
from __future__ import annotations

import ast
import json
from pathlib import Path


def literal_sources(tree: ast.AST) -> list[str]:
    values: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and key.value == "source" and isinstance(value, ast.Constant) and isinstance(value.value, str):
                values.add(value.value)
    return sorted(values)


def audit(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(text)
        error = None
    except SyntaxError as exc:
        tree = ast.Module(body=[], type_ignores=[])
        error = f"{exc.msg} line {exc.lineno}"
    return {
        "script": path.name,
        "sources": literal_sources(tree),
        "uses_sink": "OpportunitySink" in text,
        "direct_rest_post": "rest/v1/opportunities" in text and "requests.post" in text,
        "has_main": 'if __name__ == "__main__"' in text or "if __name__ == '__main__'" in text,
        "syntax_error": error,
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "scrapers"
    rows = [audit(path) for path in sorted(root.glob("*.py")) if path.name not in {"opportunity_sink.py", "linkedin_poster.py", "insert_blog_post.py"}]
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
