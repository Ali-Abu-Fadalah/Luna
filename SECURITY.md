# Security

Luna's public release is separated from private organization configuration and development history. Network access to private work services and AI providers is omitted. Public image requests are bounded, use HTTPS, omit credentials and reject redirects and local-network targets.

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting feature if it is available on this repository. If it is unavailable, contact the repository owner through a private channel before sending details. Do not put credentials, spreadsheet URLs, customer data, proof containing real records, or exploitable private-system information into a public issue.

Include the Luna version, the affected component, reproduction steps using synthetic data, and the impact you observed. The current supported public release is 3.0.

## Before publishing a change

Run `npm test` and `npm run security:check` in `luna/`. Review the staged diff and every release asset. The scanner is a guardrail, not a guarantee that confidential information cannot be introduced.

Keep local configuration in ignored files. Do not copy a private `.git` directory into this repository or merge private history into a public branch. Do not enable a workflow that uploads browser profiles, session files, storage dumps or production captures.

## If a secret is exposed

Revoke or rotate it at the service immediately. Removing a file from the latest commit does not remove it from history, clones or downloaded releases. Handle the affected history and release assets separately after rotation.
