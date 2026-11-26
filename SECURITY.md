# Security Policy

## Reporting a vulnerability

Report security vulnerabilities to **support@unwatched.click**. Include a description of the issue, the steps to reproduce it, and the affected versions. Please do not open a public GitHub issue for a vulnerability.

## API keys

- Unwatched API keys (`unw_sk_...`) are user secrets. Keep them out of source code, logs, screenshots and shared documents.
- Never paste an API key into a GitHub issue, discussion or pull request — including keys you believe are revoked or expired.
- Configure keys only through environment variables or your MCP client's secret storage, as shown in the README.
- If a key leaks, revoke it immediately at https://unwatched.click/en/developer/keys.

## Scope

This repository contains the MCP server package that calls the Unwatched REST API. Vulnerabilities in the Unwatched API or website itself are also best reported to the address above.
