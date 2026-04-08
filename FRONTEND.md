Use full-repo context and extra-high effort. Read the current repo, current governance files, current board/task system, current shell/components/loaders/APIs, and current live behavior before editing anything.

This is not a marketing site.
This is not a client-service dashboard.
This is the internal operating system for Sugar and Leather AI.

Mission:
Redesign and upgrade Mission Control so it is both:
1. actually usable as a daily operational system
2. visually sharp, dynamic, modern, and uncluttered

Do not return only a plan.
Implement the changes.

## Core context

- I am Brendan, Head of Software Engineering.
- Jarvis is the main orchestrator agent and final AI-side controller of Mission Control.
- Primary mission: ship `aries-app`
- Secondary platform mission: make Mission Control trustworthy and make runtime visibility real
- Existing AI structure:
  - Jarvis
  - Forge = Engineering Delivery
  - Signal = Runtime & Automation
  - Ledger = Operations & Knowledge
- Existing human collaborators:
  - Rohan = frontend owner
  - Roy = backend owner
  - Somwya = manual / non-coding / human-required execution

### Protected-system boundaries
- Mission Control is AI-only.
- No human team member should be assigned Mission Control work.
- OpenClaw changes remain Brendan-gated unless explicitly authorized.
- This prompt is for Mission Control/dashboard work, not OpenClaw config work.
- Do not weaken protected-system boundaries while improving UX.

## What is wrong right now

The current dashboard is informative but too cluttered.
It surfaces too much flat information at once.
The hierarchy is weak.
The interaction model is too thin.
It is missing real operational affordances.

Current pain points include:
- I cannot smoothly mark tasks as started / in review / completed / shipped / blocked / reopened
- reassigning tasks is too weak or missing
- forcing tasks / override actions are too weak or missing
- task actions feel passive instead of operational
- the board feels more like a status display than a working command surface
- the UI has too much simultaneous detail and not enough progressive disclosure
- it needs better dropdowns, expansions, drawers, action menus, tabs, and filtering
- it needs slight animation / motion and a more polished dynamic feel
- it needs better visual hierarchy, density control, and decluttering
- while staying fast, truthful, and operationally serious

## Primary product goal

Transform Mission Control into a production-grade internal command system that is:
- operationally powerful
- visually refined
- uncluttered by default
- fast to scan
- fast to act in
- precise in status/ownership
- dynamic without being gaudy
- progressively disclosed instead of flattening everything at once

## Non-negotiables

- Work against the actual deployed Mission Control source of truth, not a disconnected scratch path
- Do not create a second dashboard or second board system
- Evolve the current Mission Control app
- Use real data sources only
- No mock telemetry
- No fake runtime status
- No fake assignee logic
- No free-text assignee strings where real identities should be used
- Preserve truthful unavailable/error/loading states
- Do not regress current performance/security work
- Keep the UI responsive and accessible
- Keep Mission Control routing/governance constraints intact

## Use full context before editing

Before coding, audit the current real equivalents of these areas if they exist in the repo:
- app shell / routing
- sidebar / navigation
- Command page
- Knowledge page
- Build Lab page
- Runtime page
- Org Chart page
- shared API client
- board/project/task library
- execution task JSON / current board data
- org chart / identity linkage
- current types/models
- server API routes
- server loaders for runtime / cron / build-lab / knowledge surfaces
- styles, tokens, motion, layout primitives
- governance / delegation / protected-system files that affect ownership or allowed actions

At minimum inspect the current real equivalents of files like:
- `src/App.tsx`
- `src/components/CommandPage.tsx`
- `src/components/KnowledgePage.tsx`
- `src/components/RuntimePage.tsx`
- `src/lib/api.ts`
- `src/lib/orgDesign.ts`
- `src/types.ts`
- `server/api.mjs`
- `server/lib/project-board.mjs`
- `server/data/execution-tasks.json`
- `server/loaders/runtime-data.mjs`
- `server/loaders/cron-health-data.mjs`
- `server/loaders/build-lab-data.mjs`

Also reconcile with repo truth from:
- `AGENTS.md`
- `PROTECTED_SYSTEMS.md`
- `team/DELEGATION-RULES.md`
- `PRIORITIES.md`
- `data/org-chart.json` if present
- current board/org linkage if it already exists somewhere else

