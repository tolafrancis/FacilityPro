These are the gaps found while testing every screen of FacilityPro with the demo organisation. Each is marked **Feature requires attention**. Problems that were found and already fixed are listed in the validation report.

## Access and roles

**Feature requires attention — the Vendor role sees staff data.** A Vendor account sees the same menu and data as a technician, including every work order, asset, part and location. There is no separate vendor portal limited to the vendor's own jobs yet. Vendors also cannot change a job's status unless it is assigned to them personally. *Workaround:* only give the Vendor role to trusted contractors, and have a manager update their jobs.

**Feature requires attention — people are shown by email address.** Members, assignees, labour lines and attendance show email addresses, not names. Profiles have no display-name field yet.

## Language

**Feature requires attention — some screens are English only.** When the app is set to Tiếng Việt, parts of these pages still show English text: **Settings** (tab names and several sections), **Workflows**, **Financial**, **Tenant experience**, **Documents**, **Permits to work**, **Technician attendance**, **Desks**, **Facilities**, the **Asset type** field and "create new" dialogs on the fault form, and the search lists (*No matches*, *Create new*).

**Feature requires attention — the Help Center is in English.** The guide, feature directory and page help are written in English. Buttons, the tour and the "? Help" panel headings are translated.

## Work and approvals

**Feature requires attention — approvals don't block work.** **Request approval** records a decision, but a work order can still be started or closed before it is approved. *Workaround:* agree in your team to wait for approval.

**Feature requires attention — announcement audience is free text.** The **Audience** field in *Tenant experience* is only a label. Every published announcement is shown to every tenant in the organisation.

## Display details

**Feature requires attention — some dates are shown unformatted.** *Recent bookings* (Desks, Facilities) and permit due dates show dates as *2026-09-27* instead of the usual *27 Sept 2026*.

**Feature requires attention — attendance card layout.** With a long email address, the *Checked in* label on a Technician attendance card drops below the name.

## Not verified in the test environment

These features need outside services that the test environment cannot reach. The screens were checked, but not end-to-end delivery:

- sending **email, SMS and push** notifications,
- replies on **Zalo** and **WhatsApp**,
- **AI** features: Smart assistant, AI blog drafts and inbox sentiment scoring,
- **online payment** checkout on the Billing page,
- readings arriving from **real IoT devices and gateways** (the demo uses stored readings).
