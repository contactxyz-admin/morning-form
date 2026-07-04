/**
 * Static reference content ported from the pilot-ops planning gist
 * (2026-07-04) — everything except the task list, which now lives in
 * CompanyOpsTask (see scripts/ops/import-tasks.ts). Read-only: this is
 * background/reference material, not something founders edit day to day.
 * If a section here needs to become live/collaborative, promote it to a
 * real table the way the Workstream tab already works.
 */

export const PILOT_PLAN = {
  "goal": "Stand up temporary, members-only blood-draw clinics inside premium London gyms — the distribution wedge for MorningForm's energy & recovery product. Prove the member → booked → drawn → result → protocol → retest funnel with real numbers, then choose the long-term partner.",
  "northstar": "First in-gym pop-up LIVE in ~8 weeks — target the week of 17 Aug 2026. Securing gym venues is the gating dependency.",
  "week3": [
    "Decide: run the pilot yourself for now, or bring in a fractional lead.",
    "Send the 5 partner outreach emails (drafts in Gmail) and line up intro calls.",
    "Get the gym deck final-designed and over to Joe (he's driving venues via Flannels Group)."
  ],
  "rhythm": [
    [
      "Daily — close-out (5 min)",
      "Before you stop, pick tomorrow's ONE critical-path task. The solo enemy is busywork, not misalignment."
    ],
    [
      "Monday — plan (20 min)",
      "Set This Week's 3 (above). Pull them from the tracker; park everything else."
    ],
    [
      "Friday — review (15 min)",
      "Update statuses, log any decisions, honest gut-check against the target date."
    ],
    [
      "(When you hire)",
      "Add a Monday standup + Wednesday async update back in — not before."
    ]
  ],
  "rules": [
    "Protect the critical path — only Phase 0 is real until a partner or lead is in.",
    "Three priorities a week, not ten.",
    "Status is honest, not optimistic.",
    "Log decisions the day you make them.",
    "If it's not in here, it's not happening — add it."
  ],
  "mvp_in": [
    "In-gym booking — member picks gym, date and slot",
    "Identity + e-consent capture (timestamped, descriptive-not-diagnostic framing)",
    "Lab results ingestion adapter (FHIR/HL7/API; PDF or CSV fallback) → normalised into the health graph",
    "Form Intelligence reads the panel → plain-language picture + protocol (existing engine)",
    "Clinician-in-the-loop review queue + abnormal/critical escalation",
    "Protocol + supplement recommendation delivered to the member",
    "Retest prompt / scheduling — the compounding loop",
    "Ops funnel dashboard (booked → drawn → result → protocol) feeding the KPIs tab",
    "Data: GDPR, DPA with lab/partner, encryption, consent + clinician sign-off audit log"
  ],
  "mvp_out": [
    "Native mobile app (web is fine for the pilot)",
    "Self-serve payments / subscription billing at scale",
    "Automated supplement fulfilment",
    "Multi-city scaling infrastructure",
    "New wearable integrations beyond what already exists",
    "Self-serve clinician tooling (manual review is fine for the pilot)"
  ],
  "stack": {
    "have": [
      "Next.js + Vercel",
      "Postgres + pgvector (Neon)",
      "Anthropic + OpenAI — Form Intelligence (hybrid retrieval, scribe routing)",
      "Magic-link auth",
      "Per-user MCP"
    ],
    "build": [
      "Booking module (build, or integrate Cal.com)",
      "E-consent + audit service",
      "Lab results ingestion adapter (FHIR/HL7/API + PDF/CSV fallback)",
      "Clinician review queue + escalation workflow",
      "Ops/admin funnel dashboard",
      "DPA + results encryption & access control"
    ]
  },
  "buildplan": [
    [
      "W1–2 · now",
      "Design sprint: map the full pilot flow (book → consent → results → interpret → clinician review → protocol → retest). Define the energy/recovery panel + marker mapping into Form Intelligence. Spec the lab results contract. LOCK BUILD CAPACITY (eng/contractor or CTO)."
    ],
    [
      "W3–4",
      "Build core: booking + e-consent + ops funnel dashboard. Stub results ingestion against the lab's format. Design the clinician review UI."
    ],
    [
      "W5–6",
      "Build the lab results adapter; wire results → health graph → Form Intelligence. Build the clinician review queue + abnormal/critical escalation."
    ],
    [
      "W7",
      "End-to-end integration; DPA + security in place; test with synthetic + a few real samples."
    ],
    [
      "W8 · ~10 Aug",
      "Full dry-run. MVP READY."
    ],
    [
      "W9 · 17 Aug",
      "PILOT LIVE — first in-gym draws. Monitor, hotfix."
    ],
    [
      "W10+",
      "Iterate from pilot data; harden; prepare for scale."
    ]
  ],
  "cpto": [
    "Start now. Design and the lab-integration conversation are the long poles. The MVP must be ready by W8 (~10 Aug) to go live W9 (17 Aug).",
    "Gym partnerships are the gating dependency for the whole pilot — no venue, no pilot. Get the partnership deck out and 1–2 venues secured by W4.",
    "Lab results integration is the technical critical path. Confirm the lab/partner's format (FHIR/HL7/API/CSV) early, and build a manual-upload fallback so a slow integration can't block the pilot.",
    "Clinician-in-the-loop review + escalation is non-negotiable for safety — build it before live, not after.",
    "Build capacity is the real constraint. Solo today: lock eng hands in W1–2 (contractor or the CTO hire) or the 17 Aug date slips.",
    "Reuse the live product (Form Intelligence, health graph, auth). The genuinely new work is booking, consent, results ingestion, and the clinician queue."
  ],
  "kpis": [
    [
      "Pilot live in a London gym",
      "~8 weeks — wk of 17 Aug",
      "The North Star date"
    ],
    [
      "Build lead decision (self vs fractional)",
      "Week 1",
      "Unlocks the pace"
    ],
    [
      "Gym venues secured (1–2 + sponsor)",
      "By W4 (~13 Jul)",
      "GATING dependency for the pilot"
    ],
    [
      "Phlebotomy partner signed",
      "By W3",
      "Down-select via Scorecard"
    ],
    [
      "MVP ready for pilot (build + design)",
      "By W8 (~10 Aug)",
      "Booking, consent, results, clinician review"
    ],
    [
      "Draws completed in pilot",
      "50–100",
      "Across 1–2 gyms"
    ],
    [
      "Booking conversion (member → booked)",
      "≥ 10%",
      "Of members reached"
    ],
    [
      "Show rate (booked → drawn)",
      "≥ 85%",
      "No-show is the silent killer"
    ],
    [
      "Result → protocol delivered",
      "≥ 95%",
      "Clinician-in-the-loop"
    ],
    [
      "Retest booked (the loop)",
      "≥ 30%",
      "Compounding revenue signal"
    ],
    [
      "Member NPS",
      "≥ 50",
      "Post-protocol survey"
    ],
    [
      "Serious adverse events",
      "0",
      "Faint protocol in place"
    ],
    [
      "Turnaround (draw → result)",
      "≤ 3 days",
      "Depends on panel + lab"
    ],
    [
      "Cost per completed result",
      "≤ £[set]",
      "All-in"
    ],
    [
      "Investor pitch deck ready",
      "Draft Wk 6 · final Wk 10",
      "Strengthen with pilot numbers"
    ],
    [
      "Long-term partner decision",
      "By week 12",
      "On the back of real numbers"
    ]
  ],
  "weeks": [
    {
      "w": 1,
      "label": "22 Jun"
    },
    {
      "w": 2,
      "label": "29 Jun"
    },
    {
      "w": 3,
      "label": "6 Jul"
    },
    {
      "w": 4,
      "label": "13 Jul"
    },
    {
      "w": 5,
      "label": "20 Jul"
    },
    {
      "w": 6,
      "label": "27 Jul"
    },
    {
      "w": 7,
      "label": "3 Aug"
    },
    {
      "w": 8,
      "label": "10 Aug"
    },
    {
      "w": 9,
      "label": "17 Aug"
    },
    {
      "w": 10,
      "label": "24 Aug"
    },
    {
      "w": 11,
      "label": "31 Aug"
    },
    {
      "w": 12,
      "label": "7 Sep"
    }
  ],
  "bars": [
    [
      "Phase 0 · Decide & line up",
      1,
      3,
      "coral"
    ],
    [
      "Gym partnerships: deck → outreach → secure",
      1,
      4,
      "gym"
    ],
    [
      "Phlebotomy partner: outreach → select",
      1,
      3,
      "coral"
    ],
    [
      "Product · build the MVP",
      2,
      8,
      "tech"
    ],
    [
      "Phase 1 · Build the rails",
      4,
      7,
      "coral"
    ],
    [
      "Phase 2 · Run the pilot",
      9,
      10,
      "sage"
    ],
    [
      "Phase 3 · Decide & scale",
      10,
      12,
      "coral"
    ],
    [
      "Raise · Draft investor deck",
      2,
      6,
      "gold"
    ],
    [
      "Raise · Data room + targets",
      5,
      8,
      "gold"
    ],
    [
      "Raise · Open the raise",
      11,
      12,
      "gold"
    ]
  ],
  "milestones": {
    "1": "Kickoff",
    "3": "Partner signed",
    "4": "Gyms secured",
    "8": "MVP ready",
    "9": "Pilot LIVE",
    "10": "Pilot data in",
    "11": "Raise opens"
  },
  "partners": [
    "Phlebotomy Svcs",
    "Inuvi",
    "Bluecrest",
    "Randox Health",
    "Qured"
  ],
  "criteria": [
    [
      "CQC cover (mobile/temp venue)",
      12,
      [
        5,
        5,
        5,
        5,
        5
      ]
    ],
    [
      "Phlebotomist competency + indemnity",
      10,
      [
        4,
        5,
        4,
        5,
        4
      ]
    ],
    [
      "On-site centrifugation / stability",
      8,
      [
        3,
        5,
        3,
        4,
        4
      ]
    ],
    [
      "Cold-chain + courier + turnaround",
      8,
      [
        4,
        5,
        4,
        5,
        4
      ]
    ],
    [
      "Lab flexibility (choose/keep lab)",
      10,
      [
        5,
        4,
        2,
        2,
        3
      ]
    ],
    [
      "Consumer UX (book/consent/handoff)",
      12,
      [
        3,
        4,
        4,
        3,
        5
      ]
    ],
    [
      "White-label / co-brand willingness",
      10,
      [
        4,
        4,
        2,
        2,
        3
      ]
    ],
    [
      "Data (API/HL7/FHIR, GDPR)",
      8,
      [
        3,
        4,
        3,
        4,
        4
      ]
    ],
    [
      "Coverage (London → national)",
      7,
      [
        4,
        5,
        5,
        5,
        4
      ]
    ],
    [
      "Commercials (price/min/exclusivity)",
      8,
      [
        4,
        3,
        3,
        3,
        3
      ]
    ],
    [
      "Speed to first pilot",
      7,
      [
        5,
        3,
        3,
        2,
        4
      ]
    ]
  ],
  "diligence": [
    "Show your CQC registration + the activities/locations it covers for pop-up sites.",
    "How do you handle consent, ID, and a member who faints (vasovagal)?",
    "Sample pathway for OUR panel — spin on site or transport? Stability window? Turnaround?",
    "Can we use our own lab, or is analysis bundled? Can we choose the panel?",
    "How do results come back — API/HL7/FHIR? Can you push into our system?",
    "Who carries indemnity for the phlebotomist and the clinical activity?",
    "Can you white-label / co-brand the experience as MorningForm?",
    "Cost per draw at 50 / 200 / 1,000 draws a month, and minimums?",
    "How fast can you run a first pop-up in a London gym?",
    "How do you escalate abnormal/critical results back to our clinician?"
  ],
  "funnel": [
    "Members reached",
    "Booked a slot",
    "Drawn (sample taken)",
    "Result returned",
    "Protocol delivered",
    "Retest booked"
  ],
  "decisions": [
    [
      "Lab model: decoupled vs bundled",
      "Own lab account + white-label collection  vs  partner-bundled lab",
      "DECIDED: decoupled. Own the lab relationship (TDL / Eurofins) and use a white-label collection partner. Why: panel control, margin, and results integration (API/FHIR) into Form Intelligence.",
      "Decided"
    ],
    [
      "Pilot partner selection",
      "Phleb Svcs / Inuvi / Bluecrest / Randox / Qured",
      "Decoupled model → favour white-label collection (Bloods & Beyond, Phleb Svcs, Inuvi, Miracle) over bundled (Lola, Randox).",
      "Open"
    ],
    [
      "Reference lab",
      "TDL / Eurofins (County Path) / SYNLAB",
      "TDL + Eurofins quotes requested. Choose on price, turnaround and API/FHIR results delivery.",
      "Open"
    ],
    [
      "White-label vs co-brand",
      "Fully white-label vs co-brand (faster)"
    ],
    [
      "Pilot gym(s)",
      "Flannels Group estate (Joe's relationships) / Third Space / BXR / Equinox",
      "Joe leading via warm Flannels Group relationships. Confirm the venue fits the high-agency men 30–50 wedge.",
      "Open"
    ],
    [
      "Build lead: hire vs fractional + who",
      "Kolsi / Elliott / Goldthorpe / FT hire"
    ],
    [
      "Pilot panel definition",
      "Energy/recovery marker set"
    ],
    [
      "Qured: partner or compete",
      "Turnkey partner vs strategic-learning call only"
    ]
  ],
  "risk": [
    [
      "CQC registration covers mobile/temp venues",
      "Partner",
      "Named Registered Manager"
    ],
    [
      "Phlebotomist competency, Care Cert, DBS, indemnity",
      "Partner",
      "Per phlebotomist"
    ],
    [
      "Consent & identity (e-consent, ID, framing)",
      "MorningForm",
      "Descriptive-not-diagnostic"
    ],
    [
      "Infection prevention & control (IPC)",
      "Partner",
      "Private cleanable room"
    ],
    [
      "Sharps & clinical-waste carrier + spill kit",
      "Partner",
      ""
    ],
    [
      "Adverse events / vasovagal protocol + first aid",
      "Partner",
      "Incident reporting"
    ],
    [
      "Sample integrity (label, spin, cold-chain, SLA)",
      "Partner",
      "Stability per assay"
    ],
    [
      "Results governance: clinician-in-the-loop + escalation",
      "MorningForm",
      "Abnormal/critical ownership"
    ],
    [
      "Data: GDPR, DPA, secure feed",
      "Both",
      "Into the health graph"
    ],
    [
      "Insurance: partner PI/PL + MF interpretation cover",
      "Both",
      ""
    ],
    [
      "Venue: gym agreement, risk assessment, comms",
      "MorningForm",
      ""
    ]
  ],
  "riskreg": [
    [
      "Partner CQC doesn't cover pop-up sites",
      "Med",
      "High",
      "Verify registration before signing"
    ],
    [
      "Assay unstable for chosen panel",
      "Med",
      "High",
      "Confirm centrifuge / stability early"
    ],
    [
      "Low booking conversion in-gym",
      "Med",
      "High",
      "Strong comms + venue sponsor + incentive"
    ],
    [
      "Adverse event (faint) on site",
      "Low",
      "High",
      "Faint SOP, first aid, private room"
    ],
    [
      "Results integration slips",
      "Med",
      "Med",
      "Start API/FHIR Wk 2; manual fallback"
    ],
    [
      "Qured competitive tension",
      "Med",
      "Med",
      "Scope the call; NDA before sharing"
    ]
  ],
  "contacts": [
    [
      "Phlebotomy Services",
      "enquiries@phlebotomy-services.co.uk",
      "Partner",
      "Draft ready",
      "Re-drafted to correct address (info@ bounced) — review + send"
    ],
    [
      "Inuvi",
      "Jonathan Benton / David Darrer",
      "Partner",
      "Not started",
      "Email-hunt + outreach"
    ],
    [
      "Bluecrest Wellness",
      "Kim Kelly / Laurel Bruce-Hay",
      "Partner",
      "Not started",
      "Turnkey pop-up option"
    ],
    [
      "Randox Health",
      "Lauren Aiken / Sarah McGrane",
      "Partner",
      "Not started",
      "Draw+lab bundled"
    ],
    [
      "Qured",
      "Alex Templeton / Lyz Swanton",
      "Partner / compete",
      "Not started",
      "Exploratory call"
    ],
    [
      "Bloods & Beyond",
      "Ian Duck / Angela Tillen (COO)",
      "Partner",
      "Call booked",
      "Call booked 7 Jul 2pm. Discuss logistics + decoupled lab model"
    ],
    [
      "Blue Horizon",
      "hello@bluehorizonbloodtests.co.uk",
      "Partner",
      "Sent",
      "Sent — awaiting reply"
    ],
    [
      "Lola Health",
      "support@lolahealth.com",
      "Partner",
      "Sent",
      "Sent — awaiting reply"
    ],
    [
      "Miracle Mobile",
      "godson@miracleinside.com",
      "Partner",
      "Sent",
      "Sent (x2) — awaiting reply"
    ],
    [
      "TDL (The Doctors Laboratory)",
      "Thu Le (Account Manager)",
      "Reference lab",
      "Replied",
      "Keen. Wants a Teams call + practice details + named GMC clinician. Discount after account; HL7/API available; offers supplies + London courier"
    ],
    [
      "SYNLAB",
      "Web form (Health Solutions)",
      "Reference lab",
      "Not started",
      "Form-based; NHS-leaning, lower priority"
    ],
    [
      "Eurofins (County Pathology)",
      "Elly Derham (Cust. Service)",
      "Reference lab",
      "Replied",
      "Sent account-setup + GMC forms. Needs our test list + volumes + named GMC clinician"
    ],
    [
      "Shahrazad Kolsi",
      "Built Thriva in Person · now Sussex Pathology",
      "Fractional lead",
      "Done",
      "Connected — in conversation"
    ],
    [
      "Edward Elliott",
      "Fractional COO, Ell Co (fitness/longevity)",
      "Fractional lead",
      "Draft ready",
      "Send connection request / warm intro (Ed Stanbury)"
    ],
    [
      "Tom Goldthorpe",
      "UK Clinical Dev @ Neko · NHS GP",
      "Advisor",
      "Parked",
      "FT at Neko — revisit later"
    ],
    [
      "Daniel O.",
      "Head of Operations @ Thriva",
      "Fractional lead",
      "Sent",
      "Connection request + note sent — follow up on accept"
    ],
    [
      "Dr. Macarena Staudenmaier (MD)",
      "Head of Clinical Product & Ops @ Simplyhealth",
      "Fractional / clinical lead",
      "Sent",
      "Connection request + note sent — follow up on accept"
    ],
    [
      "Samir Guesmia",
      "Head of Operations @ MavieMe",
      "Fractional lead",
      "Not started",
      "Queued — LinkedIn monthly note-invite limit reached"
    ],
    [
      "Dr Tom Malak",
      "Physician-Exec / Clinical Ops Dir @ Healthily · GP · DPhil",
      "Clinical governance advisor",
      "Sent",
      "Message sent — advisory on clinical safety, governance + SaMD"
    ],
    [
      "Dr Mohammed Enayat",
      "HUM2N founder",
      "Advisor",
      "Not started",
      "Warm intro if possible"
    ],
    [
      "Jack Gibson",
      "Fitness Worx",
      "Reference",
      "Not started",
      "Candid 'what broke' call"
    ]
  ]
} as const;
