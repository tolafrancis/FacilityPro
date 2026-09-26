Technicians do the hands-on work. FacilityPro gives each one a work list, a profile (skills, rate, shift, certifications) and an attendance log, and can route jobs to the right person automatically.

**Who can use it:** Technicians see **My work** and log their attendance. Administrators and Managers manage profiles, routing and attendance.

## My work (for technicians)

![My work](/help/screens/my-work.webp)

① A job assigned to you, with priority, status and due date

1. Click **My work** in the menu (on a phone it is in the bottom bar).
2. Open a job to start it, log parts and time, fill in the checklist and resolve it. Full steps: [Work orders → Step 4](/help/guide/work-orders#step-4-doing-the-work-technician).

> **Tip:** No signal in a plant room? Keep working. Status changes and photos are saved on the phone and sent when you are back online. The sync icon in the top bar shows what is waiting.

## Technician profiles

Administrators open a person's profile from **Settings → Team & roles → Profile** ([User management](/help/guide/user-management#member-profiles-and-site-access)). A profile holds:

- **Employee ID** and **phone**,
- **Labor rate** (per hour), used to cost logged time,
- **Shift**, e.g. *Day (07:00–16:00)*,
- **Skills**, e.g. *HVAC, Chillers, Refrigeration*,
- **Certifications**, each with an expiry date, e.g. *Refrigerant handling (Level 2)*.

> **Warning:** Keep the labor rate up to date. Work order costs use the rate at the time the labour was logged.

## Teams and routing work automatically

A person's **team** (e.g. *HVAC*, *Plumbing*) is shown under their name. To send jobs to the right team automatically, create routing workflows:

1. Go to **Workflows** → **Create workflow**.
2. **Trigger:** *Work Order Created*. In **Trigger settings**, choose the fault type (e.g. *Water leak*) or a priority.
3. **Action:** *Assign To* → choose the technician.
4. Save. From now on, matching work orders are assigned as soon as they are created.

The demo has five routing workflows, such as *Route: Water leaks → Kenji (Plumbing)*. See [Settings → Workflows](/help/guide/settings#workflows-automation).

## Site access

A technician can be limited to certain sites, so they only see work there. Set this from **Settings → Team & roles → Site access** ([User management](/help/guide/user-management#member-profiles-and-site-access)). With no sites ticked, the person sees every site.

## Technician attendance

![Technician attendance](/help/screens/attendance.webp)

1. Go to **Technician attendance**.
2. Under **Log attendance**, choose the **Technician**, the **Site / location** and the **Action** (**Checked in** or **Checked out**).
3. Add a **Note** if useful (e.g. handover details) and click **Save entry**.
4. The right-hand list shows the latest check-ins and check-outs, so supervisors can see who is on site.
