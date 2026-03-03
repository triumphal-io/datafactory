# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in DataFactory, **please do not open a public issue.** Instead, report it privately so we can address it before it becomes public knowledge.

### How to Report

1. **GitHub Private Vulnerability Reporting** (preferred)
   Go to the [Security Advisories](https://github.com/triumphal-io/datafactory/security/advisories) page and click **"Report a vulnerability"**.

2. **Email**
   If you prefer email, contact the maintainer directly through their [GitHub profile](https://github.com/rohanashik).

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### What to Expect

- **Acknowledgment** within 48 hours of your report
- **Status update** within 7 days with an assessment and timeline
- **Credit** in the fix release (unless you prefer to remain anonymous)

We take all reports seriously and will work to resolve confirmed vulnerabilities as quickly as possible.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` branch | Yes |

As DataFactory is in early development, security fixes are applied to the latest version only.

## Scope

The following are in scope for security reports:

- Authentication and authorization issues
- Injection vulnerabilities (SQL, command, XSS, etc.)
- Sensitive data exposure (API keys, credentials)
- Server-side request forgery (SSRF)
- Path traversal / file access issues
- WebSocket security issues

### Out of Scope

- Vulnerabilities in third-party dependencies (report these upstream, but let us know so we can update)
- Issues that require physical access to the server
- Social engineering attacks

## Known Limitations

DataFactory is in active development. The following are known and being addressed:

- Authentication is currently disabled (all endpoints are `AllowAny`) — this is intended for local development only and should not be exposed to the public internet
- Provider API keys are stored in the database — encryption at rest is planned
