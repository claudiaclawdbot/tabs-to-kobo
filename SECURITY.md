# Security policy

## Supported version

Security fixes are made on the current `main` branch and included in the next release.

## Report a vulnerability

Please use the repository's private **Security > Report a vulnerability** form. Do not open a public issue containing exploit details, private URLs, generated books, or local file paths.

Include the affected version, operating system, reproduction steps, and impact. Remove tokens, account details, and private reading data before attaching logs.

## Local deployment boundary

The build and configuration endpoints are restricted to loopback. Same-Wi-Fi mode deliberately exposes only the EPUB list and downloads to the selected LAN address. That download page has no authentication, so it belongs on a trusted home network rather than public, guest, office, or shared Wi-Fi.

The source fetcher blocks non-public IP ranges by default, pins each request to the checked DNS result, rechecks redirect destinations, limits response size and time, and does not send browser cookies. Setting `allowPrivateNetworkSources` or `ALLOW_PRIVATE_NETWORK_SOURCES=true` opts out of the private-address protection.

This project does not include an update service, telemetry service, hosted API, or credential store.
