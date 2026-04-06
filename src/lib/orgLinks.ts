export const ORG_MEMBER_QUERY_KEY = "orgMember";

export function orgMemberHref(memberId: string) {
  if (typeof window === "undefined") {
    return `/?${ORG_MEMBER_QUERY_KEY}=${encodeURIComponent(memberId)}#/org-chart`;
  }

  const params = new URLSearchParams(window.location.search);
  params.set(ORG_MEMBER_QUERY_KEY, memberId);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}#/org-chart`;
}

export function readOrgMemberFromLocation() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(ORG_MEMBER_QUERY_KEY);
}

export function replaceOrgMemberInLocation(memberId: string | null) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (memberId) {
    params.set(ORG_MEMBER_QUERY_KEY, memberId);
  } else {
    params.delete(ORG_MEMBER_QUERY_KEY);
  }
  const query = params.toString();
  const hash = window.location.hash || "#/org-chart";
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${hash}`);
}