## P0: Must-fix functional upgrades

### 1. Turn the Command / Project Board into a real operational surface
The board must support real daily usage.

Add or complete these task actions:
- Start task
- Move to ready
- Move to active
- Move to review
- Mark shipped / complete
- Reopen
- Block / unblock
- Reassign
- Change priority
- Change due date
- Add note / decision / blocker note
- Link deliverable
- Update next action
- Bulk-edit selected tasks
- Force assign
- Force status override
- Force escalation / priority bump

Important:
- “started”, “completed”, etc. may be UI action labels, but they must map cleanly to the canonical internal status model
- preserve the real backend/task model if possible
- if you need a cleaner UI label layer on top of the status model, do that instead of corrupting the data model

### 2. Add a serious task details interaction model
Do not make users do everything inside cramped cards.

Build a better interaction model with:
- compact board/list cards by default
- task details drawer or side panel
- expandable history
- notes timeline
- status history timeline
- assignee control
- dependency visibility
- linked deliverables
- linked blockers
- quick action bar
- audit trail for forced actions

### 3. Assignee model must be real
Assignee logic must use actual identities, not weak strings.

Requirements:
- use real assignee ids from org chart / identity data
- display name + emoji + role/department where useful
- support:
  - Jarvis
  - chiefs
  - humans where allowed
- enforce routing restrictions by system scope:
  - Mission Control tasks cannot route to humans
  - OpenClaw execution tasks cannot route to chiefs/sub-agents/humans
  - OpenClaw tasks may only be `Brendan-only` or `proposal-for-Brendan-review`
- invalid assignments must be rejected by both UI and API

### 4. Force actions must be explicit and audited
“Force tasks” should become real operational controls, not vague behavior.

Implement explicit force actions such as:
- force assign
- force start
- force move to review
- force close / shipped
- force reopen
- force escalate
- force priority override

Each force action must require:
- actor
- timestamp
- reason
- optional linked note
- audit history entry

## P0: Declutter the information architecture

### 5. Progressive disclosure everywhere
The dashboard currently exposes too much at once.

Refactor the UI so the default state is clean and scannable.

Use:
- collapsible sections
- dropdown menus
- expandable rows/cards
- detail drawers
- segmented controls
- tabs
- accordions
- “show more” patterns
- summary-first, details-on-demand layout

The main rule:
- the first view should answer “what matters now?”
- deeper data should require one more interaction, not be dumped by default

### 6. Rework the app shell and page hierarchy
Improve:
- sidebar/nav hierarchy
- top-level page framing
- page headers
- action placement
- summary strips
- filters
- sticky action/filter bars when useful
- breadcrumb/back patterns where needed

Each module should have:
- a clean landing state
- a summary layer
- a detail layer
- consistent action placement

## P1: Dynamic visual appeal without noise

### 7. Visual redesign
The dashboard should feel more alive and deliberate, not flat and overloaded.

Upgrade the visual system:
- stronger spacing hierarchy
- better typography hierarchy
- clearer contrast between summaries, actions, and dense data
- cleaner card system
- better grouping and surface treatment
- sharper status colors
- subtle department accents
- better icon use
- cleaner empty/loading/error/unavailable states
- improved layout rhythm

Do not make it look like generic AI SaaS.
It should feel intentional, technical, polished, and operational.

### 8. Motion and micro-interactions
Add slight motion only where it helps.

Use:
- subtle hover feedback
- dropdown/accordion transitions
- drawer slide/fade
- task move/status feedback
- skeleton transitions
- small count-up or state-change polish where appropriate

Constraints:
- motion should be restrained
- prefer 120–220ms transitions
- no heavy animation for its own sake
- no motion that worsens CLS/LCP or makes the app feel toy-like
- preserve accessibility and reduced-motion support

### 9. Density control
Give the UI breathing room without hiding functionality.

Add:
- better default density
- optional compact mode if useful
- line clamping where appropriate
- metadata folding
- stacked detail only when expanded
- summary chips instead of full text blocks where possible

## P1: Better operational flows

