import path from "node:path";
import fs from "node:fs";
import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Forbidden script, executable, configuration, database, and backup file extensions
 * that should NEVER be served by the SPA fallback or fall through to index.html.
 */
export const FORBIDDEN_EXTENSIONS = new Set<string>([
  // PHP
  ".php", ".phtml", ".php3", ".php4", ".php5", ".php7", ".phps",
  // ASP / .NET
  ".asp", ".aspx", ".axd", ".ashx", ".asmx",
  // Java
  ".jsp", ".jspx", ".do", ".action",
  // Scripts / Executables
  ".cgi", ".pl", ".py", ".sh", ".bash", ".rb", ".exe", ".bat", ".cmd", ".dll",
  // Config / Sensitive / Backups / Dumps
  ".env", ".ini", ".conf", ".config", ".yml", ".yaml",
  ".sql", ".db", ".sqlite", ".sqlite3",
  ".bak", ".old", ".swp", ".orig", ".save", ".tmp", ".dist",
  // XML probes (unless a specific static xml file exists on disk)
  ".xml",
]);

/**
 * Common vulnerability scanner, CMS, and framework probe patterns.
 */
export const SCANNER_PROBE_PATTERNS: RegExp[] = [
  // WordPress probes (xmlrpc.php, wp-*, wlwmanifest.xml)
  /(?:^|\/)xmlrpc\.php$/i,
  /(?:^|\/)wp-(?:admin|includes|content|login|config|json|cron|trackback|activate|signup|comments)(?:$|\/)/i,
  /\/wlwmanifest\.xml$/i,
  // Sensitive dotfiles and directories (except .well-known and .vite)
  /(?:^|\/)\.(?!(?:well-known|vite)(?:$|\/))/i,
  // Common CMS & Database Admin probes
  /(?:^|\/)(?:phpmyadmin|pma|adminer|webfig|cgi-bin|solr|actuator|telescope)(?:$|\/)/i,
  // System paths, /etc/passwd, /proc, /sys, /windows, traversal
  /(?:^|\/)(?:etc|proc|sys|root|windows|winnt|system32)(?:$|\/)/i,
  // Container, cluster & server infrastructure files
  /(?:^|\/)(?:dockerfile|docker-compose|kubeconfig|web\.xml)(?:$|\/)/i,
  // Server diagnostics, profilers & mod_status probes
  /(?:^|\/)(?:phpinfo|_profiler|server-status|server-info|_cat|_ignition|awstats)(?:$|\/)/i,
  // Scanner targets without extension
  /(?:^|\/)(?:credentials|secrets|v2\/_catalog)(?:$|\/)/i,
  // Honeypot CMS / common web shell prefixes
  /(?:^|\/)(?:wbm|cfide|xwiki|phpunit|laravel-filemanager)(?:$|\/)/i,
  // External administrative scan wordlists (Turkish & generic bot probes not used in NexusNode IoT)
  /(?:^|\/)(?:mudur|yonetici|yonetim|administrator|kontrol|cp|uyegirisi)(?:$|\/)/i,
  // Generic CMS/blog honeypots
  /(?:^|\/)(?:wordpress|wp)(?:$|\/)/i,
];

/**
 * Safely decodes and normalizes a URL pathname for routing inspection.
 */
export function normalizePathname(urlPath: string): string {
  // Treat input as a request-target PATH, never as a URL. In particular,
  // new URL("//xmlrpc.php", base) treats xmlrpc.php as a hostname.
  let pathname = urlPath.split(/[?#]/, 1)[0];
  try {
    // Decode nested percent encoding used by scanners (%252e -> %2e -> .).
    // A fixed bound avoids unbounded work on hostile input.
    for (let i = 0; i < 3; i++) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    }
  } catch {
    // Fail closed for malformed percent escapes.
    return "/.invalid-encoded-path";
  }

  pathname = pathname.replace(/[\\\\]/g, "/").replace(/\/+/g, "/");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  // Collapse dot segments so encoded traversal cannot hide probe paths.
  return path.posix.normalize(pathname);
}

/**
 * Determines if a request path matches known scanner, WordPress, or probe patterns.
 */
export function isScannerOrProbingPath(rawPath: string): boolean {
  if (!rawPath || typeof rawPath !== "string") return false;

  const pathname = normalizePathname(rawPath);

  // Allow explicit legitimate root assets
  if (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/site.webmanifest" ||
    pathname.startsWith("/logos/")
  ) {
    return false;
  }

  // 0. Check for directory traversal or escape characters in raw input
  if (
    rawPath.includes("..") ||
    rawPath.includes("%2e%2e") ||
    rawPath.includes("%2E%2E") ||
    rawPath.includes("%5c") ||
    rawPath.includes("%5C")
  ) {
    return true;
  }

  // Check query string for common injection / traversal attacks
  const queryIndex = rawPath.indexOf("?");
  if (queryIndex !== -1) {
    const queryString = rawPath.slice(queryIndex);
    if (/etc\/passwd|win\.ini|println|groovy|eval-stdin/i.test(queryString)) {
      return true;
    }
  }

  // 1. Check scanner probe regexes
  for (const pattern of SCANNER_PROBE_PATTERNS) {
    if (pattern.test(pathname)) {
      return true;
    }
  }

  // 2. Check forbidden script/backup/config extensions
  const ext = path.posix.extname(pathname).toLowerCase();
  if (ext && FORBIDDEN_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

/**
 * Determines whether an incoming request represents a valid Single Page Application (SPA)
 * route eligible to receive the index.html fallback.
 */
export function isCandidateSpaRoute(req: Request): boolean {
  // SPA fallback only serves GET and HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  const raw = req.originalUrl || req.url || req.path || "/";
  if (isScannerOrProbingPath(raw)) {
    return false;
  }

  const pathname = normalizePathname(req.path || req.url || "/");

  // Must not be an API endpoint
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return false;
  }

  // Legitimate SPA routes have NO file extension (e.g., "/", "/dashboard", "/devices", "/login")
  // or explicitly request "/index.html"
  const ext = path.posix.extname(pathname);
  if (ext === "" || pathname === "/index.html") {
    return true;
  }

  return false;
}

/**
 * Middleware that blocks scanner and probe requests with HTTP 404 before
 * they reach Vite dev server or static file handlers.
 */
export const spaRouteGuardMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const pathname = req.path || req.url || "/";

  // Allow Vite internal dev server requests (/@vite, /@fs, /@id, /.vite/) to pass through untouched
  if (pathname.startsWith("/@") || pathname.includes("/.vite/")) {
    return next();
  }

  const raw = req.originalUrl || req.url || pathname;
  if (isScannerOrProbingPath(raw)) {
    return res.status(404).type("text/plain").send("Not Found");
  }

  next();
};

/**
 * Creates the production SPA fallback handler that serves index.html ONLY for
 * genuine SPA page routes and returns HTTP 404 for missing static files with extensions.
 */
export function createSpaFallbackHandler(distPath: string): RequestHandler {
  const indexHtmlPath = path.join(distPath, "index.html");
  return (req: Request, res: Response) => {
    if (!isCandidateSpaRoute(req)) {
      return res.status(404).type("text/plain").send("Not Found");
    }
    if (fs.existsSync(indexHtmlPath)) {
      return res.sendFile(indexHtmlPath);
    }
    return res.status(404).type("text/plain").send("Not Found");
  };
}
