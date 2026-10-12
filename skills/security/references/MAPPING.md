<!-- original Keystone file (MIT) -->

# Standards mapping (use for the `Refs:` line of a finding)

Take ids from here; if a category is not listed, omit the part — never invent an id. Verification status:
**[official]** read on the official site on 2026-10-12; **[secondary]** from third-party sources, verify before relying on it.

## OWASP Top 10:2025 [official, top10.owasp.org/2025]
A01 Broken Access Control · A02 Security Misconfiguration · A03 Software Supply Chain Failures · A04 Cryptographic Failures ·
A05 Injection · A06 Insecure Design · A07 Authentication Failures · A08 Software or Data Integrity Failures ·
A09 Security Logging and Alerting Failures · A10 Mishandling of Exceptional Conditions.

## OWASP LLM Top 10 2026 [resource page official, 2026-08-03; names per secondary sources, verify against the official PDF]
LLM01 Prompt Injection · LLM02 Sensitive Information Disclosure · LLM03 Excessive Agency · LLM04 Supply Chain ·
LLM05 Data and Model Poisoning · LLM06 Unbounded Consumption · LLM07 Misinformation · LLM08 Hidden Context Exposure ·
LLM09 Vector and Embedding Weaknesses · LLM10 Improper Output Handling. Write as `LLM01:2026`.

## Category → references
| Category / finding | OWASP 2025 / LLM 2026 | CWE | ASVS 5.0 chapter [secondary] | ISO 27001:2022 [secondary] |
|---|---|---|---|---|
| Missing auth / role check, IDOR | A01 | CWE-862, CWE-863, CWE-639 | V8 Authorization | A.8.28 |
| CSRF | A01 | CWE-352 | V3 Web Frontend Security | A.8.28 |
| SSRF | A01 | CWE-918 | V1 Encoding and Sanitization / V4 API | A.8.28 |
| Misconfig, headers, debug on, CORS | A02 | CWE-16 | V13 Configuration | A.8.9 |
| Hardcoded secret / key in code | A02 | CWE-798 | V13 Configuration | A.8.9, A.8.12 |
| Weak crypto / hashing | A04 | CWE-327, CWE-338 | V11 Cryptography | A.8.24 |
| SQL / command injection | A05 | CWE-89, CWE-78 | V1 Encoding and Sanitization | A.8.28 |
| XSS | A05 | CWE-79 | V1 / V3 | A.8.28 |
| eval / code injection | A05 | CWE-94 | V1 | A.8.28 |
| Path traversal | A01 / A05 | CWE-22 | V5 File Handling | A.8.28 |
| File upload | A06 / A05 | CWE-434 | V5 File Handling | A.8.28 |
| Insecure design, business-logic abuse | A06 | CWE-840 | V2 Validation and Business Logic | A.8.26, A.8.27 |
| Authentication, sessions, JWT | A07 | CWE-287, CWE-307 | V6 Authentication, V7 Session Management, V9 Self-contained Tokens | A.8.28 |
| Deserialization | A08 | CWE-502 | V1 | A.8.28 |
| Unsigned / unpinned dependency or CI action | A03, A08 | CWE-829, CWE-494 | V15 Secure Coding and Architecture | A.8.28, A.8.30 |
| Vulnerable dependency | A03 | CWE-1395 | V15 | A.8.8 |
| No security logging / alerting | A09 | CWE-778 | V16 Security Logging and Error Handling | A.8.15 |
| Fail-open, swallowed error, error detail leak | A10 | CWE-636, CWE-209, CWE-390 | V16 | A.8.28 |
| Race condition (TOCTOU, double spend) | A06 | CWE-362, CWE-367 | V2 | A.8.28 |
| Direct / indirect prompt injection | LLM01:2026 | CWE-77 | — | A.8.28 |
| Markdown / link exfiltration, PII in output | LLM02:2026 | CWE-200 | V14 Data Protection | A.8.12 |
| Excessive agent permissions, no confirmation | LLM03:2026 | CWE-269 | — | A.8.2 |
| Unpinned MCP server, untrusted model / adapter | LLM04:2026 | CWE-1357 | — | A.8.30 |
| No token / loop / cost limits | LLM06:2026 | CWE-770 | V2 | A.8.6 |
| Secrets / rules in system prompt | LLM08:2026 | CWE-200 | V14 | A.8.12 |
| RAG tenant isolation, embedding access | LLM09:2026 | CWE-639 | V8 | A.8.3 |
| LLM output executed / rendered unsafely | LLM10:2026 | CWE-79, CWE-94 | V1 | A.8.28 |
| Agent / MCP config (see AGENT-MCP.md) | A02, A03, LLM03:2026, LLM04:2026 | CWE-798, CWE-829 | V13 | A.8.9 |

CWE ids come from the CWE catalogue. ISO Annex A names, secondary sources: A.8.8 technical vulnerabilities, A.8.9
configuration management, A.8.12 data leakage prevention, A.8.15 logging, A.8.24 use of cryptography, A.8.25 secure
development life cycle, A.8.26 application security requirements, A.8.27 secure architecture, A.8.28 secure coding,
A.8.29 security testing, A.8.30 outsourced development. The report is evidence for A.8.25–8.29; it does not certify compliance.
