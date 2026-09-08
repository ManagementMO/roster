export interface DemoCapability {
  id: string;
  kind: "tool" | "skill";
  label: string;
  provider: string;
  icon: string;
  color: "blue" | "teal" | "gold" | "violet" | "cyan";
  description: string;
  reason: string;
  args: Record<string, unknown>;
  resultTitle: string;
  result: string;
  resources?: string[];
  outcomeNote: string;
}

const toolOutcome = "A call-level success, not proof that the checkout is fixed. Derived evidence informs later local maintenance.";
const skillOutcome = "Instructions returned; excluded from ratings. Delivery is not evidence that the skill completed the task.";

export const capabilities: Record<string, DemoCapability> = Object.fromEntries(([
  {
    id: "playwright__browser_snapshot", kind: "tool", label: "Inspect page", provider: "Playwright", icon: "playwright", color: "teal",
    description: "Read the page as an accessibility snapshot.",
    reason: "See what the checkout exposes to the browser before guessing at a fix.",
    args: {}, resultTitle: "Checkout snapshot returned",
    result: 'Page: Checkout\n\nHeading “Your order”\nTextbox “Email address”\nButton “Pay now” [disabled]\nText “Enter an email to continue”', outcomeNote: toolOutcome,
  },
  {
    id: "github__search_code", kind: "tool", label: "Search code", provider: "GitHub", icon: "github", color: "blue",
    description: "Find the code behind the checkout.",
    reason: "Locate the checkout component and its submit handler in the example repository.",
    args: { query: "repo:example/shop CheckoutForm" }, resultTitle: "Matching source locations",
    result: "src/checkout/CheckoutForm.tsx\n  export function CheckoutForm()\n\nsrc/checkout/useCheckout.ts\n  export function useCheckout()\n\nsrc/checkout/CheckoutForm.test.tsx\n  requires an email before payment", outcomeNote: toolOutcome,
  },
  {
    id: "filesystem__read_text_file", kind: "tool", label: "Read files", provider: "Filesystem", icon: "folder", color: "gold",
    description: "Read a source file from the local project.",
    reason: "Inspect the actual condition behind the disabled button, without changing the file.",
    args: { path: "/example/shop/src/checkout/CheckoutForm.tsx" }, resultTitle: "Source excerpt returned",
    result: "const canSubmit = email.trim().length > 0;\n\n<button\n  disabled={!canSubmit}\n  onClick={submitOrder}\n>\n  Pay now\n</button>", outcomeNote: toolOutcome,
  },
  {
    id: "linear__list_issues", kind: "tool", label: "Find issues", provider: "Linear", icon: "linear", color: "violet",
    description: "Look for related checkout reports.",
    reason: "Read the reported behavior before deciding whether the disabled state is a defect.",
    args: { query: "checkout disabled" }, resultTitle: "Related issue returned",
    result: "SHOP-24  Explain the disabled payment button\n\nThe button is disabled until an email is entered.\nThe message is easy to miss on small screens.\n\nStatus: Triage\nNo resolution recorded.", outcomeNote: toolOutcome,
  },
  {
    id: "skill__debug-workflow", kind: "skill", label: "Debug workflow", provider: "Playbook", icon: "list-check", color: "violet",
    description: "Use the project's investigation checklist.",
    reason: "Get a repeatable method for investigating the checkout. Your agent decides how to follow it.",
    args: {}, resultTitle: "Instructions, not execution",
    result: "1. Reproduce the reported behavior.\n2. Read the relevant code and tests.\n3. Separate observation from assumption.\n4. Propose a small change.\n5. Verify only what the checks establish.",
    resources: ["/example/skills/debug-workflow/references/checklist.md"], outcomeNote: skillOutcome,
  },
  {
    id: "filesystem__search_files", kind: "tool", label: "Find files", provider: "Filesystem", icon: "file-search", color: "gold",
    description: "Locate checkout files in the project.",
    reason: "Find likely implementation and test files without loading the whole repository.",
    args: { path: "/example/shop", pattern: "**/*Checkout*" }, resultTitle: "File matches returned",
    result: "/example/shop/src/checkout/CheckoutForm.tsx\n/example/shop/src/checkout/CheckoutForm.test.tsx\n/example/shop/src/checkout/useCheckout.ts", outcomeNote: toolOutcome,
  },
  {
    id: "memory__search_nodes", kind: "tool", label: "Recall context", provider: "Memory", icon: "database", color: "cyan",
    description: "Retrieve a saved project decision.",
    reason: "Check the existing rationale for requiring an email before submitting payment.",
    args: { query: "checkout email" }, resultTitle: "Project context returned",
    result: "Checkout decision\n\nRequire an email before submitting payment.\nShow a visible explanation beside the button.\n\nThis is stored context, not a fresh verification.", outcomeNote: toolOutcome,
  },
  {
    id: "skill__trace-a-change", kind: "skill", label: "Trace a change", provider: "Playbook", icon: "route", color: "blue",
    description: "Follow a behavior from UI to implementation.",
    reason: "Start from the observed behavior, trace the handler, then identify the right regression test.",
    args: {}, resultTitle: "A focused investigation guide",
    result: "1. Find the UI entry point.\n2. Follow the event handler.\n3. Read its validation conditions.\n4. Locate the test covering that behavior.\n5. Report source locations and open questions.",
    resources: ["/example/skills/trace-a-change/references/source-map.md"], outcomeNote: skillOutcome,
  },
  {
    id: "skill__project-guide", kind: "skill", label: "Project guide", provider: "Playbook", icon: "book-2", color: "blue",
    description: "Read the team's working instructions.",
    reason: "Understand the project's conventions before asking a tool to make changes.",
    args: {}, resultTitle: "Your project's instructions",
    result: "Use the existing component patterns.\nKeep changes inside the requested scope.\nAdd a regression test for changed behavior.\nRun the project's checks before review.\nDescribe anything you could not verify.",
    resources: ["/example/skills/project-guide/references/conventions.md", "/example/skills/project-guide/references/testing.md"], outcomeNote: skillOutcome,
  },
  {
    id: "github__get_file_contents", kind: "tool", label: "Read project docs", provider: "GitHub", icon: "github", color: "blue",
    description: "Read the repository's contributor guide.",
    reason: "Get instructions from the repository itself, rather than inferring its workflow.",
    args: { owner: "example", repo: "shop", path: "CONTRIBUTING.md" }, resultTitle: "Contributor guide returned",
    result: "Contributing to Shop\n\nKeep UI changes small and testable.\nPreserve keyboard and screen-reader behavior.\nUse the package manager declared by this repo.\nOpen a review with the checks you actually ran.", outcomeNote: toolOutcome,
  },
  {
    id: "skill__review-checklist", kind: "skill", label: "Review checklist", provider: "Playbook", icon: "checklist", color: "teal",
    description: "Get a concise pre-review checklist.",
    reason: "Prepare a clear verification plan. Receiving a checklist does not run those checks.",
    args: {}, resultTitle: "A checklist for your agent",
    result: "Confirm the requested behavior.\nReview the complete diff.\nCheck keyboard access and narrow screens.\nRun the relevant tests.\nReport results without inventing coverage.",
    resources: ["/example/skills/review-checklist/references/review.md"], outcomeNote: skillOutcome,
  },
  {
    id: "filesystem__directory_tree", kind: "tool", label: "Map the project", provider: "Filesystem", icon: "sitemap", color: "gold",
    description: "See how the source is organized.",
    reason: "Find the project's boundaries before choosing where a change should live.",
    args: { path: "/example/shop/src" }, resultTitle: "Project structure returned",
    result: "src/\n  checkout/\n    CheckoutForm.tsx\n    CheckoutForm.test.tsx\n    useCheckout.ts\n  components/\n  styles/", outcomeNote: toolOutcome,
  },
] satisfies DemoCapability[]).map((capability) => [capability.id, capability]));

