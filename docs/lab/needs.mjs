/**
 * Ground-truthed needs for retrieval experiments against corpus.mjs.
 * Each need: the DRAFT_TOOL `need` string an agent would plausibly send.
 *  - primary: the best answer(s) — MRR is computed against these.
 *  - acceptable: any defensible answer — hit@k is computed against these
 *    (always a superset of primary).
 *  - style: paraphrase | terse | verbose | typo | trap | cross-server |
 *    zero-overlap | non-english. "trap" = misleading lexical overlap with a
 *    WRONG tool; ground truth is human judgment and fallible — verifiers
 *    should sanity-check it before condemning the router.
 */

const N = (need, style, primary, acceptable = []) => ({
  need,
  style,
  primary,
  acceptable: [...new Set([...primary, ...acceptable])],
});

export const NEEDS = [
  // memory
  N("remember that the user prefers dark mode", "paraphrase", ["memory__add_observations", "memory__create_entities"]),
  N("what do we already know about this person", "zero-overlap", ["memory__search_nodes"], ["memory__open_nodes", "memory__read_graph"]),
  N("save a fact about the user so future sessions can recall it", "paraphrase", ["memory__create_entities", "memory__add_observations"]),
  N("link these two concepts together in the knowledge base", "paraphrase", ["memory__create_relations"]),
  N("forget everything we stored about acme corp", "paraphrase", ["memory__delete_entities"], ["memory__delete_observations"]),
  N("Persist the following durable preference so that any future conversation can retrieve it without the user restating it: the user's timezone is America/Toronto", "verbose", ["memory__add_observations", "memory__create_entities"]),
  // filesystem
  N("show me what's inside config.yaml", "paraphrase", ["fs__read_text_file"], ["fs__read_file", "fs__read_multiple_files"]),
  N("make a folder for the build artifacts", "paraphrase", ["fs__create_directory"]),
  N("find every markdown file in the project", "paraphrase", ["fs__search_files"], ["fs__directory_tree"]),
  N("rename report.txt to final-report.txt", "paraphrase", ["fs__move_file"]),
  N("how big is that log file", "zero-overlap", ["fs__get_file_info"], ["fs__list_directory_with_sizes"]),
  N("append a line to my notes file", "paraphrase", ["fs__edit_file"], ["fs__write_file"]),
  N("which directories am i allowed to touch", "paraphrase", ["fs__list_allowed_directories"]),
  // github
  N("open a pull request with my changes", "terse", ["github__create_pull_request"]),
  N("file a bug report on the upstream repo", "paraphrase", ["github__create_issue"], ["linear__linear_create_issue"]),
  N("who changed this file recently", "cross-server", ["github__list_commits", "git__git_log"]),
  N("find repositories about vector databases", "terse", ["github__search_repositories"]),
  N("merge that approved pull request", "terse", ["github__merge_pull_request"]),
  N("leave a comment on issue 42", "terse", ["github__add_issue_comment"], ["linear__linear_create_comment"]),
  N("grab the raw contents of the README from the remote repo", "trap", ["github__get_file_contents"], ["fs__read_text_file", "fs__read_file"]),
  N("which files did that pull request touch", "paraphrase", ["github__get_pull_request_files"]),
  // git
  N("commit my staged changes with a message", "terse", ["git__git_commit"]),
  N("what's changed since my last commit", "paraphrase", ["git__git_diff_unstaged"], ["git__git_status", "git__git_diff"]),
  N("start a new branch for the hotfix", "cross-server", ["git__git_create_branch", "github__create_branch"]),
  N("show me this repo's history", "paraphrase", ["git__git_log"], ["github__list_commits"]),
  N("unstage everything i added", "paraphrase", ["git__git_reset"]),
  // slack
  N("post an update to the team channel", "paraphrase", ["slack__slack_post_message"]),
  N("read the room before replying", "trap", ["slack__slack_get_channel_history"], ["slack__slack_get_thread_replies"]),
  N("react with a thumbs up to that message", "paraphrase", ["slack__slack_add_reaction"]),
  N("who is in this workspace", "terse", ["slack__slack_get_users"]),
  N("reply inside the thread, not the main channel", "paraphrase", ["slack__slack_reply_to_thread"]),
  // browser (cross-server: playwright + puppeteer both defensible)
  N("take a screenshot of the current page", "cross-server", ["playwright__browser_take_screenshot", "puppeteer__puppeteer_screenshot"]),
  N("go to the pricing page", "zero-overlap", ["playwright__browser_navigate", "puppeteer__puppeteer_navigate"]),
  N("click the submit button", "terse", ["playwright__browser_click", "puppeteer__puppeteer_click"]),
  N("type my email into the signup form", "cross-server", ["playwright__browser_type", "puppeteer__puppeteer_fill"], ["playwright__browser_fill_form"]),
  N("what does this page look like to a screen reader", "paraphrase", ["playwright__browser_snapshot"]),
  N("run some javascript on the page and give me the result", "paraphrase", ["playwright__browser_evaluate", "puppeteer__puppeteer_evaluate"]),
  N("close the extra browser tabs", "terse", ["playwright__browser_tabs"], ["playwright__browser_close"]),
  N("upload my resume through the file picker on the page", "paraphrase", ["playwright__browser_file_upload"]),
  N("what errors showed up in the browser console", "paraphrase", ["playwright__browser_console_messages"]),
  // web search / fetch / crawl
  N("search the web for the latest node lts version", "terse", ["brave__brave_web_search", "exa__web_search_exa"], ["firecrawl__firecrawl_search"]),
  N("pull the text content of that url", "paraphrase", ["fetch__fetch", "firecrawl__firecrawl_scrape"], ["exa__crawling_exa"]),
  N("crawl the whole documentation site", "terse", ["firecrawl__firecrawl_crawl"], ["firecrawl__firecrawl_map"]),
  N("good coffee shops near me", "zero-overlap", ["brave__brave_local_search"]),
  N("serach for recent security advisores about openssl", "typo", ["brave__brave_web_search", "exa__web_search_exa"], ["firecrawl__firecrawl_search"]),
  N("which urls exist on that website", "paraphrase", ["firecrawl__firecrawl_map"], ["firecrawl__firecrawl_crawl"]),
  N("extract product names and prices from these pages as json", "paraphrase", ["firecrawl__firecrawl_extract"]),
  N("I'm orchestrating a research task and need the raw contents of several web pages for offline parsing, ideally with minimal fuss", "verbose", ["fetch__fetch", "firecrawl__firecrawl_scrape"], ["exa__crawling_exa", "firecrawl__firecrawl_crawl"]),
  // databases
  N("how many users signed up last week", "zero-overlap", ["sqlite__read_query", "postgres__query"]),
  N("add a table for invoices", "terse", ["sqlite__create_table"], ["sqlite__write_query"]),
  N("what tables exist in this database", "paraphrase", ["sqlite__list_tables"], ["sqlite__describe_table"]),
  N("note this analytics insight down for the final report", "trap", ["sqlite__append_insight"], ["memory__add_observations"]),
  // time
  N("what time is it in tokyo right now", "paraphrase", ["time__get_current_time"]),
  N("convert 3pm eastern to london time", "paraphrase", ["time__convert_time"]),
  // gdrive / sentry / notion / linear
  N("find the quarterly planning doc in drive", "paraphrase", ["gdrive__gdrive_search"], ["gdrive__gdrive_read_file"]),
  N("show me the stack trace for that production error", "zero-overlap", ["sentry__get_sentry_issue"]),
  N("add the meeting notes to our workspace wiki", "zero-overlap", ["notion__notion_create_pages"], ["notion__notion_update_page"]),
  N("find the product roadmap page in notion", "terse", ["notion__notion_search"], ["notion__notion_fetch"]),
  N("create a ticket for the login bug", "paraphrase", ["linear__linear_create_issue"], ["github__create_issue"]),
  N("what's on my plate this sprint", "zero-overlap", ["linear__linear_list_issues"]),
  // misc / traps
  N("think through this problem step by step before acting", "paraphrase", ["seq__sequentialthinking"]),
  N("echo back exactly what i send you", "terse", ["everything__echo"]),
  N("add 3 and 4", "trap", ["everything__add"]),
  N("wait a while and then finish", "trap", ["everything__longRunningOperation"], ["playwright__browser_wait_for"]),
  // non-english (known tokenizer gap — measure, don't hide)
  N("lis le contenu du fichier readme", "non-english", ["fs__read_text_file"], ["fs__read_file"]),
  N("在网上搜索最新的AI新闻", "non-english", ["brave__brave_web_search", "exa__web_search_exa"]),
];
