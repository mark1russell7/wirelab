/**
 * The sweep of our items upstream. The script finds each issue and pull request that we opened or commented on in a
 * repository of others. It then lists each post that waits for a reply from us: a comment or a review in the
 * conversation, and each open review thread. A post waits when it is newer than our last post in the same place.
 *
 * The script reads open items and items that changed in the last `--days` days, so a comment after a close is also
 * found. It skips the repositories where we can write, and it skips bots unless you give `--bots`.
 *
 * The GitHub token comes from `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token`. The requests go through the REST client of
 * `@procedures/gh`, which keeps the limits of the GitHub API.
 *
 * Start: `node scripts/sweep.ts [--me=<login>] [--days=<count>] [--seen=<file>] [--bots] [--json] [--check]`
 *
 * The file of `--seen` is a JSON array of the URLs of posts that need no reply, for example a thank-you note. The
 * sweep does not show these posts.
 *
 * With `--check`, the exit code is 1 when a post waits for us.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRestClient } from "@procedures/gh";
import { arrayOf, booleanOf, numberOf, readRecord, recordOf, textOf, type Fields } from "@mark1russell7/optional/read";
import { errorMessage } from "@mark1russell7/text";

/** One post on GitHub: a comment, a review or a comment of a review thread. */
export interface Post {
  readonly author: string;
  readonly bot: boolean;
  readonly at: string;
  readonly url: string;
}

/** One review thread of a pull request. */
export interface Thread {
  readonly path: string;
  readonly resolved: boolean;
  readonly posts: readonly Post[];
}

/** One issue or pull request, with its posts. */
export interface Item {
  readonly kind: "issue" | "pr";
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: string;
  /** These posts are the comments and the reviews with a text in the conversation. */
  readonly conversation: readonly Post[];
  readonly threads: readonly Thread[];
}

/** One post that waits for a reply from us. */
export interface Wait {
  readonly item: Item;
  /** This text is `conversation`, or the file path of a review thread. */
  readonly where: string;
  readonly post: Post;
}

const isNewer = (a: Post, b: Post): boolean => Date.parse(a.at) > Date.parse(b.at);
const last = (posts: readonly Post[]): Post | undefined => posts.reduce<Post | undefined>((top, post) => (top === undefined || isNewer(post, top) ? post : top), undefined);

/**
 * This function gives the posts of an item that wait for us. A post of others waits when no post of ours in the same
 * place is newer. A post of ours in a thread does not answer the conversation, and the reverse is also true.
 */
export function waits(item: Item, me: ReadonlySet<string>, bots: boolean): Wait[] {
  const counts = (post: Post): boolean => me.has(post.author) || bots || !post.bot;
  const waiting = (posts: readonly Post[]): Post | undefined => {
    const top = last(posts.filter(counts));
    return top !== undefined && !me.has(top.author) ? top : undefined;
  };
  const found: Wait[] = [];
  const talk = waiting(item.conversation);
  if (talk !== undefined) found.push({ item, where: "conversation", post: talk });
  for (const thread of item.threads) {
    if (thread.resolved) continue;
    const post = waiting(thread.posts);
    if (post !== undefined) found.push({ item, where: thread.path, post });
  }
  return found;
}

const QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 20, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on Issue {
        number title url state
        repository { nameWithOwner viewerPermission }
        comments(last: 40) { nodes { author { login __typename } createdAt url } }
      }
      ... on PullRequest {
        number title url state
        repository { nameWithOwner viewerPermission }
        comments(last: 40) { nodes { author { login __typename } createdAt url } }
        reviews(last: 40) { nodes { author { login __typename } body submittedAt url } }
        reviewThreads(first: 60) { nodes { isResolved path comments(last: 30) { nodes { author { login __typename } createdAt url } } } }
      }
    }
  }
}`;

/** This function gives the text of a field, or an empty text. */
const text = (value: unknown, key: string): string => textOf(value, key) ?? "";
/** This function gives the nodes of a connection field. A null node (one that the token cannot read) is left out. */
const nodes = (value: unknown, key: string): readonly Fields[] =>
  (arrayOf(recordOf(value, key), "nodes", (node: unknown) => node) ?? []).flatMap((node): Fields[] => {
    const fields = readRecord(node);
    return fields === undefined ? [] : [fields];
  });

function post(raw: Fields, at: string): Post {
  const author = recordOf(raw, "author");
  const login = text(author, "login") || "ghost";
  return { author: login, bot: textOf(author, "__typename") === "Bot" || login.endsWith("[bot]"), at: text(raw, at), url: text(raw, "url") };
}

/** This function reads one node of the search. It gives `undefined` for a node of an other type. */
export function readItem(raw: Fields): Item | undefined {
  const type = textOf(raw, "__typename");
  const kind = type === "PullRequest" ? "pr" : type === "Issue" ? "issue" : undefined;
  if (kind === undefined) return undefined;
  const comments = nodes(raw, "comments").map((node) => post(node, "createdAt"));
  // A review with no text only holds the comments of its threads, so it is not a post of the conversation
  const reviews = nodes(raw, "reviews")
    .filter((node) => text(node, "body").trim() !== "")
    .map((node) => post(node, "submittedAt"));
  const threads = nodes(raw, "reviewThreads").map((node) => ({
    path: text(node, "path") || "(file)",
    resolved: booleanOf(node, "isResolved") === true,
    posts: nodes(node, "comments").map((comment) => post(comment, "createdAt")),
  }));
  return {
    kind,
    repo: text(recordOf(raw, "repository"), "nameWithOwner"),
    number: numberOf(raw, "number") ?? 0,
    title: text(raw, "title"),
    url: text(raw, "url"),
    state: text(raw, "state"),
    conversation: [...comments, ...reviews],
    threads,
  };
}

const option = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

function token(): string {
  const fromEnv = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}

async function main(): Promise<number> {
  const me = option("me") ?? "mark1russell7";
  const days = Number(option("days") ?? "7");
  if (!/^[A-Za-z0-9-]+$/.test(me) || !Number.isSafeInteger(days) || days < 0) {
    console.error("The option --me is not a GitHub login, or --days is not a whole number of 0 or more.");
    return 2;
  }
  const seenFile = option("seen");
  const seen = new Set<string>(seenFile === undefined ? [] : (JSON.parse(readFileSync(seenFile, "utf8")) as string[]));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const searches = [
    `author:${me} is:open is:public`,
    `commenter:${me} is:open is:public -author:${me}`,
    `involves:${me} is:closed is:public updated:>=${since}`,
  ];
  const client = createRestClient({ token });
  const signal = AbortSignal.timeout(300_000);
  const items = new Map<string, Item>();
  let hidden = 0;
  for (const q of searches) {
    let after: string | null = null;
    do {
      const answer = await client.request({ method: "POST", path: "/graphql", body: { query: QUERY, variables: { q, after } } }, signal);
      // A node that the token cannot read gives an error and a null node. The sweep counts it and reads the others
      const errors = (arrayOf(answer.body, "errors", (error: unknown) => error) ?? []).map((error) => readRecord(error) ?? {});
      const fatal = errors.filter((error) => textOf(error, "type") !== "FORBIDDEN" || booleanOf(recordOf(error, "extensions"), "saml_failure") !== true);
      const data = recordOf(answer.body, "data");
      if (answer.status !== 200 || fatal.length > 0 || data === undefined) {
        throw new Error(`The search "${q}" failed with the status ${answer.status}: ${JSON.stringify(answer.body)}`);
      }
      hidden += errors.length;
      const search = recordOf(data, "search");
      for (const raw of nodes(data, "search")) {
        // Our own repositories have their own review, so the sweep skips each repository where we can write
        const permission = text(recordOf(raw, "repository"), "viewerPermission");
        if (permission === "ADMIN" || permission === "MAINTAIN" || permission === "WRITE") continue;
        const item = readItem(raw);
        if (item !== undefined) items.set(item.url, item);
      }
      const page = recordOf(search, "pageInfo");
      after = booleanOf(page, "hasNextPage") === true ? text(page, "endCursor") : null;
    } while (after !== null);
  }

  const found = [...items.values()]
    .flatMap((item) => waits(item, new Set([me]), flag("bots")))
    .filter((wait) => !seen.has(wait.post.url))
    .sort((a, b) => Date.parse(a.post.at) - Date.parse(b.post.at));
  if (flag("json")) {
    console.log(JSON.stringify({ items: items.size, hidden, waits: found.map((w) => ({ item: w.item.url, kind: w.item.kind, state: w.item.state, title: w.item.title, where: w.where, ...w.post })) }, null, 2));
  } else {
    console.log(`${found.length} posts wait for us, in ${items.size} items upstream (open, or changed since ${since}).`);
    if (hidden > 0) console.log(`The token cannot read ${hidden} items, because their organization needs a SAML sign-in.`);
    let at = "";
    for (const wait of found.toSorted((a, b) => a.item.url.localeCompare(b.item.url))) {
      if (wait.item.url !== at) {
        at = wait.item.url;
        console.log(`\n${wait.item.repo}#${wait.item.number} (${wait.item.kind}, ${wait.item.state.toLowerCase()}) ${wait.item.title}`);
      }
      console.log(`  ${wait.where}: @${wait.post.author} ${wait.post.at} ${wait.post.url}`);
    }
  }
  return flag("check") && found.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(errorMessage(error));
      process.exitCode = 2;
    },
  );
}
