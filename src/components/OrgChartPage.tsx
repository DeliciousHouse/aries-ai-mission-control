import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../lib/format";
import { orgMemberHref, readOrgMemberFromLocation, replaceOrgMemberInLocation } from "../lib/orgLinks";
import type { OrgActivityItem, OrgMemberRecord, OrgPayload } from "../types";

function presenceClass(status: string | null | undefined) {
  if (status === "online") return "status-connected";
  if (status === "offline") return "status-failed";
  return "status-unavailable";
}

function presenceLabel(status: string | null | undefined) {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Unavailable";
}

function departmentTone(member: OrgMemberRecord) {
  if (member.id === "jarvis") return "tone-jarvis";
  if (member.id === "forge") return "tone-forge";
  if (member.id === "signal") return "tone-signal";
  if (member.id === "ledger") return "tone-ledger";
  return "tone-neutral";
}

function formatMaybeDate(value: string | null | undefined) {
  return value ? formatDate(value) : "Unavailable";
}

function modelLabel(member: OrgMemberRecord) {
  return member.runtime?.currentModel || "Unavailable";
}

function statusLabel(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function boardLoadLabel(member: OrgMemberRecord) {
  if (!member.board.total) return "No board load";
  return `${member.board.open} open • ${member.board.blocked} blocked`;
}

function summaryBadgeClass(status: string | null | undefined) {
  if (status === "complete") return "status-done";
  if (status === "failed") return "status-failed";
  if (status === "partial") return "status-unavailable";
  return "status-unavailable";
}

export function OrgChartPage({ payload }: { payload: OrgPayload }) {
  const aiMembers = useMemo(() => payload.members.filter((member) => member.memberKind === "ai"), [payload.members]);
  const humanMembers = useMemo(() => payload.members.filter((member) => member.memberKind === "human"), [payload.members]);
  const defaultMemberId = aiMembers[0]?.id || humanMembers[0]?.id || null;
  const [selectedId, setSelectedId] = useState<string | null>(() => readOrgMemberFromLocation() || defaultMemberId);

  useEffect(() => {
    const syncFromLocation = () => {
      const next = readOrgMemberFromLocation() || defaultMemberId;
      setSelectedId(next);
    };

    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, [defaultMemberId]);

  useEffect(() => {
    const exists = payload.members.some((member) => member.id === selectedId);
    if (!exists && defaultMemberId) {
      setSelectedId(defaultMemberId);
      replaceOrgMemberInLocation(defaultMemberId);
      return;
    }

    if (exists && selectedId) {
      replaceOrgMemberInLocation(selectedId);
    }
  }, [defaultMemberId, payload.members, selectedId]);

  const selectedMember = payload.members.find((member) => member.id === selectedId) || payload.members[0] || null;

  return (
    <section className="page-stack accent-brain">
      <header className="page-header panel org-live-header">
        <div>
          <p className="eyebrow">Org Chart</p>
          <h2>Live team state for Mission Control</h2>
          <p className="muted">
            AI runtime state is sourced from real OpenClaw registration + session evidence. Human collaborators are shown from role, board,
            and standup evidence only. If a source is missing, this surface says unavailable instead of guessing.
          </p>
        </div>
        <div className="stats-grid compact-stats">
          <div className="stat-card">
            <span>Persistent AI seats</span>
            <strong>{payload.summary.persistentAiSeats}</strong>
          </div>
          <div className="stat-card success">
            <span>Chiefs online</span>
            <strong>{payload.summary.chiefs.online}</strong>
          </div>
          <div className="stat-card danger">
            <span>Chiefs offline</span>
            <strong>{payload.summary.chiefs.offline}</strong>
          </div>
          <div className="stat-card warning">
            <span>Chiefs unavailable</span>
            <strong>{payload.summary.chiefs.unavailable}</strong>
          </div>
        </div>
      </header>

      <section className="panel org-live-summary-panel">
        <div className="overview-tile-grid">
          <article className="list-card overview-card">
            <div className="section-split">
              <div>
                <p className="eyebrow">Team Health</p>
                <h3>
                  {payload.summary.chiefs.online} online • {payload.summary.chiefs.offline} offline • {payload.summary.chiefs.unavailable} unavailable
                </h3>
              </div>
              <code>/api/org</code>
            </div>
            <p className="muted">Chief runtime presence is derived from real OpenClaw session evidence and heartbeat cadence when configured.</p>
            <ul className="inline-list with-spacing">
              <li>Open blockers {payload.summary.openBlockerCount}</li>
              <li>Humans tracked {payload.summary.humans}</li>
              <li>Standup {payload.summary.lastStandupStatus || "Unavailable"}</li>
            </ul>
          </article>

          <article className="list-card overview-card">
            <div className="section-split">
              <div>
                <p className="eyebrow">Last Standup</p>
                <h3>{payload.latestStandup?.title || "No saved transcript"}</h3>
              </div>
              <span className={`badge ${payload.latestStandup ? summaryBadgeClass(payload.latestStandup.status) : "status-unavailable"}`}>
                {payload.latestStandup?.status || "Unavailable"}
              </span>
            </div>
            <p className="muted">
              {payload.latestStandup
                ? `${payload.latestStandup.respondingChiefCount ?? 0}/${payload.latestStandup.chiefCount ?? 0} chiefs responded • ${payload.latestStandup.preview || "Preview unavailable"}`
                : "No standup transcript was found in team/meetings."}
            </p>
            <ul className="inline-list with-spacing">
              <li>{payload.latestStandup?.date || "Date unavailable"}</li>
              <li>{payload.latestStandup?.path || "Path unavailable"}</li>
              <li>{payload.latestStandup?.delivery || "Delivery unavailable"}</li>
            </ul>
            <a className="secondary-button overview-link-button" href="/?knowledgeView=standups#/knowledge">
              Open standup detail
            </a>
          </article>
        </div>
      </section>

      <div className="org-live-layout">
        <section className="panel page-stack">
          <div className="section-split">
            <div>
              <p className="eyebrow">AI team</p>
              <h3>Jarvis + registered chief seats</h3>
              <p className="muted">Click a member to open the live detail panel.</p>
            </div>
            <code>{payload.source.openclawConfigPath || "OpenClaw config unavailable"}</code>
          </div>

          <div className="org-member-grid">
            {aiMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                className={`org-member-card ${departmentTone(member)} ${selectedMember?.id === member.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(member.id)}
              >
                <div className="section-split">
                  <div>
                    <p className="eyebrow">{member.department}</p>
                    <h3>
                      {member.emoji} {member.name}
                    </h3>
                    <p className="cell-note">{member.title}</p>
                  </div>
                  <span className={`badge ${presenceClass(member.runtime?.status)}`}>{presenceLabel(member.runtime?.status)}</span>
                </div>

                <dl className="org-card-metrics">
                  <div>
                    <dt>Last seen</dt>
                    <dd>{formatMaybeDate(member.runtime?.lastSeen)}</dd>
                  </div>
                  <div>
                    <dt>Current model</dt>
                    <dd>{modelLabel(member)}</dd>
                  </div>
                  <div>
                    <dt>Board load</dt>
                    <dd>{boardLoadLabel(member)}</dd>
                  </div>
                </dl>

                <p className="muted">{member.recentActivitySummary}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="panel page-stack">
          <div className="section-split">
            <div>
              <p className="eyebrow">Human collaborators</p>
              <h3>Role details without fake OpenClaw state</h3>
              <p className="muted">Human cards never show AI heartbeat presence.</p>
            </div>
            <code>{payload.source.boardPath}</code>
          </div>

          <div className="org-member-grid human-grid">
            {humanMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                className={`org-member-card tone-human ${selectedMember?.id === member.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(member.id)}
              >
                <div className="section-split">
                  <div>
                    <p className="eyebrow">Human collaborator</p>
                    <h3>
                      {member.emoji} {member.name}
                    </h3>
                    <p className="cell-note">{member.title}</p>
                  </div>
                  <span className="badge neutral">Human role</span>
                </div>

                <dl className="org-card-metrics">
                  <div>
                    <dt>Board load</dt>
                    <dd>{boardLoadLabel(member)}</dd>
                  </div>
                  <div>
                    <dt>Standup mention</dt>
                    <dd>{member.standup.latestMention || "Unavailable"}</dd>
                  </div>
                </dl>

                <p className="muted">{member.humanActivitySummary || "No board or standup activity is available yet."}</p>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedMember ? <OrgMemberDetail member={selectedMember} latestStandup={payload.latestStandup} /> : null}
    </section>
  );
}

function OrgMemberDetail({ member, latestStandup }: { member: OrgMemberRecord; latestStandup: OrgPayload["latestStandup"] }) {
  return (
    <section className="panel org-detail-panel">
      <div className="section-split">
        <div>
          <p className="eyebrow">Org detail</p>
          <h3>
            {member.emoji} {member.name}
          </h3>
          <p className="muted">{member.title}</p>
        </div>
        <a className="secondary-button overview-link-button" href={orgMemberHref(member.id)}>
          Direct link
        </a>
      </div>

      <div className="summary-cards">
        <SummaryCard label="Department" value={member.department} />
        <SummaryCard label="Role" value={member.title} />
        <SummaryCard label="Open blockers" value={String(member.board.blocked)} tone={member.board.blocked ? "danger" : "neutral"} />
        <SummaryCard label="Board load" value={member.board.total ? `${member.board.total} tasks` : "No tasks"} />
      </div>

      <div className="org-detail-grid">
        <article className="list-card">
          <div className="section-split">
            <strong>Role / department</strong>
            <span className="badge neutral">{member.memberKind === "ai" ? "AI" : "Human"}</span>
          </div>
          <p className="muted">{member.roleSummary}</p>
          <dl className="lab-key-value compact-key-value">
            <div>
              <dt>Department</dt>
              <dd>{member.department}</dd>
            </div>
            <div>
              <dt>Latest board update</dt>
              <dd>{formatMaybeDate(member.board.latestUpdatedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="list-card">
          <div className="section-split">
            <strong>{member.memberKind === "ai" ? "Runtime state" : "Human activity"}</strong>
            {member.memberKind === "ai" ? (
              <span className={`badge ${presenceClass(member.runtime?.status)}`}>{presenceLabel(member.runtime?.status)}</span>
            ) : (
              <span className="badge neutral">No AI heartbeat</span>
            )}
          </div>

          {member.memberKind === "ai" ? (
            <>
              <dl className="lab-key-value compact-key-value">
                <div>
                  <dt>Last seen</dt>
                  <dd>{formatMaybeDate(member.runtime?.lastSeen)}</dd>
                </div>
                <div>
                  <dt>Current model</dt>
                  <dd>{modelLabel(member)}</dd>
                </div>
                <div>
                  <dt>Model source</dt>
                  <dd>{member.runtime?.modelSource || "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Agent id</dt>
                  <dd>{member.runtime?.agentId || "Unavailable"}</dd>
                </div>
              </dl>
              <p className="muted">{member.runtime?.detail || "Runtime evidence unavailable."}</p>
            </>
          ) : (
            <p className="muted">
              Runtime state is intentionally not derived from OpenClaw for human collaborators. Only board and standup evidence is shown.
            </p>
          )}
        </article>

        <article className="list-card">
          <div className="section-split">
            <strong>Current board load</strong>
            <a className="secondary-button overview-link-button" href="/#/command">
              Open board
            </a>
          </div>
          <div className="summary-cards small-summary-cards">
            <SummaryCard label="Open" value={String(member.board.open)} />
            <SummaryCard label="Active" value={String(member.board.active)} tone={member.board.active ? "success" : "neutral"} />
            <SummaryCard label="Ready" value={String(member.board.ready)} />
            <SummaryCard label="Review" value={String(member.board.review)} />
            <SummaryCard label="Shipped" value={String(member.board.shipped)} tone={member.board.shipped ? "success" : "neutral"} />
            <SummaryCard
              label="Completion"
              value={member.board.completionRate == null ? "Unavailable" : `${member.board.completionRate}%`}
            />
          </div>
        </article>

        <article className="list-card">
          <div className="section-split">
            <strong>Latest standup mention</strong>
            <a className="secondary-button overview-link-button" href="/?knowledgeView=standups#/knowledge">
              Open transcript
            </a>
          </div>
          <p className="muted">{member.standup.latestMention || "Unavailable"}</p>
          <ul className="inline-list with-spacing">
            <li>{member.standup.latestStandupDate || "Date unavailable"}</li>
            <li>{member.standup.latestStandupStatus || "Status unavailable"}</li>
            <li>{member.standup.latestChiefStatus || "Chief status unavailable"}</li>
          </ul>
          {latestStandup?.decisions?.length ? (
            <div className="ref-row">
              {latestStandup.decisions.map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <section className="panel page-stack nested-panel">
        <div className="section-split">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h3>Most recent evidence across runtime, board, and standups</h3>
          </div>
          <span className="badge neutral">Real sources only</span>
        </div>

        {member.recentActivity.length ? (
          <div className="stack-list">
            {member.recentActivity.map((item) => (
              <ActivityRow item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <h3>No recent evidence</h3>
            <p className="muted">No runtime, board, or standup activity is currently available for this member.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function ActivityRow({ item }: { item: OrgActivityItem }) {
  return (
    <article className="list-card compact-activity-card">
      <div className="section-split">
        <div>
          <strong>{statusLabel(item.kind)}</strong>
          <p className="muted">{item.detail}</p>
        </div>
        <span className="badge neutral">{formatMaybeDate(item.timestamp)}</span>
      </div>
      <div className="ref-row">
        <code>{item.source}</code>
      </div>
      <a className="secondary-button overview-link-button" href={item.href}>
        Open source view
      </a>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "warning" | "neutral";
}) {
  return (
    <div className={`stat-card ${tone === "success" ? "success" : tone === "danger" ? "danger" : tone === "warning" ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
