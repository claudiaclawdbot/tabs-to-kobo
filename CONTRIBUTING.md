# Contributing

Small, focused pull requests are welcome.

1. Fork the repository and create a branch.
2. Run `npm run setup` once.
3. Make the change without adding analytics, remote code, or new browser permissions unless the behavior is essential and clearly documented.
4. Run `npm run check` and `npm run package:extension`.
5. Explain the user impact and security-boundary impact in the pull request.

Never commit generated EPUBs, local configuration, account identifiers, local filesystem paths, or reading-history samples. Use synthetic pages in tests.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
