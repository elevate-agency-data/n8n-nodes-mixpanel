# Changelog

## 1.0.0

- Initial release: 106 operations across 21 resources, built from the Mixpanel OpenAPI
  specifications.
- Three credentials: Service Account (recommended), Project Secret (legacy) and GDPR
  (OAuth token, used by the GDPR resource only). All three select the US, EU or India
  data residency hosts.
- Project token added to ingestion records that do not carry one, verbose mode on
  ingestion so that rejected data fails the node, strict mode on Import Events.
- NDJSON, CSV and bare-value responses turned into items.
- HTTP errors carry Mixpanel's own message, with an explicit hint on plan limits (HTTP 402).
