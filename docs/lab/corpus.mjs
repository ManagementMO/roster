/**
 * Shared experiment corpus: 133 tool cards across 20 sources, modeled on real
 * public MCP servers (names real; descriptions faithful one-liners that may
 * lag upstream). This is an INPUT dataset for retrieval/routing experiments —
 * not a measurement. Every lab experiment should draft against this corpus so
 * results are comparable across agents.
 */

const T = (source, name, description) => ({
  id: `${source}__${name}`,
  source,
  name,
  description,
  kind: "tool",
  inputSchema: { type: "object" },
});

export const TOOLS = [
  // @modelcontextprotocol/server-filesystem
  T("fs", "read_file", "Read the complete contents of a file from the file system (deprecated in favor of read_text_file)"),
  T("fs", "read_text_file", "Read the complete contents of a file from the file system as text"),
  T("fs", "read_media_file", "Read an image or audio file and return base64 data with MIME type"),
  T("fs", "read_multiple_files", "Read the contents of multiple files simultaneously"),
  T("fs", "write_file", "Create a new file or completely overwrite an existing file with new content"),
  T("fs", "edit_file", "Make line-based edits to a text file, returning a git-style diff"),
  T("fs", "create_directory", "Create a new directory or ensure a directory exists"),
  T("fs", "list_directory", "Get a detailed listing of all files and directories in a specified path"),
  T("fs", "list_directory_with_sizes", "Get a detailed listing of files and directories in a specified path including sizes"),
  T("fs", "directory_tree", "Get a recursive tree view of files and directories as a JSON structure"),
  T("fs", "move_file", "Move or rename files and directories"),
  T("fs", "search_files", "Recursively search for files and directories matching a pattern"),
  T("fs", "get_file_info", "Retrieve detailed metadata about a file or directory"),
  T("fs", "list_allowed_directories", "Returns the list of directories that this server is allowed to access"),
  // @modelcontextprotocol/server-memory
  T("memory", "create_entities", "Create multiple new entities in the knowledge graph"),
  T("memory", "create_relations", "Create multiple new relations between entities in the knowledge graph"),
  T("memory", "add_observations", "Add new observations to existing entities in the knowledge graph"),
  T("memory", "delete_entities", "Delete multiple entities and their associated relations from the knowledge graph"),
  T("memory", "delete_observations", "Delete specific observations from entities in the knowledge graph"),
  T("memory", "delete_relations", "Delete multiple relations from the knowledge graph"),
  T("memory", "read_graph", "Read the entire knowledge graph"),
  T("memory", "search_nodes", "Search for nodes in the knowledge graph based on a query"),
  T("memory", "open_nodes", "Open specific nodes in the knowledge graph by their names"),
  // github MCP server
  T("github", "create_or_update_file", "Create or update a single file in a GitHub repository"),
  T("github", "search_repositories", "Search for GitHub repositories"),
  T("github", "create_repository", "Create a new GitHub repository in your account"),
  T("github", "get_file_contents", "Get the contents of a file or directory from a GitHub repository"),
  T("github", "push_files", "Push multiple files to a GitHub repository in a single commit"),
  T("github", "create_issue", "Create a new issue in a GitHub repository"),
  T("github", "create_pull_request", "Create a new pull request in a GitHub repository"),
  T("github", "fork_repository", "Fork a GitHub repository to your account or specified organization"),
  T("github", "create_branch", "Create a new branch in a GitHub repository"),
  T("github", "list_commits", "Get list of commits of a branch in a GitHub repository"),
  T("github", "list_issues", "List issues in a GitHub repository with filtering options"),
  T("github", "update_issue", "Update an existing issue in a GitHub repository"),
  T("github", "add_issue_comment", "Add a comment to an existing issue"),
  T("github", "search_code", "Search for code across GitHub repositories"),
  T("github", "search_issues", "Search for issues and pull requests across GitHub repositories"),
  T("github", "search_users", "Search for users on GitHub"),
  T("github", "get_issue", "Get details of a specific issue in a GitHub repository"),
  T("github", "get_pull_request", "Get details of a specific pull request"),
  T("github", "list_pull_requests", "List and filter repository pull requests"),
  T("github", "merge_pull_request", "Merge a pull request"),
  T("github", "get_pull_request_files", "Get the list of files changed in a pull request"),
  T("github", "create_pull_request_review", "Create a review on a pull request"),
  // git MCP server
  T("git", "git_status", "Shows the working tree status"),
  T("git", "git_diff_unstaged", "Shows changes in the working directory that are not yet staged"),
  T("git", "git_diff_staged", "Shows changes that are staged for commit"),
  T("git", "git_diff", "Shows differences between branches or commits"),
  T("git", "git_commit", "Records changes to the repository"),
  T("git", "git_add", "Adds file contents to the staging area"),
  T("git", "git_reset", "Unstages all staged changes"),
  T("git", "git_log", "Shows the commit logs"),
  T("git", "git_create_branch", "Creates a new branch from an optional base branch"),
  T("git", "git_checkout", "Switches branches"),
  T("git", "git_show", "Shows the contents of a commit"),
  T("git", "git_init", "Initialize a new Git repository"),
  // slack MCP server
  T("slack", "slack_list_channels", "List public channels in the workspace with pagination"),
  T("slack", "slack_post_message", "Post a new message to a Slack channel"),
  T("slack", "slack_reply_to_thread", "Reply to a specific message thread in Slack"),
  T("slack", "slack_add_reaction", "Add a reaction emoji to a message"),
  T("slack", "slack_get_channel_history", "Get recent messages from a channel"),
  T("slack", "slack_get_thread_replies", "Get all replies in a message thread"),
  T("slack", "slack_get_users", "Get a list of all users in the workspace with their basic profile information"),
  T("slack", "slack_get_user_profile", "Get detailed profile information for a specific user"),
  // puppeteer MCP server
  T("puppeteer", "puppeteer_navigate", "Navigate to a URL in the browser"),
  T("puppeteer", "puppeteer_screenshot", "Take a screenshot of the current page or a specific element"),
  T("puppeteer", "puppeteer_click", "Click an element on the page"),
  T("puppeteer", "puppeteer_fill", "Fill out an input field"),
  T("puppeteer", "puppeteer_select", "Select an element on the page with a Select tag"),
  T("puppeteer", "puppeteer_hover", "Hover an element on the page"),
  T("puppeteer", "puppeteer_evaluate", "Execute JavaScript in the browser console"),
  // playwright MCP server
  T("playwright", "browser_navigate", "Navigate the browser to a URL"),
  T("playwright", "browser_navigate_back", "Go back to the previous page"),
  T("playwright", "browser_click", "Perform click on a web page element"),
  T("playwright", "browser_type", "Type text into an editable element"),
  T("playwright", "browser_snapshot", "Capture accessibility snapshot of the current page, better than screenshot for reading structure"),
  T("playwright", "browser_take_screenshot", "Take a screenshot of the current page viewport or a specific element"),
  T("playwright", "browser_press_key", "Press a key on the keyboard"),
  T("playwright", "browser_select_option", "Select an option in a dropdown"),
  T("playwright", "browser_hover", "Hover over an element on the page"),
  T("playwright", "browser_drag", "Perform drag and drop between two elements"),
  T("playwright", "browser_evaluate", "Evaluate a JavaScript expression on the page"),
  T("playwright", "browser_file_upload", "Upload one or multiple files through a file chooser"),
  T("playwright", "browser_fill_form", "Fill multiple form fields at once"),
  T("playwright", "browser_tabs", "List, create, close, or select a browser tab"),
  T("playwright", "browser_close", "Close the current page"),
  T("playwright", "browser_resize", "Resize the browser window"),
  T("playwright", "browser_console_messages", "Return all console messages from the page"),
  T("playwright", "browser_network_requests", "Return all network requests since loading the page"),
  T("playwright", "browser_wait_for", "Wait for text to appear or disappear or a specified time to pass"),
  T("playwright", "browser_handle_dialog", "Handle a browser dialog by accepting or dismissing it"),
  // brave-search MCP server
  T("brave", "brave_web_search", "Perform a web search using the Brave Search API for general queries, news, and articles"),
  T("brave", "brave_local_search", "Search for local businesses and places using Brave's Local Search API"),
  // fetch MCP server
  T("fetch", "fetch", "Fetch a URL from the internet and extract its contents as markdown"),
  // time MCP server
  T("time", "get_current_time", "Get current time in a specific timezone"),
  T("time", "convert_time", "Convert time between timezones"),
  // sqlite MCP server
  T("sqlite", "read_query", "Execute a SELECT query on the SQLite database"),
  T("sqlite", "write_query", "Execute an INSERT, UPDATE, or DELETE query on the SQLite database"),
  T("sqlite", "create_table", "Create a new table in the SQLite database"),
  T("sqlite", "list_tables", "List all tables in the SQLite database"),
  T("sqlite", "describe_table", "Get the schema information for a specific table"),
  T("sqlite", "append_insight", "Add a business insight to the memo for the analysis report"),
  // postgres MCP server
  T("postgres", "query", "Run a read-only SQL query against the PostgreSQL database"),
  // gdrive MCP server
  T("gdrive", "gdrive_search", "Search for files in Google Drive"),
  T("gdrive", "gdrive_read_file", "Read the contents of a file from Google Drive"),
  // sentry MCP server
  T("sentry", "get_sentry_issue", "Retrieve and analyze a Sentry issue by ID or URL, including stacktrace and error details"),
  // everything (reference/test) MCP server
  T("everything", "echo", "Echoes back the input message"),
  T("everything", "add", "Adds two numbers together"),
  T("everything", "printEnv", "Prints all environment variables"),
  T("everything", "longRunningOperation", "Demonstrates a long running operation with progress updates"),
  T("everything", "sampleLLM", "Samples from an LLM using the client's sampling feature"),
  T("everything", "getTinyImage", "Returns a tiny test image"),
  // sequential-thinking MCP server
  T("seq", "sequentialthinking", "A detailed tool for dynamic and reflective problem-solving through a sequence of revisable thoughts"),
  // notion MCP server
  T("notion", "notion_search", "Search across the Notion workspace for pages and databases"),
  T("notion", "notion_fetch", "Fetch a Notion page or database by URL or ID"),
  T("notion", "notion_create_pages", "Create one or more new pages in the Notion workspace"),
  T("notion", "notion_update_page", "Update the properties or content of an existing Notion page"),
  T("notion", "notion_move_pages", "Move pages to a new parent in the workspace"),
  T("notion", "notion_create_database", "Create a new database with a defined schema"),
  // linear MCP server
  T("linear", "linear_list_issues", "List issues in the Linear workspace with optional filters"),
  T("linear", "linear_get_issue", "Get detailed information about a specific Linear issue"),
  T("linear", "linear_create_issue", "Create a new issue in a Linear team"),
  T("linear", "linear_update_issue", "Update fields of an existing Linear issue"),
  T("linear", "linear_list_projects", "List projects in the Linear workspace"),
  T("linear", "linear_create_comment", "Add a comment to a Linear issue"),
  // exa MCP server
  T("exa", "web_search_exa", "Search the web using Exa's neural search and return relevant results with content"),
  T("exa", "crawling_exa", "Extract the full content of a specific URL using Exa"),
  // firecrawl MCP server
  T("firecrawl", "firecrawl_scrape", "Scrape a single webpage and return its content as markdown"),
  T("firecrawl", "firecrawl_map", "Map a website to discover all indexed URLs on the site"),
  T("firecrawl", "firecrawl_crawl", "Crawl an entire website and return content from all pages"),
  T("firecrawl", "firecrawl_search", "Search the web and optionally scrape the top results"),
  T("firecrawl", "firecrawl_extract", "Extract structured data from webpages using an LLM schema"),
];

export const TOOL_IDS = new Set(TOOLS.map((t) => t.id));
if (TOOL_IDS.size !== TOOLS.length) throw new Error("corpus has duplicate tool ids");