export const presets = [
  { label: "Inspect checkout", need: "Understand why the checkout button is disabled", lineup: ["playwright__browser_snapshot", "github__search_code", "filesystem__read_text_file", "linear__list_issues", "skill__debug-workflow"] },
  { label: "Find the code", need: "Find the checkout implementation and its tests", lineup: ["github__search_code", "filesystem__search_files", "filesystem__read_text_file", "memory__search_nodes", "skill__trace-a-change"] },
  { label: "Read the playbook", need: "Read the project instructions before making a change", lineup: ["skill__project-guide", "github__get_file_contents", "filesystem__directory_tree", "skill__review-checklist", "filesystem__read_text_file"] },
] as const;

export interface DemoState { preset: number; selected: string; called: boolean }
export type DemoAction = { type: "preset"; index: number } | { type: "select"; id: string } | { type: "call" };
export const initialDemoState: DemoState = { preset: 0, selected: presets[0].lineup[0], called: false };

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "call") return { ...state, called: true };
  if (action.type === "preset") {
    const preset = presets[action.index];
    return preset ? { preset: action.index, selected: preset.lineup[0], called: false } : state;
  }
  const lineup: readonly string[] = presets[state.preset]?.lineup ?? [];
  return lineup.includes(action.id) ? { ...state, selected: action.id, called: false } : state;
}

export function exampleCall(state: DemoState) {
  return { tool: state.selected, args: capabilities[state.selected]!.args, draft_id: `d${state.preset + 1}` };
}