### 10. Better views
The board should support multiple working modes.

Implement useful views such as:
- Board / Kanban
- List / Table
- By assignee
- By department
- Blocked
- Stale
- Ready next
- My tasks
- At risk
- Recently changed

Saved or remembered filters are desirable if easy to do cleanly.

### 11. Better filtering and search
Improve discoverability with:
- fast search
- filter chips
- assignee dropdown
- status dropdown
- priority dropdown
- system scope filter
- department filter
- blocked toggle
- stale toggle
- quick “mine” views for Jarvis/chiefs

### 12. Better board summaries
Add useful summary components without clutter:
- counts by status
- blocked count
- stale count
- at-risk count
- recently reassigned
- due soon / overdue
- active by assignee
- throughput trend if easy and truthful

Do not overdo dashboards that repeat the same data five times.

## P1: Strengthen surrounding modules without bloating them

### 13. Org Chart
Improve the org chart so it is cleaner and more navigable:
- progressive disclosure on roles
- better hierarchy display
- expandable department groups
- better person/chief cards
- clear routing/ownership visibility
- link into board tasks and active load where useful
- keep it readable at a glance

### 14. Runtime / Knowledge / Build Lab
These modules should also benefit from decluttering:
- cleaner summaries
- collapsible error/details
- expandable panels
- better visual grouping
- less flat wall-of-information layout
- preserve truthful states
- do not sacrifice real runtime data integrity

## P2: Nice-to-have if core is stable

If there is time after the above is implemented well:
- lightweight command palette
- keyboard shortcuts for common board actions
- multi-select bulk actions
- undo for status/assignee changes
- richer task timeline
- richer deliverable grouping
- lightweight board activity feed

Do not do P2 if P0/P1 are not finished well.

## Data model and API expectations

Do not create a parallel task system.
Evolve the existing one.

At minimum, the board/task model should support:
- id
- title
- description
- assigneeId
- assigneeType
- assigneeDisplayName
- status
- priority
- createdAt
- updatedAt
- createdBy
- updatedBy
- notes[]
- statusHistory[]
- blocked
- blockerReason
- nextAction
- deliverableLink
- workstream
- systemScope
- forcedActionHistory[] if needed

If current schema differs, migrate carefully instead of inventing incompatible parallel structures.

## Performance and non-regression requirements

Do not fix clutter by making the app slower.

Preserve or improve:
- initial route responsiveness
- lazy loading of non-active modules
- truthful timeout handling
- cache behavior
- CLS
- LCP
- render stability

Do not:
- add heavy animation libraries unless already justified
- introduce more first-render API fan-out
- break current timeout isolation
- replace truthful error states with silence

## Security and truth requirements

Do not regress:
- CSP / HSTS / COOP / frame protection work if already added
- truthful unavailable/error/loading states
- protected-system routing restrictions
- OpenClaw boundaries

Mission Control must remain:
- operationally truthful
- governance-safe
- role-safe
- not fake-friendly

## Required output

Do not return only prose.

Return:
1. UX audit of what is currently cluttered / broken / underpowered
2. Proposed information architecture changes
3. Exact file tree changes
4. Exact files created/modified
5. Exact schema/API changes
6. Exact board interaction model
7. Exact force-action model
8. Exact assignee/routing enforcement model
9. Exact visual system changeseeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
10. Exact motion/progressive-disclosure changes
11. Performance/non-regression notes
12. Manual QA checklist
13. Live validation evidence against the real Mission Control app

## Verification requirements

Prove these after implementation:
- tasks can be started, reviewed, completed/shipped, reopened, blocked, and reassigned
- force actions exist and create audit entries
- assignee changes use real identities
- invalid routing is rejected
- board/list/detail views all work
- progressive disclosure reduces clutter
- dropdowns/drawers/expansions work cleanly
- slight motion exists but does not harm performance
- Mission Control remains fast and operationally truthful
- live site behavior matches repo changes

Constraints:
- No local-preview-only success claims
- No fake data
- No placeholder interactions
- No free-text assignee shortcuts
- No weakening of protected-system policy
- No purely cosmetic redesign disconnected from operations
- Prioritize real usability and elegant operational flow over decorative polish