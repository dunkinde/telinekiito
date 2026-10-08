// Sales: prospects found in public sources (lib/prospects.js) and the CRM of organisations (lib/crm.js).
// Owner and sales roles only.
import { call } from "./platform";

const enc = encodeURIComponent;

export type Priority = "high" | "medium" | "low" | "hold";
export type ProspectStatus = "new" | "researching" | "contacted" | "meeting" | "quoted" | "won" | "lost" | "not_relevant";
export type Timing = "upcoming" | "active" | "ending" | "ended" | "permit" | "started";
export type Relevance = "confirmed" | "likely" | "possible" | "unknown" | "unlikely";
export type Tier = "A" | "B" | "C" | "S" | "L";

export interface StreetPermit { id: string; address: string; start: string; end: string; status: string; text: string; timing: Timing }
export interface PermitNotice { id: string; address: string; operation: string; description: string; state: string; verdictAt: string | null; appealEnds: string | null }
export interface ProspectNote { id: string; at: string; by: string; text: string; status?: ProspectStatus }
export interface Evidence { url: string; title?: string; note: string; checked: string }
export interface Research { summary: string; scope?: string; timing?: string; buyer?: string; contactRoute?: string; question?: string; checked?: string; evidence?: Evidence[]; gaps?: string[];
  /** The same notes in Finnish. */
  fi?: Partial<Omit<Research, "fi" | "checked">> }
export interface Links { housingId?: string | null; managerId?: string | null; contractorId?: string | null; ownerId?: string | null }

export interface ProspectRow {
  id: string; tier: Tier; source: "ryhti" | "street" | "notice"; date: string; addresses: string[]; moreAddresses: number;
  priority: Priority; priorityAuto: Priority; score: number; relevance: Relevance; timing: Timing; start: string | null; end: string | null;
  scope: string[]; reasons: string[]; status: ProspectStatus; assigneeId: string | null; nextAction: string; nextDate: string | null;
  firstSeen: string; gone: boolean; built: number | null; apartments: number | null; buildings: number | null; floors: number | null; use: string; op: string;
  housingName: string; managerName: string; contact: "ready" | "name_only" | "missing"; research: { summary: string } | null; noteCount: number;
  links: Links; coords: [number, number] | null; managerPhone: string; managerEmail: string;
}
export interface Prospect extends Omit<ProspectRow, "research" | "noteCount" | "moreAddresses" | "managerPhone" | "managerEmail"> {
  property: string | null; permitIds: string[]; dvv: string[]; ops: string[]; protected: boolean; heritage: string[]; facade: string[]; started: boolean;
  street: StreetPermit[]; notices: PermitNotice[]; notes: ProspectNote[]; research: Research | null; lastSeen: string; priorityOverride: Priority | null;
  prh?: { name?: string; businessId?: string; manager?: string; managerSince?: string | null; certain?: boolean; none?: boolean; checkedAt?: string } | null;
}
export interface SourceStatus { key: "ryhti" | "street" | "notices" | "prh"; everyHours: number; lastRun: string | null; lastOk: string | null; ok: boolean; error: string | null; count: number | null; running: boolean; next: string | null }
export interface SyncStatus { enabled: boolean; since: string; running: boolean; lastBuild: { at: string; total: number; added: number } | null; sources: SourceStatus[] }
export interface SalesPerson { id: string; name: string; role: string }

export type OrgType = "property_manager" | "housing_company" | "contractor" | "developer" | "public_owner" | "client" | "partner" | "other";
export type OrgStage = "none" | "prospect" | "contacted" | "active" | "partner" | "inactive";
export interface OrgContact { id: string; name: string; role: string; email: string; phone: string; note: string; primary: boolean }
export interface OrgActivity { id: string; at: string; by: string; text: string }
export interface Org {
  id: string; type: OrgType; name: string; businessId: string; website: string; email: string; phone: string; address: string; notes: string;
  stage: OrgStage; tags: string[]; contacts: OrgContact[]; related: string[]; accountId: string | null; activity: OrgActivity[]; source: string; updatedAt: string;
}
export interface OrgRow { id: string; type: OrgType; name: string; businessId: string; email: string; phone: string; website: string; stage: OrgStage; tags: string[]; source: string; contacts: number; prospects: number; updatedAt: string; accountId: string | null }

export const getProspects = () => call<{ prospects: ProspectRow[]; sync: SyncStatus; staff: SalesPerson[]; statuses: ProspectStatus[] }>("GET", "/api/office/prospects");
export const getProspect = (id: string) =>
  call<{ prospect: Prospect; orgs: { housing: Org | null; manager: Org | null; contractor: Org | null; owner: Org | null }; staff: SalesPerson[]; statuses: ProspectStatus[] }>("GET", `/api/office/prospects/${enc(id)}`);
export const updateProspect = (id: string, body: Partial<{ status: ProspectStatus; assigneeId: string | null; nextAction: string; nextDate: string | null; priorityOverride: Priority | null; links: Links; note: string }>) =>
  call<{ prospect: Prospect }>("PATCH", `/api/office/prospects/${enc(id)}`, body);
export const runProspectSync = (source: "all" | SourceStatus["key"] = "all") => call<SyncStatus>("POST", "/api/office/prospects/sync", { source });
export const prospectSettings = (body: { enabled?: boolean; since?: string }) => call<SyncStatus>("PATCH", "/api/office/prospects/settings", body);

export const getOrgs = () => call<{ orgs: OrgRow[]; types: OrgType[]; stages: OrgStage[]; accounts: { id: string; name: string }[] }>("GET", "/api/office/crm/orgs");
export const getOrg = (id: string) => call<{ org: Org; related: { id: string; name: string; type: OrgType }[]; prospects: ProspectRow[] }>("GET", `/api/office/crm/orgs/${enc(id)}`);
export const saveOrg = (body: Partial<Org>, id?: string) => (id ? call<{ org: Org }>("PATCH", `/api/office/crm/orgs/${enc(id)}`, body) : call<{ org: Org }>("POST", "/api/office/crm/orgs", body));
export const removeOrg = (id: string) => call<{ ok: boolean }>("DELETE", `/api/office/crm/orgs/${enc(id)}`);
export const saveOrgContact = (orgId: string, body: Partial<OrgContact>, id?: string) =>
  id ? call<{ org: Org }>("PATCH", `/api/office/crm/orgs/${enc(orgId)}/contacts/${enc(id)}`, body) : call<{ org: Org }>("POST", `/api/office/crm/orgs/${enc(orgId)}/contacts`, body);
export const removeOrgContact = (orgId: string, id: string) => call<{ org: Org }>("DELETE", `/api/office/crm/orgs/${enc(orgId)}/contacts/${enc(id)}`);
export const addOrgActivity = (orgId: string, text: string) => call<{ org: Org }>("POST", `/api/office/crm/orgs/${enc(orgId)}/activity`, { text });
