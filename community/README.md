# Community Addons

Community addons are independently published. Wealthfolio does not build, host,
audit, endorse, or support them. This directory is a discovery listing: the
package is downloaded from the publisher's own repository and installed with
**Install from File** in Wealthfolio.

Listing requirements and the publisher attestation are in
[POLICIES.md](../POLICIES.md).

| Addon | Publisher | Status | Licence | Runtime | Repo |
| --- | --- | --- | --- | --- | --- |
| Adanos Sentiment | Adanos | active | MIT | SDK 3.6+ | [Repo](https://github.com/adanos-software/wealthfolio-adanos-sentiment) |
| Asset Amount & Cash Timeline | bryanrvo1511 | pending | MIT | pre-3.6 — rebuild needed | [Repo](https://github.com/bryanrvo/Asset-amount-Cash-Timeline-add-on) |
| Broker Importer | waldonso2 | active | MIT | SDK 3.6+ | [Repo](https://github.com/waldonso2/wealthfolio-importer-addon) |
| DeGiro Importer | shuisman | active | MIT | SDK 3.6+ | [Repo](https://github.com/shuisman/degiro-importer) |
| Dividends Importer | kwaich | pending | MIT | SDK 3.6+ | [Repo](https://github.com/kwaich/dividend-tracker) |
| Wealthfolio Dividend Tracker | ragnarok896209 | pending | none | pre-3.6 — rebuild needed | [Repo](https://github.com/ragnarok-89/Wealthfolio-Dividend-Tracker) |
| Lunch Money Addon | elson8012 | pending | MIT | pre-3.6 — rebuild needed | [Repo](https://github.com/elson/lunchmoney-addon) |
| MyInvestor Importer | blastik | active | MIT | SDK 3.6+ | [Repo](https://github.com/blastik/myinvestor-importer-addon) |
| Wealthfolio Rebalancer | ibalboteo | pending | none | SDK 3.6+ | [Repo](https://github.com/ibalboteo/wealthfolio-rebalancer) |
| SimpleFin Sync | Bubbles840 | active | MIT | SDK 3.6+ | [Repo](https://github.com/Bubbles840/wealthfolio-simplefin-addon) |
| SimpleFIN Sync | Christian Mendieta | active | MIT | SDK 3.6+ | [Repo](https://github.com/christancho/simplefin-wealthfolio-addon) |
| Trade Republic Importer | blastik | active | MIT | SDK 3.6+ | [Repo](https://github.com/blastik/trade-republic-importer-addon) |
| Value Averaging Addon | wujoe | pending | MIT | pre-3.6 — rebuild needed | [Repo](https://github.com/WuJoe826/Value-Averaging-Addon) |
| Skatt (Sweden) | AlexanderBabel | active | MIT | SDK 3.6+ | [Repo](https://github.com/AlexanderBabel/wealthfolio-skatt) |

Licence and runtime are **derived** from each publisher's repository, not
declared here — see [community/derived.json](derived.json), refreshed with
`pnpm derive:community`.

Only `active` entries appear on
[wealthfolio.app/addons/community](https://wealthfolio.app/addons/community). A
listing cannot become active while its repository has no detectable licence, or
while its manifest does not declare a readable `sdkVersion` of 3.6 or newer —
before that release an addon could reach the network without declaring it, so
its manifest cannot show where data goes.
