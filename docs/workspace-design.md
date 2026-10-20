# CPA workspace design

This fork preserves the existing CPA management app and its v8 data contracts. Its workspace uses the spacious direction agreed with the user: clear cards, readable numbers, and fewer competing elements.

## App frame

A 220px sidebar sits beside one page header and a centered content area of at most 1,200px. Desktop page padding is 32px. Mobile navigation opens as a drawer; content uses 20px padding. Existing hash URLs remain available.

| Workspace | Purpose                                                                                |
| --------- | -------------------------------------------------------------------------------------- |
| Overview  | Connection health, account health, plan, 5-hour and weekly capacity, routing and cache |
| Accounts  | Existing credentials, maintenance, uploads, and OAuth connection                       |
| Quota     | Each account's 5-hour and weekly allowance, with reset times                           |
| Activity  | Requested versus served models, account changes, cache observations, traffic analysis  |

Settings replaces the workspace sidebar. It contains Providers, Routing, Configuration, Logs, Extensions, Plugin Store, System, Quick Start, and backend-supported plugin pages. Its top back arrow restores the last workspace page and scroll position. Routing opens the existing configuration editor at its routing fields. Feature gates and unsaved-change handling remain authoritative.

## Shared presentation

Use quiet neutral surfaces with subtle contrast, flat cards, soft corners, and generous padding. Reserve semantic colors for actual state. The shared page header owns title, description, and primary action; never repeat that header inside the page body.

| Element                 | Rule                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| Page title              | 24px, medium weight                                                    |
| Primary metric          | 32px, medium weight, tabular figures                                   |
| Main text               | 14px                                                                   |
| Supporting text         | 13px                                                                   |
| Typography              | System sans serif; monospace for code, logs, and technical identifiers |
| Main content            | One primary content region with an optional local toolbar              |
| Account and quota grids | At most two spacious cards per row by default                          |
| Traffic and logs        | Existing analytical views and readable tables/lists                    |
| Settings                | Existing grouped forms                                                 |

The shared `PageHeader`, existing `Card`, and existing `Sheet` are the reusable building blocks. Feature components own domain details; workspace styles own shared geometry and surface tokens.

## Details

Inspecting an account or quota opens a wide side panel. The panel fills the screen on mobile and returns focus to its trigger on close. Configuration, logs, and long analytical views retain full pages.

Quota cards show provider, account identity, state, 5-hour remaining, weekly remaining, reset times, last check, and a details action. Both quota windows have equal emphasis. Details show the same account context, then scoped/model limits, plan information, separate balances, manual resets, and existing account actions.

Show absolute reset dates alongside relative time and retain the page timezone. An absent window is “Not reported”; an absent reset time is unknown. Never infer restored quota after a reset or equate account credits with rate limits. Keep stale/error observations explicitly labeled. Overview distinguishes credential health from reported quota and labels cached observations.

## Preserved boundaries

OAuth secrets and management credentials stay in existing runtime authentication paths. No real credentials enter the bundle or repository. Reset actions retain their existing confirmation and session guards. API endpoints, request bodies, proxy routing, model effort, and account priority are unchanged by this UI work.

Activity reads sanitized per-request observations from the internal routing monitor through the existing authenticated management API. It shows requested and actual models separately, labels observed provider replacements, and retains account changes and failed attempts as distinct events. Recent replacement means a successful replacement completed within the last minute while the monitor is connected; it does not imply an in-flight request. Reasons appear only when CPA reports an earlier failed attempt with the same request ID.

Cache hit is input-token weighted over successful requests in the last 15 minutes. Only CPA's canonical, complete v2 token buckets count. Missing accounting is unknown, with reporting coverage shown separately. A sharp same-session drop is an observation to inspect, not proof of a routing fault. Last-known data remains labeled when the monitor disconnects.

Overview uses the existing native quota checks for per-account plan, 5-hour remaining, weekly remaining, and reset times. Quota actions and detailed scoped allowances remain on Quota. The original aggregate traffic analysis remains at `#/activity/traffic`.
