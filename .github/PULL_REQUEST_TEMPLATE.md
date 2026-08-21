<!--
Adding or updating a community directory listing? Fill in everything below.
Changing an official addon instead? Delete this template and describe the change.
-->

## Listing

- Addon id:
- Repository:
- Publisher (person or organisation responsible for the addon):

## What changed

<!-- New listing, metadata update, or removal. One or two sentences. -->

## Publisher attestation

I have read [POLICIES.md](https://github.com/wealthfolio/wealthfolio-addons/blob/main/POLICIES.md) and confirm:

- [ ] I am the publisher of this addon, or I am expressly authorised to act for
      the publisher. The `author` field names the publisher, not just my GitHub
      account.
- [ ] I have the rights to the name, description, logo, and screenshots I
      submitted, and I grant Wealthfolio permission to display them for this
      listing.
- [ ] The source repository is public and contains a licence file. (Wealthfolio
      reads the licence from the repository; a listing without a detectable one
      cannot be published.)
- [ ] Everything I declared is accurate — features, external services, and what
      happens to user data.
- [ ] There is no hidden data collection and no undisclosed remote code. My
      manifest declares every host the addon reaches, and anything reaching a
      service the manifest cannot show is declared in `dataHandling` with a
      `privacyUrl`.
- [ ] I am responsible for support, updates, security fixes, privacy compliance,
      licensing, and any commercial terms for this addon.
- [ ] The name and branding do not imply the addon is official, endorsed, or
      affiliated with Wealthfolio.
- [ ] I understand a listing is a link only: Wealthfolio does not host, build,
      audit, endorse, or support this addon, and may remove the listing at its
      discretion.

## Metadata checklist

- [ ] File is at `community/directory/<addon-id>/addon.store.json`, and the
      directory name matches the `id`.
- [ ] `commercialModel` is set. Licence, compatibility, and standard notices are
      derived from your repository — do not fill those in.
- [ ] The repository has a licence file and a `manifest.json` at its root.
- [ ] **The manifest declares `sdkVersion` 3.6 or newer.** Before 3.6 an addon
      could reach the network without declaring it, so its manifest cannot show
      where data goes — and a listing cannot be published on that basis.
      Rebuild against the current SDK; declaring `dataHandling` is not an
      alternative.
- [ ] All URLs are HTTPS and resolve.
- [ ] `pnpm validate:addons` and `pnpm generate` pass locally with no diff.

<!--
Do not report a vulnerability, a malicious addon, or an IP complaint here.
Email hello@wealthfolio.app — see SECURITY.md.
-->
