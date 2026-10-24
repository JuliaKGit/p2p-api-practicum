#!/usr/bin/env python3
"""Block agent edits that introduce constitution violations in tests/ and pages/."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Callable

JS_EXT = re.compile(r"\.(tsx?|jsx?)$", re.I)
XPATH_LOCATOR = re.compile(r"locator\s*\(\s*['\"`]\s*//")
ANY_PATTERNS = (
    (re.compile(r":\s*any\b"), ": any"),
    (re.compile(r"\bas\s+any\b"), "as any"),
    (re.compile(r"<\s*any\s*>"), "<any>"),
    (re.compile(r"Array\s*<\s*any\s*>"), "Array<any>"),
)
FILL_EMAIL = re.compile(r"\.fill\s*\(\s*['\"`][^'\"`]*@[^'\"`]+['\"`]")
SECRET_LITERAL = re.compile(
    r"(?i)(password|secret|api_key|token)\s*[:=]\s*['\"`][^'\"`]{4,}['\"`]"
)
DESCRIBE_TAG = re.compile(r"test\.describe\s*\([\s\S]*?\{\s*tag\s*:")


def _load_assertions_module():
    path = Path(__file__).with_name("guard-test-assertions.py")
    spec = importlib.util.spec_from_file_location("guard_test_assertions", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("guard-test-assertions.py not found")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ASSERTIONS = _load_assertions_module()


def is_guarded_constitution_file(file_path: str) -> bool:
    normalized = file_path.replace("\\", "/")
    if not JS_EXT.search(normalized):
        return False
    under_tests = "/tests/" in normalized or normalized.startswith("tests/")
    under_pages = "/pages/" in normalized or normalized.startswith("pages/")
    return under_tests or under_pages


def count_wait_for_timeout(text: str) -> int:
    return text.count(".waitForTimeout(")


def count_xpath_locators(text: str) -> int:
    return len(XPATH_LOCATOR.findall(text))


def count_any_type(text: str) -> int:
    return sum(len(pattern.findall(text)) for pattern, _ in ANY_PATTERNS)


def count_hardcoded_fill_email(text: str) -> int:
    return len(FILL_EMAIL.findall(text))


def count_hardcoded_secrets(text: str) -> int:
    return len(SECRET_LITERAL.findall(text))


def count_describe_tag(text: str) -> int:
    return len(DESCRIBE_TAG.findall(text))


ViolationCounter = tuple[str, Callable[[str], int], str]

VIOLATION_COUNTERS: list[ViolationCounter] = [
    ("waitForTimeout", count_wait_for_timeout, ".waitForTimeout("),
    ("xpath_locator", count_xpath_locators, "locator('//…') / locator(\"//…\")"),
    ("any_type", count_any_type, ": any / as any / <any> / Array<any>"),
    (
        "hardcoded_email_fill",
        count_hardcoded_fill_email,
        ".fill('…@…') with a literal email",
    ),
    (
        "hardcoded_secret",
        count_hardcoded_secrets,
        "password/secret/api_key/token assigned a literal of 4+ characters",
    ),
    (
        "describe_tag",
        count_describe_tag,
        "tag on test.describe(…, { tag: … })",
    ),
]


def introduced_count(before: str, after: str, counter: Callable[[str], int]) -> int:
    return max(0, counter(after) - counter(before))


def reasons_from_pair(before: str, after: str, *, check_expect_drop: bool) -> list[str]:
    reasons: list[str] = []
    for _key, counter, label in VIOLATION_COUNTERS:
        delta = introduced_count(before, after, counter)
        if delta:
            reasons.append(f"introduced {label} (+{delta})")
    if check_expect_drop:
        before_expects = ASSERTIONS.count_active_expects(before)
        after_expects = ASSERTIONS.count_active_expects(after)
        if before_expects > after_expects:
            reasons.append(
                "weakened assertions — active expect( count "
                f"{before_expects} -> {after_expects}"
            )
    return reasons


def reasons_from_edits_fallback(
    edits: list[dict], *, check_expect_drop: bool
) -> list[str]:
    reasons: list[str] = []
    for edit in edits:
        old = edit.get("old_string") or ""
        new = edit.get("new_string") or ""
        reasons.extend(reasons_from_pair(old, new, check_expect_drop=check_expect_drop))
    return _dedupe_reasons(reasons)


def _dedupe_reasons(reasons: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for reason in reasons:
        if reason not in seen:
            seen.add(reason)
            out.append(reason)
    return out


def block(file_path: str, reasons: list[str]) -> int:
    detail = "; ".join(reasons)
    message = f"Blocked: constitution violation in {file_path} — {detail}"
    sys.stdout.write(json.dumps({"user_message": message, "agent_message": message}))
    sys.stdout.write("\n")
    print(message, file=sys.stderr)
    return 2


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print("guard-constitution: empty stdin", file=sys.stderr)
        return 1

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"guard-constitution: invalid JSON — {exc}", file=sys.stderr)
        return 1

    file_path = payload.get("file_path")
    if not file_path or not isinstance(file_path, str):
        print("guard-constitution: missing file_path", file=sys.stderr)
        return 1

    edits = payload.get("edits")
    if edits is None:
        edits = []
    if not isinstance(edits, list):
        print("guard-constitution: edits must be an array", file=sys.stderr)
        return 1

    if not is_guarded_constitution_file(file_path):
        return 0

    after_content = ASSERTIONS.read_after_content(file_path, edits)
    if after_content is None:
        print(
            f"guard-constitution: cannot read after content for {file_path}",
            file=sys.stderr,
        )
        return 1

    check_expect_drop = ASSERTIONS.is_guarded_test_file(file_path)
    before_content = ASSERTIONS.reconstruct_before(after_content, edits)

    if before_content is not None:
        reasons = reasons_from_pair(
            before_content, after_content, check_expect_drop=check_expect_drop
        )
    else:
        reasons = reasons_from_edits_fallback(
            edits, check_expect_drop=check_expect_drop
        )

    if reasons:
        return block(file_path, _dedupe_reasons(reasons))

    print(f"guard-constitution: OK — {file_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
